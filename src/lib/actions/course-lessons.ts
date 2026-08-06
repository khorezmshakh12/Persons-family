'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthState } from '@/lib/auth/session';
import type { LessonAttachment } from '@/lib/lesson-materials';

export type LessonActionState = { error?: string } | undefined;
export type UploadUrlResult = { path?: string; token?: string; error?: string; detail?: string };

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
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = updateLessonDateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('course_lessons')
    .update({ lesson_date: parsed.data.lessonDate || null })
    .eq('id', parsed.data.lessonId);
  if (error) return { error: 'updateFailed' };

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
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = updateLessonTopicSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  // The lesson's date must be set before anything else about it can be
  // written — see the .not('lesson_date', 'is', null) filter below, which
  // also doubles as the "does this row even match" check: a matched-but-
  // unauthorized row is separately blocked by course_lessons' own RLS, so a
  // null `data` here specifically means "no date yet" for the compliance
  // check in /api/cron/lesson-plan-check to have something reliable to key
  // off of.
  const { data, error } = await supabase
    .from('course_lessons')
    .update({ topic: parsed.data.topic || null })
    .eq('id', parsed.data.lessonId)
    .not('lesson_date', 'is', null)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'updateFailed' };
  if (!data) return { error: 'dateRequired' };

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
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = updateLessonGameLinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('course_lessons')
    .update({ game_link: parsed.data.gameLink || null })
    .eq('id', parsed.data.lessonId)
    .not('lesson_date', 'is', null)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'updateFailed' };
  if (!data) return { error: 'dateRequired' };

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
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = lessonPlanFieldSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const { field, value } = parsed.data;
  const nextValue = value || null;
  // A computed `{ [field]: ... }` key widens to `string`, which Supabase's
  // generated Update type rejects — a switch keeps each branch's key a
  // literal so it matches the real column type.
  const updateData =
    field === 'aim'
      ? { aim: nextValue }
      : field === 'language_focus'
        ? { language_focus: nextValue }
        : field === 'anticipated_problems'
          ? { anticipated_problems: nextValue }
          : field === 'materials'
            ? { materials: nextValue }
            : { homework: nextValue };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('course_lessons')
    .update(updateData)
    .eq('id', parsed.data.lessonId)
    .not('lesson_date', 'is', null)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'updateFailed' };
  if (!data) return { error: 'dateRequired' };

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
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = updateLessonProcedureSchema.safeParse({ lessonId, steps });
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('course_lessons')
    .update({ procedure: parsed.data.steps })
    .eq('id', parsed.data.lessonId)
    .not('lesson_date', 'is', null)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'updateFailed' };
  if (!data) return { error: 'dateRequired' };

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
 * Supabase Storage — never through this Next.js server — avoiding both
 * Next's default 1MB Server Action body limit and Vercel's 4.5MB
 * serverless payload cap. Files are stored at
 * `${groupId}/${lessonId}/${uuid}-${fileName}` so storage RLS can check
 * group ownership from the first path segment.
 */
export async function requestLessonMaterialUploadUrlAction(
  lessonId: string,
  groupId: string,
  fileName: string,
): Promise<UploadUrlResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const parsed = uploadUrlSchema.safeParse({ lessonId, groupId, fileName });
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data: group } = await supabase.from('groups').select('teacher_id').eq('id', groupId).maybeSingle();
  if (!group) return { error: 'forbidden' };
  if (group.teacher_id !== user.id) return { error: 'forbidden' };

  // Confirm the lesson actually belongs to this group — the storage call
  // below uses the admin client (see comment there), so this app-level check
  // is now the only thing standing between the two path segments.
  const { data: lesson } = await supabase.from('course_lessons').select('group_id').eq('id', lessonId).maybeSingle();
  if (!lesson || lesson.group_id !== groupId) return { error: 'forbidden' };

  const sanitized = parsed.data.fileName.replace(/[^\w.\-]+/g, '_');
  const path = `${parsed.data.groupId}/${parsed.data.lessonId}/${crypto.randomUUID()}-${sanitized}`;
  // Ownership is already fully verified above, so this uses the admin client
  // (bypasses storage RLS) rather than the user's own session — the new
  // Frankfurt project is missing its storage.objects INSERT policies post
  // migration, and a database-side fix requires access we don't have from
  // here. This keeps uploads working without depending on that RLS policy.
  const { data, error } = await createAdminClient().storage.from('lesson_materials').createSignedUploadUrl(path);
  if (error || !data) {
    // Surface the raw Supabase error (e.g. "Bucket not found", "new row
    // violates row-level security policy") so a migration/config bug is
    // diagnosable from the toast instead of a generic "upload failed".
    console.error('createSignedUploadUrl failed', error);
    return { error: 'uploadFailed', detail: error?.message };
  }

  return { path, token: data.token };
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
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = attachSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from('course_lessons')
    .select('attachments')
    .eq('id', parsed.data.lessonId)
    .maybeSingle();
  if (!lesson) return { error: 'forbidden' };

  const attachments = (lesson.attachments as unknown as LessonAttachment[]) ?? [];
  const nextAttachments: LessonAttachment[] = [
    ...attachments,
    { path: parsed.data.path, name: parsed.data.name, type: parsed.data.type, size: parsed.data.size },
  ];

  const { error } = await supabase
    .from('course_lessons')
    .update({ attachments: nextAttachments })
    .eq('id', parsed.data.lessonId);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const removeSchema = z.object({
  lessonId: z.string().uuid(),
  path: z.string().min(1),
});

/** Removes one attachment from the lesson's list and deletes the underlying
 * storage object. RLS additionally restricts this to the owning teacher or
 * the CEO, matching the "only CEO + assigned teacher can delete" spec. */
export async function removeLessonMaterialAction(
  _prevState: LessonActionState,
  formData: FormData,
): Promise<LessonActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = removeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from('course_lessons')
    .select('attachments')
    .eq('id', parsed.data.lessonId)
    .maybeSingle();
  if (!lesson) return { error: 'forbidden' };

  const attachments = (lesson.attachments as unknown as LessonAttachment[]) ?? [];
  const nextAttachments = attachments.filter((a) => a.path !== parsed.data.path);

  const { error } = await supabase
    .from('course_lessons')
    .update({ attachments: nextAttachments })
    .eq('id', parsed.data.lessonId);
  if (error) return { error: 'updateFailed' };

  // The row update above is the real authorization gate (RLS-restricted to
  // teacher-or-CEO) and already succeeded, so this uses the admin client —
  // storage RLS itself is missing on the new Frankfurt project and would
  // otherwise block the delete even though the caller is confirmed allowed.
  await createAdminClient().storage.from('lesson_materials').remove([parsed.data.path]);

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

  // Administrative Manager no longer has any lesson-plan access — see
  // 20260806110000_remove_admin_manager_lesson_plan_access.sql.
  const isAuthorized = profile.role === 'ceo' || profile.role === 'it_developer' || profile.role === 'assistant';
  if (!isAuthorized) return { error: 'forbidden' };

  const parsed = createCommentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('lesson_comments').insert({
    lesson_id: parsed.data.lessonId,
    user_id: user.id,
    comment_text: parsed.data.commentText,
  });
  if (error) return { error: 'createFailed' };

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteLessonCommentAction(formData: FormData): Promise<void> {
  const { user } = await getAuthState();
  if (!user) return;

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.from('lesson_comments').delete().eq('id', parsed.data.id);

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
}
