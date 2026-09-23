'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin, authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { fieldErrorCodes, type FieldErrors } from '@/lib/form-errors';

export type FinanceActionState = { error?: string; fieldErrors?: FieldErrors } | undefined;

const PERIOD_RE = /^\d{4}-\d{2}-01$/;

const addEntrySchema = z.object({
  staffId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  amount: z.coerce.number().refine((n) => n !== 0, 'nonzero'),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
  // Ties the entry to a payroll month + classifies it. 'salary'/'advance'
  // count toward "paid this month"; 'penalty' is a deduction; 'adjustment'
  // (default) is a loose entry that only feeds the net total.
  kind: z.enum(['adjustment', 'salary', 'advance', 'penalty']).optional(),
  period: z.string().regex(PERIOD_RE).optional().or(z.literal('')),
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

  const kind = parsed.data.kind ?? 'adjustment';
  const period = parsed.data.period || null;

  try {
    await sql`
      insert into finance_entries (staff_id, title, amount, note, created_by, kind, period)
      values (
        ${parsed.data.staffId}, ${parsed.data.title}, ${parsed.data.amount},
        ${parsed.data.note || null}, ${adminId}, ${kind}, ${period}
      )
    `;
  } catch {
    return { error: 'updateFailed' };
  }

  logSystemAction(
    'finance.entry_add',
    `Added ${kind} entry "${parsed.data.title}" (${parsed.data.amount}) for staff ${parsed.data.staffId}${period ? ` [${period}]` : ''}`,
  );

  revalidatePath('/[locale]/finance', 'page');
  revalidatePath('/[locale]/profile/[id]', 'page');
  return {};
}

const setSalaryMonthSchema = z.object({
  staffId: z.string().uuid(),
  period: z.string().regex(PERIOD_RE),
  grossAmount: z.coerce.number().min(0),
});

/** CEO sets (or updates) a staff member's planned gross salary for one
 * Tashkent month. One row per (staff, month) — upsert. */
export async function setSalaryMonthAction(
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

  const parsed = setSalaryMonthSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput', fieldErrors: fieldErrorCodes(parsed.error) };

  try {
    await sql`
      insert into salary_months (staff_id, period, gross_amount, set_by)
      values (${parsed.data.staffId}, ${parsed.data.period}, ${parsed.data.grossAmount}, ${adminId})
      on conflict (staff_id, period)
      do update set gross_amount = excluded.gross_amount, set_by = excluded.set_by, set_at = now()
    `;
  } catch (error) {
    console.error('setSalaryMonthAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  logSystemAction(
    'finance.salary_set',
    `Set ${parsed.data.period} salary for staff ${parsed.data.staffId} to ${parsed.data.grossAmount}`,
  );

  revalidatePath('/[locale]/finance', 'page');
  revalidatePath('/[locale]/profile/[id]', 'page');
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

  try {
    await sql`delete from finance_entries where id = ${parsed.data.entryId}`;
  } catch (error) {
    console.error('deleteFinanceEntryAction failed', error instanceof Error ? error.message : error);
    return { error: 'deleteFailed' };
  }

  revalidatePath('/[locale]/finance', 'page');
  return {};
}
