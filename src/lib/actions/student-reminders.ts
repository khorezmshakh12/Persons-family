'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';

// O'quvchi izohidan eslatma (2026-10-22): the author marks a due reminder as
// read on the dashboard, and it disappears from there.
export async function markStudentReminderDoneAction(noteId: string): Promise<{ error?: string }> {
  const { profile } = await getAuthState();
  if (!profile) return { error: 'forbidden' };
  if (!z.string().uuid().safeParse(noteId).success) return { error: 'notFound' };
  try {
    const res = await sql`
      update crm_student_notes set remind_done_at = now()
      where id = ${noteId} and created_by = ${profile.id} and remind_done_at is null`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/dashboard', 'page');
  return {};
}
