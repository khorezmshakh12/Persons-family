'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';

export type SalaryActionState = { error?: string } | undefined;

const upsertNoteSchema = z.object({
  staffId: z.string().uuid(),
  comment: z.string().trim().min(1).max(2000),
});

/** The one freeform comment attached to a staff member's Salary Total —
 * CEO-only, single row per staff (not a history log), see
 * staff_salary_notes' own comment for why. */
export async function upsertSalaryNoteAction(
  _prevState: SalaryActionState,
  formData: FormData,
): Promise<SalaryActionState> {
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireCeo());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = upsertNoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (parsed.data.staffId === ceoId) return { error: 'forbidden' };

  try {
    await sql`
      insert into staff_salary_notes (staff_id, comment, updated_by, updated_at)
      values (${parsed.data.staffId}, ${parsed.data.comment}, ${ceoId}, now())
      on conflict (staff_id) do update set
        comment = excluded.comment,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `;
  } catch (error) {
    console.error('upsertSalaryNoteAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  revalidatePath(`/[locale]/finance/${parsed.data.staffId}`, 'page');
  return {};
}
