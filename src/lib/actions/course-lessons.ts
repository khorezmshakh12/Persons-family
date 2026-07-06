'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';
import type { LessonAttachment } from '@/lib/lesson-materials';

export type LessonActionState = { error?: string } | undefined;
export type UploadUrlResult = { path?: string; token?: string; error?: string };

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
  const { error } = await supabase
    .from('course_lessons')
    .update({ topic: parsed.data.topic || null })
    .eq('id', parsed.data.lessonId);
  if (error) return { error: 'updateFailed' };

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

  const sanitized = parsed.data.fileName.replace(/[^\w.\-]+/g, '_');
  const path = `${parsed.data.groupId}/${parsed.data.lessonId}/${crypto.randomUUID()}-${sanitized}`;
  const { data, error } = await supabase.storage.from('lesson_materials').createSignedUploadUrl(path);
  if (error || !data) return { error: 'uploadFailed' };

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

  // Best-effort: the row update above is the source of truth and is already
  // RLS-gated to teacher-or-CEO; if the storage delete fails (e.g. RLS
  // denies a race where the caller wasn't actually the owner), leave it
  // orphaned rather than surfacing a confusing partial error to the user.
  await supabase.storage.from('lesson_materials').remove([parsed.data.path]);

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

  const isAuthorized = profile.role === 'ceo' || profile.role === 'admin_manager' || profile.role === 'assistant';
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
