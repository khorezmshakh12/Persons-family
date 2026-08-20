'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { createSignedWriteUrl, deleteObject } from '@/lib/gcp/storage';
import type { LessonAttachment } from '@/lib/lesson-materials';

export type LessonActionState = { error?: string; errorParams?: Record<string, string> } | undefined;
export type UploadUrlResult = { path?: string; url?: string; error?: string; detail?: string };

/**
 * Reproduces the old `course_lessons_update` RLS policy
 * (`public.is_group_owner(group_id) or public.current_role() = 'ceo'`, see
 * the head_teacher/it_developer RLS migration) — with RLS gone, a bare
 * `update course_lessons ... where id = $1` is no longer narrowed to the
 * owning teacher by the database, so any signed-in employee could edit any
 * group's lesson plan by posting someone else's lessonId. Every write below
 * checks this first. `is_group_owner` was just
 * `groups.teacher_id = auth.uid()`, so that's what the join checks.
 */
async function canWriteLesson(lessonId: string, uid: string, role: string | undefined): Promise<boolean> {
  if (role === 'ceo') return true;
  const [row] = await sql<{ id: string }[]>`
    select cl.id from course_lessons cl
    join groups g on g.id = cl.group_id
    where cl.id = ${lessonId} and g.teacher_id = ${uid}
  `;
  return Boolean(row);
}

const updateLessonDateSchema = z.object({
  lessonId: z.string().uuid(),
  lessonDate: z.string().optional().or(z.literal('')),
});

// Date and topic are deliberately separate actions/columns, each updating
// only its own field — a single combined action would silently null out
// whichever field the caller didn't include whenever only the other one
// changed.
export async function updateLessonDateAction(
  _prevState: LessonActionState,
  formData: FormData,
): Promise<LessonActionState> {
  const { user, profile } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = updateLessonDateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  if (!(await canWriteLesson(parsed.data.lessonId, user.id, profile?.role))) return { error: 'forbidden' };

  const nextDate = parsed.data.lessonDate || null;

  // Two lessons in the same group landing on the same date is exactly what
  // let a stray empty duplicate shadow a teacher's completed plan and get
  // reported to the CEO/Telegram as "not done" (see the lesson-plan-check
  // cron's dedup comment — that's the symptom; this is the root cause).
  // Nothing at the DB layer stops it, so it's enforced here instead, before
  // the write, rather than only tolerated after the fact in the report.
  if (nextDate) {
    const [conflict] = await sql<{ id: string }[]>`
      select cl.id from course_lessons cl
      where cl.group_id = (select group_id from course_lessons where id = ${parsed.data.lessonId})
        and cl.lesson_date = ${nextDate}
        and cl.id != ${parsed.data.lessonId}
    `;
    if (conflict) return { error: 'dateTaken', errorParams: { date: nextDate } };
  }

  await sql`update course_lessons set lesson_date = ${nextDate} where id = ${parsed.data.lessonId}`;

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const updateLessonTopicSchema = z.object({
  lessonId: z.string().uuid(),
  topic: z.string().trim().max(2000).optional().or(z.literal('')),
});

export async function updateLessonTopicAction(
  _prevState: LessonActionState,
  formData: FormData,
): Promise<LessonActionState> {
  const { user, profile } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = updateLessonTopicSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  if (!(await canWriteLesson(parsed.data.lessonId, user.id, profile?.role))) return { error: 'forbidden' };

  // The lesson's date must be set before anything else about it can be
  // written — see the `lesson_date is not null` filter below, which also
  // doubles as the "does this row even match" check: a null result here
  // specifically means "no date yet" for the compliance check in
  // /api/cron/lesson-plan-check to have something reliable to key off of.
  const [row] = await sql<{ id: string }[]>`
    update course_lessons set topic = ${parsed.data.topic || null}
    where id = ${parsed.data.lessonId} and lesson_date is not null
    returning id
  `;
  if (!row) return { error: 'dateRequired' };

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const updateLessonGameLinkSchema = z.object({
  lessonId: z.string().uuid(),
  gameLink: z.string().trim().max(500).optional().or(z.literal('')),
});

/** Single free-text "Game" field — either an online link or an offline
 * activity name/note. Which one it is gets decided at render time (does the
 * value look like a URL), not here, so this stays a plain text column. */
export async function updateLessonGameLinkAction(
  _prevState: LessonActionState,
  formData: FormData,
): Promise<LessonActionState> {
  const { user, profile } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = updateLessonGameLinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  if (!(await canWriteLesson(parsed.data.lessonId, user.id, profile?.role))) return { error: 'forbidden' };

  const [row] = await sql<{ id: string }[]>`
    update course_lessons set game_link = ${parsed.data.gameLink || null}
    where id = ${parsed.data.lessonId} and lesson_date is not null
    returning id
  `;
  if (!row) return { error: 'dateRequired' };

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const lessonPlanFieldSchema = z.object({
  lessonId: z.string().uuid(),
  field: z.enum(['aim', 'language_focus', 'anticipated_problems', 'materials', 'homework']),
  value: z.string().trim().max(4000).optional().or(z.literal('')),
});

/** One action for all five lesson-plan text fields (aim, language focus,
 * anticipated problems, materials, homework) — each is a same-shaped
 * "single column, single value" update, so they share this instead of five
 * near-identical actions. `field` is enum-validated, never interpolated
 * from raw input. */
export async function updateLessonPlanFieldAction(
  _prevState: LessonActionState,
  formData: FormData,
): Promise<LessonActionState> {
  const { user, profile } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = lessonPlanFieldSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  if (!(await canWriteLesson(parsed.data.lessonId, user.id, profile?.role))) return { error: 'forbidden' };

  const { field, value } = parsed.data;
  const nextValue = value || null;
  // `field` is enum-validated above (never raw user input), so it's safe to
  // interpolate as an identifier via sql() — this keeps one query instead of
  // a five-way switch building near-identical update statements.
  const [row] = await sql<{ id: string }[]>`
    update course_lessons set ${sql({ [field]: nextValue })}
    where id = ${parsed.data.lessonId} and lesson_date is not null
    returning id
  `;
  if (!row) return { error: 'dateRequired' };

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const procedureStepSchema = z.object({
  time: z.string().trim().max(20),
  stage: z.string().trim().max(200),
  interaction: z.string().trim().max(50),
});

const updateLessonProcedureSchema = z.object({
  lessonId: z.string().uuid(),
  steps: z.array(procedureStepSchema).max(30),
});

export type LessonProcedureStep = z.infer<typeof procedureStepSchema>;

export async function updateLessonProcedureAction(
  lessonId: string,
  steps: LessonProcedureStep[],
): Promise<LessonActionState> {
  const { user, profile } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = updateLessonProcedureSchema.safeParse({ lessonId, steps });
  if (!parsed.success) return { error: 'invalidInput' };

  if (!(await canWriteLesson(parsed.data.lessonId, user.id, profile?.role))) return { error: 'forbidden' };

  const [row] = await sql<{ id: string }[]>`
    update course_lessons set procedure = ${sql.json(parsed.data.steps)}
    where id = ${parsed.data.lessonId} and lesson_date is not null
    returning id
  `;
  if (!row) return { error: 'dateRequired' };

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const uploadUrlSchema = z.object({
  lessonId: z.string().uuid(),
  groupId: z.string().uuid(),
  fileName: z.string().trim().min(1),
});

/**
 * Issues a signed upload URL so the browser sends the file straight to
 * Cloud Storage — never through this Next.js server — avoiding both Next's
 * default 1MB Server Action body limit and any serverless payload cap.
 * Files are stored at `${groupId}/${lessonId}/${uuid}-${fileName}`; group
 * and lesson ownership are checked explicitly below before minting the URL,
 * since there's no storage-layer RLS anymore to fall back on.
 */
export async function requestLessonMaterialUploadUrlAction(
  lessonId: string,
  groupId: string,
  fileName: string,
  fileType: string,
): Promise<UploadUrlResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const parsed = uploadUrlSchema.safeParse({ lessonId, groupId, fileName });
  if (!parsed.success) return { error: 'invalidInput' };

  const [group] = await sql<{ teacher_id: string | null }[]>`select teacher_id from groups where id = ${groupId}`;
  if (!group) return { error: 'forbidden' };
  if (group.teacher_id !== user.id) return { error: 'forbidden' };

  // Confirm the lesson actually belongs to this group — this app-level
  // check is what stands between the two path segments now.
  const [lesson] = await sql<{ group_id: string }[]>`select group_id from course_lessons where id = ${lessonId}`;
  if (!lesson || lesson.group_id !== groupId) return { error: 'forbidden' };

  const sanitized = parsed.data.fileName.replace(/[^\w.\-]+/g, '_');
  const path = `${parsed.data.groupId}/${parsed.data.lessonId}/${crypto.randomUUID()}-${sanitized}`;

  try {
    const url = await createSignedWriteUrl('lesson_materials', path, fileType || 'application/octet-stream');
    return { path, url };
  } catch (error) {
    console.error('createSignedWriteUrl failed', error);
    return { error: 'uploadFailed', detail: error instanceof Error ? error.message : undefined };
  }
}

const attachSchema = z.object({
  lessonId: z.string().uuid(),
  path: z.string().min(1),
  name: z.string().trim().min(1).max(300),
  type: z.string().max(200),
  size: z.coerce.number().int().min(0),
});

/** Appends the just-uploaded file's metadata to the lesson's attachments list. */
export async function attachLessonMaterialAction(
  _prevState: LessonActionState,
  formData: FormData,
): Promise<LessonActionState> {
  const { user, profile } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = attachSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  if (!(await canWriteLesson(parsed.data.lessonId, user.id, profile?.role))) return { error: 'forbidden' };

  // The uploaded object lives at `${groupId}/${lessonId}/...` (see
  // requestLessonMaterialUploadUrlAction) — pin the recorded path to this
  // lesson so a hand-crafted request can't attach an object belonging to
  // another group's lesson, which would then be readable through this
  // lesson's signed-read URLs.
  if (!parsed.data.path.includes(`/${parsed.data.lessonId}/`)) return { error: 'forbidden' };

  const [lesson] = await sql<{ attachments: LessonAttachment[] | null }[]>`
    select attachments from course_lessons where id = ${parsed.data.lessonId}
  `;
  if (!lesson) return { error: 'forbidden' };

  const attachments = lesson.attachments ?? [];
  const nextAttachments: LessonAttachment[] = [
    ...attachments,
    { path: parsed.data.path, name: parsed.data.name, type: parsed.data.type, size: parsed.data.size },
  ];

  await sql`update course_lessons set attachments = ${sql.json(nextAttachments)} where id = ${parsed.data.lessonId}`;

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const removeSchema = z.object({
  lessonId: z.string().uuid(),
  path: z.string().min(1),
});

/** Removes one attachment from the lesson's list and deletes the underlying
 * storage object. Restricted to the owning teacher or the CEO, matching the
 * original RLS-backed "only CEO + assigned teacher can delete" spec — that
 * used to come from course_lessons_update + the lesson_materials storage
 * policy, so it's checked here explicitly now rather than left to the
 * caller. */
export async function removeLessonMaterialAction(
  _prevState: LessonActionState,
  formData: FormData,
): Promise<LessonActionState> {
  const { user, profile } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = removeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  if (!(await canWriteLesson(parsed.data.lessonId, user.id, profile?.role))) return { error: 'forbidden' };

  const [lesson] = await sql<{ attachments: LessonAttachment[] | null }[]>`
    select attachments from course_lessons where id = ${parsed.data.lessonId}
  `;
  if (!lesson) return { error: 'forbidden' };

  const attachments = lesson.attachments ?? [];
  // Only ever delete an object this lesson actually references — `path`
  // arrives from the client, and the storage layer mints delete calls with
  // no ownership check of its own (the old lesson_materials storage policy
  // did that), so an unmatched path must not reach deleteObject().
  const target = attachments.find((a) => a.path === parsed.data.path);
  if (!target) return { error: 'forbidden' };
  const nextAttachments = attachments.filter((a) => a.path !== parsed.data.path);

  await sql`update course_lessons set attachments = ${sql.json(nextAttachments)} where id = ${parsed.data.lessonId}`;

  await deleteObject('lesson_materials', target.path);

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const createCommentSchema = z.object({
  lessonId: z.string().uuid(),
  commentText: z.string().trim().min(1).max(1000),
});

export async function createLessonCommentAction(
  _prevState: LessonActionState,
  formData: FormData,
): Promise<LessonActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  // Administrative Manager and IT Developer have no lesson-plan access at
  // all. Head Teacher took IT Developer's place for viewing/commenting.
  const isAuthorized = profile.role === 'ceo' || profile.role === 'head_teacher' || profile.role === 'assistant';
  if (!isAuthorized) return { error: 'forbidden' };

  const parsed = createCommentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  await sql`
    insert into lesson_comments (lesson_id, user_id, comment_text)
    values (${parsed.data.lessonId}, ${user.id}, ${parsed.data.commentText})
  `;

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteLessonCommentAction(formData: FormData): Promise<void> {
  const { user, profile } = await getAuthState();
  if (!user) return;

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  // Mirrors the old `lesson_comments_delete_own` policy
  // (`user_id = auth.uid() or public.is_admin()`, is_admin() now being
  // CEO-only) — without it any employee could delete anyone's comment by id.
  const isCeo = profile?.role === 'ceo';
  await sql`delete from lesson_comments where id = ${parsed.data.id} and (${isCeo} or user_id = ${user.id})`;

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
}
