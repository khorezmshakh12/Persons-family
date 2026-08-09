'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin, authErrorCode } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { logSystemAction } from '@/lib/audit-log';

export type FinanceActionState = { error?: string } | undefined;

const addEntrySchema = z.object({
  staffId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  amount: z.coerce.number().refine((n) => n !== 0, 'nonzero'),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});

export async function addFinanceEntryAction(
  _prevState: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  let adminId: string;
  try {
    ({
      user: { id: adminId },
    } = await requireAdmin());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = addEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('finance_entries').insert({
    staff_id: parsed.data.staffId,
    title: parsed.data.title,
    amount: parsed.data.amount,
    note: parsed.data.note || null,
    created_by: adminId,
  });
  if (error) return { error: 'updateFailed' };

  logSystemAction(
    supabase,
    'finance.entry_add',
    `Added finance entry "${parsed.data.title}" (${parsed.data.amount}) for staff ${parsed.data.staffId}`,
  );

  revalidatePath('/[locale]/finance', 'page');
  return {};
}

const deleteEntrySchema = z.object({ entryId: z.string().uuid() });

export async function deleteFinanceEntryAction(
  _prevState: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  try {
    await requireAdmin();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = deleteEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('finance_entries').delete().eq('id', parsed.data.entryId);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/finance', 'page');
  return {};
}
