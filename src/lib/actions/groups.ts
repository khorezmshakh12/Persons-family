'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { escapeTelegramText, sendTelegramMessageToMany } from '@/lib/telegram';
import { logSystemAction } from '@/lib/audit-log';
import { syncGroupChatMembers, deleteGroupChatMeta } from '@/lib/gcp/firestoreAdmin';
import { generateLessonSlotsForMonth } from '@/lib/lesson-generation';
import { currentMonthKey } from '@/lib/lesson-months';

export type GroupActionState = { error?: string; groupId?: string } | undefined;

// HH:MM, 24-hour — matches the <input type="time"> the form now uses.
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const configurationSchema = z.object({
  subject: z.string().trim().max(100).optional().or(z.literal('')),
  time: z.string().trim().regex(TIME_PATTERN).optional().or(z.literal('')),
  room: z.string().trim().max(100).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

const groupSchema = z.object({
  name: z.string().trim().min(1).max(200),
  // 'none' is the Select's sentinel value for "no TA assigned"/"no schedule
  // set yet" (Base UI's Select doesn't take a plain empty-string item value).
  assignedTaId: z.union([z.string().uuid(), z.literal('none'), z.literal('')]).optional(),
  scheduleType: z.union([z.enum(['odd', 'even']), z.literal('none'), z.literal('')]).optional(),
  courseName: z.string().trim().max(200).optional().or(z.literal('')),
  ...configurationSchema.shape,
});

const GROUP_LIMIT_PER_TEACHER = 50;

function normalizeScheduleType(value: string | undefined): 'odd' | 'even' | null {
  return value === 'odd' || value === 'even' ? value : null;
}

function buildConfiguration(data: z.infer<typeof configurationSchema>) {
  return {
    subject: data.subject || null,
    time: data.time || null,
    room: data.room || null,
    notes: data.notes || null,
  };
}

function normalizeAssignedTaId(value: string | undefined): string | null {
  return value && value !== 'none' ? value : null;
}

/** Defense in depth: nothing else checks that assigned_ta_id points at an
 * actual assistant, since that's a cross-table business rule rather than a
 * per-row ownership check. */
async function validateAssignedTa(assignedTaId: string): Promise<boolean> {
  const [row] = await sql<{ role: string }[]>`select role from profiles where id = ${assignedTaId}`;
  return row?.role === 'assistant';
}

export async function createGroupAction(
  _prevState: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile || profile.role !== 'teacher') return { error: 'forbidden' };

  const parsed = groupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const assignedTaId = normalizeAssignedTaId(parsed.data.assignedTaId);

  if (assignedTaId && !(await validateAssignedTa(assignedTaId))) {
    return { error: 'invalidInput' };
  }

  // Ported from the old enforce_group_limit_trigger (a DB trigger, not
  // RLS) — that trigger wasn't part of the table/data migration to Cloud
  // SQL, so the cap is re-enforced here instead.
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int from groups where teacher_id = ${user.id}`;
  if (count >= GROUP_LIMIT_PER_TEACHER) return { error: 'groupLimitReached' };

  let groupId: string;
  try {
    const [created] = await sql<{ id: string }[]>`
      insert into groups (teacher_id, name, assigned_ta_id, schedule_type, course_name, configuration)
      values (
        ${user.id}, ${parsed.data.name}, ${assignedTaId}, ${normalizeScheduleType(parsed.data.scheduleType)},
        ${parsed.data.courseName || null}, ${sql.json(buildConfiguration(parsed.data))}
      )
      returning id
    `;
    groupId = created.id;
  } catch {
    return { error: 'createFailed' };
  }

  // New groups otherwise start with zero course_lessons rows and no way for
  // the teacher to add one (the lesson-plans UI only edits pre-existing
  // rows) — this used to be seeded by a Supabase-side mechanism that never
  // got ported to Cloud SQL, so every group created since that migration
  // silently had no lesson plan slots at all until this call.
  //
  // Next month is seeded here too: the monthly generation cron only runs at
  // the turn of the month, so a group created on e.g. the 28th would have
  // had a handful of slots left in the current month and then nothing at all
  // until the *following* month's run — one full month of blank lesson
  // plans. Both calls are independent and idempotent (generateLessonSlots-
  // ForMonth's own `where not exists` guard), so the cron re-running over
  // next month later is a no-op rather than a duplicate.
  const [thisYear, thisMonth] = currentMonthKey().split('-').map(Number);
  const seedMonths: [number, number][] = [
    [thisYear, thisMonth],
    thisMonth === 12 ? [thisYear + 1, 1] : [thisYear, thisMonth + 1],
  ];
  for (const [year, month] of seedMonths) {
    try {
      await generateLessonSlotsForMonth(groupId, year, month);
    } catch (error) {
      console.error('generateLessonSlotsForMonth failed for new group', groupId, year, month, error);
    }
  }

  // Keeps group_chat_meta/{groupId} in sync so the group's Firestore-backed
  // teacher/TA chat thread knows who's allowed to read it (see
  // firestore.rules + staff-chat.ts's sendStaffChatMessageAction).
  await syncGroupChatMembers(groupId, user.id, assignedTaId);

  logSystemAction('group.create', `Created group "${parsed.data.name}"`);

  revalidatePath('/[locale]/lesson-plans', 'page');

  // Fire-and-forget — the group is already created either way.
  // See staff-chats.ts's `after()` comment — the platform can tear down a
  // bare un-awaited fire-and-forget call before its Telegram send finishes.
  after(() => notifyGroupCreated({ name: parsed.data.name, teacherProfile: profile, assignedTaId }));

  return { groupId };
}

async function notifyGroupCreated({
  name,
  teacherProfile,
  assignedTaId,
}: {
  name: string;
  teacherProfile: { first_name: string; last_name: string; telegram_id: number | null };
  assignedTaId: string | null;
}) {
  let taTelegramId: number | null = null;
  if (assignedTaId) {
    const [ta] = await sql<{ telegram_id: number | null }[]>`
      select telegram_id from profiles where id = ${assignedTaId}
    `;
    taTelegramId = ta?.telegram_id ?? null;
  }

  const text = [
    `<b>Yangi guruh yaratildi:</b> ${escapeTelegramText(name)}`,
    `<b>O'qituvchi:</b> ${escapeTelegramText(`${teacherProfile.first_name} ${teacherProfile.last_name}`)}`,
    assignedTaId ? "<b>Yordamchi (TA) tayinlandi.</b>" : "<b>Yordamchi (TA):</b> Tayinlanmagan",
  ].join('\n');

  await sendTelegramMessageToMany([teacherProfile.telegram_id, taTelegramId], text);
}

const updateGroupSchema = groupSchema.extend({ id: z.string().uuid() });

export async function updateGroupAction(
  _prevState: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const parsed = updateGroupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const assignedTaId = normalizeAssignedTaId(parsed.data.assignedTaId);

  if (assignedTaId && !(await validateAssignedTa(assignedTaId))) {
    return { error: 'invalidInput' };
  }

  // Mirrors the old `groups_update` policy
  // (`public.is_admin() or teacher_id = auth.uid()`, is_admin() now being
  // CEO-only) — RLS used to narrow this update to the owning teacher, so
  // without the extra predicate any employee could rename/reassign any
  // group by posting its id.
  const isCeo = profile.role === 'ceo';
  const [updated] = await sql<{ teacher_id: string }[]>`
    update groups set
      name = ${parsed.data.name},
      assigned_ta_id = ${assignedTaId},
      schedule_type = ${normalizeScheduleType(parsed.data.scheduleType)},
      course_name = ${parsed.data.courseName || null},
      configuration = ${sql.json(buildConfiguration(parsed.data))}
    where id = ${parsed.data.id} and (${isCeo} or teacher_id = ${user.id})
    returning teacher_id
  `;
  if (!updated) return { error: 'forbidden' };

  // assigned_ta_id may have just changed — re-sync the chat thread's
  // membership so a newly-assigned TA can read/receive it immediately and
  // a removed one loses access.
  await syncGroupChatMembers(parsed.data.id, updated.teacher_id, assignedTaId);

  revalidatePath('/[locale]/lesson-plans', 'page');
  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteGroupAction(formData: FormData): Promise<void> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return;

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  // Mirrors the old `groups_delete` policy
  // (`public.is_admin() or teacher_id = auth.uid()`, is_admin() now being
  // CEO-only) — the chat metadata is only torn down if the row really was
  // this caller's to delete.
  const isCeo = profile.role === 'ceo';
  const [deleted] = await sql<{ id: string }[]>`
    delete from groups where id = ${parsed.data.id} and (${isCeo} or teacher_id = ${user.id})
    returning id
  `;
  if (!deleted) return;
  await deleteGroupChatMeta(parsed.data.id);

  revalidatePath('/[locale]/lesson-plans', 'page');
}
