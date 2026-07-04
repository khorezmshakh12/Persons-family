'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';
import { LESSON_PLAN_ALLOWED_TYPES } from '@/lib/lesson-plan-constants';

export type LessonPlanActionState = { error?: string } | undefined;

export type UploadUrlResult = { path?: string; token?: string; error?: string };

/**
 * Issues a signed upload URL so the browser can send the file straight to
 * Supabase Storage — never through this Next.js server — avoiding both
 * Next's default 1MB Server Action body limit and Vercel's hard 4.5MB
 * serverless function payload limit. The RLS INSERT check for
 * lesson-files (teacher role + own-uid folder) runs right here, at
 * signed-URL creation time.
 */
export async function requestLessonPlanUploadUrlAction(
  fileName: string,
  fileType: string,
): Promise<UploadUrlResult> {
  const { user, profile } = await getAuthState();
  if (!user || profile?.role !== 'teacher') return { error: 'forbidden' };

  const ext = LESSON_PLAN_ALLOWED_TYPES[fileType];
  if (!ext) return { error: 'invalidFileType' };

  const supabase = await createClient();
  const path = `${user.id}/${Date.now()}-${randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from('lesson-files').createSignedUploadUrl(path);
  if (error || !data) return { error: 'uploadFailed' };

  return { path, token: data.token };
}

const saveSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  planDate: z.string().min(1),
  filePath: z.string().optional().or(z.literal('')),
  fileName: z.string().optional().or(z.literal('')),
  fileType: z.string().optional().or(z.literal('')),
});

export async function saveLessonPlanAction(
  _prevState: LessonPlanActionState,
  formData: FormData,
): Promise<LessonPlanActionState> {
  const { user, profile } = await getAuthState();
  if (!user || profile?.role !== 'teacher') return { error: 'forbidden' };

  const parsed = saveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('lesson_plans').insert({
    teacher_id: user.id,
    topic: parsed.data.topic,
    plan_date: parsed.data.planDate,
    file_url: parsed.data.filePath || null,
    file_name: parsed.data.fileName || null,
    file_type: parsed.data.fileType || null,
  });
  if (error) return { error: 'createFailed' };

  revalidatePath('/[locale]/lesson-plans', 'page');
  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteLessonPlanAction(formData: FormData): Promise<void> {
  const { user, profile } = await getAuthState();
  if (!user || profile?.role !== 'teacher') return;

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  const { data: plan } = await supabase
    .from('lesson_plans')
    .select('file_url')
    .eq('id', parsed.data.id)
    .eq('teacher_id', user.id)
    .single();

  await supabase.from('lesson_plans').delete().eq('id', parsed.data.id).eq('teacher_id', user.id);

  if (plan?.file_url) {
    await supabase.storage.from('lesson-files').remove([plan.file_url]);
  }

  revalidatePath('/[locale]/lesson-plans', 'page');
}
