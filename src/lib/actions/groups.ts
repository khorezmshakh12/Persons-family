'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';
import { escapeTelegramText, sendTelegramMessageToMany } from '@/lib/telegram';
import { logSystemAction } from '@/lib/audit-log';

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

/** Defense in depth: RLS doesn't itself check that assigned_ta_id points at
 * an actual assistant, since that's a cross-table business rule rather than
 * a per-row ownership check. */
async function validateAssignedTa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assignedTaId: string,
): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('role').eq('id', assignedTaId).maybeSingle();
  return data?.role === 'assistant';
}

export async function createGroupAction(
  _prevState: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile || profile.role !== 'teacher') return { error: 'forbidden' };

  const parsed = groupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const assignedTaId = normalizeAssignedTaId(parsed.data.assignedTaId);

  if (assignedTaId && !(await validateAssignedTa(supabase, assignedTaId))) {
    return { error: 'invalidInput' };
  }

  const { data, error } = await supabase
    .from('groups')
    .insert({
      teacher_id: user.id,
      name: parsed.data.name,
      assigned_ta_id: assignedTaId,
      schedule_type: normalizeScheduleType(parsed.data.scheduleType),
      course_name: parsed.data.courseName || null,
      configuration: buildConfiguration(parsed.data),
    })
    .select('id')
    .single();

  if (error) {
    if (error.message.includes('Group limit reached')) return { error: 'groupLimitReached' };
    return { error: 'createFailed' };
  }

  logSystemAction(supabase, 'group.create', `Created group "${parsed.data.name}"`);

  revalidatePath('/[locale]/lesson-plans', 'page');

  // Fire-and-forget — the group is already created either way.
  void notifyGroupCreated({ name: parsed.data.name, teacherProfile: profile, assignedTaId, supabase });

  return { groupId: data.id };
}

async function notifyGroupCreated({
  name,
  teacherProfile,
  assignedTaId,
  supabase,
}: {
  name: string;
  teacherProfile: { first_name: string; last_name: string; telegram_id: number | null };
  assignedTaId: string | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  let taTelegramId: number | null = null;
  if (assignedTaId) {
    const { data: ta } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('id', assignedTaId)
      .maybeSingle();
    taTelegramId = ta?.telegram_id ?? null;
  }

  const text = [
    `*Yangi guruh yaratildi:* ${escapeTelegramText(name)}`,
    `*O'qituvchi:* ${escapeTelegramText(`${teacherProfile.first_name} ${teacherProfile.last_name}`)}`,
    assignedTaId ? "*Yordamchi (TA) tayinlandi.*" : "*Yordamchi (TA):* Tayinlanmagan",
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

  const supabase = await createClient();
  const assignedTaId = normalizeAssignedTaId(parsed.data.assignedTaId);

  if (assignedTaId && !(await validateAssignedTa(supabase, assignedTaId))) {
    return { error: 'invalidInput' };
  }

  const { error } = await supabase
    .from('groups')
    .update({
      name: parsed.data.name,
      assigned_ta_id: assignedTaId,
      schedule_type: normalizeScheduleType(parsed.data.scheduleType),
      course_name: parsed.data.courseName || null,
      configuration: buildConfiguration(parsed.data),
    })
    .eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

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

  const supabase = await createClient();
  await supabase.from('groups').delete().eq('id', parsed.data.id);

  revalidatePath('/[locale]/lesson-plans', 'page');
}
