'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';

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

  const supabase = await createClient();
  const { error } = await supabase.from('staff_salary_notes').upsert(
    { staff_id: parsed.data.staffId, comment: parsed.data.comment, updated_by: ceoId, updated_at: new Date().toISOString() },
    { onConflict: 'staff_id' },
  );
  if (error) return { error: 'updateFailed' };

  revalidatePath(`/[locale]/finance/${parsed.data.staffId}`, 'page');
  return {};
}
