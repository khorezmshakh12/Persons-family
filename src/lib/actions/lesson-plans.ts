'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';

export type LessonPlanActionState = { error?: string } | undefined;

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
const MAX_FILE_BYTES = 15 * 1024 * 1024;

const createSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  planDate: z.string().min(1),
});

export async function createLessonPlanAction(
  _prevState: LessonPlanActionState,
  formData: FormData,
): Promise<LessonPlanActionState> {
  const { user, profile } = await getAuthState();
  if (!user || profile?.role !== 'teacher') return { error: 'forbidden' };

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();

  let filePath: string | null = null;
  let fileName: string | null = null;
  let fileType: string | null = null;

  const file = formData.get('file');
  if (file instanceof File && file.size > 0) {
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) return { error: 'invalidFileType' };
    if (file.size > MAX_FILE_BYTES) return { error: 'fileTooLarge' };

    const path = `${user.id}/${Date.now()}-${randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('lesson-files')
      .upload(path, file, { contentType: file.type });
    if (uploadError) return { error: 'uploadFailed' };

    filePath = path;
    fileName = file.name;
    fileType = ext;
  }

  const { error } = await supabase.from('lesson_plans').insert({
    teacher_id: user.id,
    topic: parsed.data.topic,
    plan_date: parsed.data.planDate,
    file_url: filePath,
    file_name: fileName,
    file_type: fileType,
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
