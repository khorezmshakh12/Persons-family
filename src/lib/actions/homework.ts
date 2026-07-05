'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';

export type HomeworkActionState = { error?: string } | undefined;

const createStudentSchema = z.object({
  groupId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(200),
});

export async function createStudentAction(
  _prevState: HomeworkActionState,
  formData: FormData,
): Promise<HomeworkActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = createStudentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('homework_students')
    .insert({ group_id: parsed.data.groupId, full_name: parsed.data.fullName });
  if (error) return { error: 'createFailed' };

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const createAssignmentSchema = z.object({
  groupId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  dueDate: z.string().optional().or(z.literal('')),
});

export async function createAssignmentAction(
  _prevState: HomeworkActionState,
  formData: FormData,
): Promise<HomeworkActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = createAssignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('homework_assignments').insert({
    group_id: parsed.data.groupId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    due_date: parsed.data.dueDate || null,
  });
  if (error) return { error: 'createFailed' };

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const STATUSES = ['pending', 'submitted', 'graded', 'missing'] as const;

const updateSubmissionSchema = z.object({
  assignmentId: z.string().uuid(),
  studentId: z.string().uuid(),
  status: z.enum(STATUSES),
});

export async function updateSubmissionStatusAction(formData: FormData): Promise<void> {
  const { user } = await getAuthState();
  if (!user) return;

  const parsed = updateSubmissionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.from('homework_submissions').upsert(
    {
      assignment_id: parsed.data.assignmentId,
      student_id: parsed.data.studentId,
      status: parsed.data.status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'assignment_id,student_id' },
  );

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
}
