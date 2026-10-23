'use server';

import { z } from 'zod';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { canSeeFor } from '@/lib/permissions';
import { sql } from '@/lib/db/client';

// O'quvchi kartasidagi izohlar (Operation HQ › O'quvchilar). Moved out of the
// removed Sales actions on 2026-10-23.

type Result = { error?: string };
const uuid = z.string().uuid();

async function requireEditor(): Promise<{ id: string } | { error: string }> {
  try {
    const { profile } = await requireCap('operations.edit');
    return { id: profile.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

export type StudentNote = { id: string; body: string; by: string; byId: string | null; at: string; editedAt: string | null; editedBy: string; remindAt: string | null; remindDone: boolean };

export async function getStudentNotesAction(studentId: string): Promise<{ notes?: StudentNote[]; meId?: string; error?: string }> {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'operations')) return { error: 'forbidden' };
  if (!uuid.safeParse(studentId).success) return { error: 'invalidInput' };
  try {
    const notes = await sql<StudentNote[]>`
      select n.id, n.body, coalesce(p.first_name || ' ' || p.last_name, '') as by, n.created_by as "byId", n.created_at::text as at,
        n.updated_at::text as "editedAt", coalesce(u.first_name || ' ' || u.last_name, '') as "editedBy",
        n.remind_at::text as "remindAt", n.remind_done_at is not null as "remindDone"
      from crm_student_notes n left join profiles p on p.id = n.created_by left join profiles u on u.id = n.updated_by
      where n.student_id = ${studentId} order by n.created_at desc`;
    return { notes: [...notes], meId: profile.id };
  } catch {
    return { error: 'loadFailed' };
  }
}

const remindAt = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null);
/** A note with `remindAt` comes back on its author's dashboard that day until marked read. */
const noteSchema = z.object({ studentId: uuid, body: z.string().trim().min(1).max(2000), remindAt });

export async function addStudentNoteAction(input: z.input<typeof noteSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = noteSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`insert into crm_student_notes (student_id, body, created_by, remind_at) values (${p.data.studentId}, ${p.data.body}, ${me.id}, ${p.data.remindAt})`;
  } catch {
    return { error: 'updateFailed' };
  }
  return {};
}

const editNoteSchema = z.object({ id: uuid, body: z.string().trim().min(1).max(2000), remindAt });

export async function editStudentNoteAction(input: z.input<typeof editNoteSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = editNoteSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    const res = await sql`
      update crm_student_notes set body = ${p.data.body}, updated_at = now(), updated_by = ${me.id},
        remind_done_at = case when remind_at is distinct from ${p.data.remindAt}::date then null else remind_done_at end,
        remind_at = ${p.data.remindAt}
      where id = ${p.data.id} and created_by = ${me.id}`;
    if (res.count === 0) return { error: 'forbidden' };
  } catch {
    return { error: 'updateFailed' };
  }
  return {};
}

