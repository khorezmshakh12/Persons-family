'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin, authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { fieldErrorCodes, type FieldErrors } from '@/lib/form-errors';

export type FinanceActionState = { error?: string; fieldErrors?: FieldErrors } | undefined;

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
  if (!parsed.success) return { error: 'invalidInput', fieldErrors: fieldErrorCodes(parsed.error) };

  await sql`
    insert into finance_entries (staff_id, title, amount, note, created_by)
    values (${parsed.data.staffId}, ${parsed.data.title}, ${parsed.data.amount}, ${parsed.data.note || null}, ${adminId})
  `;

  logSystemAction(
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

  await sql`delete from finance_entries where id = ${parsed.data.entryId}`;

  revalidatePath('/[locale]/finance', 'page');
  return {};
}
