'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { fieldErrorCodes, type FieldErrors } from '@/lib/form-errors';
import { escapeTelegramText, sendTelegramAs } from '@/lib/telegram';
import { formatUZS } from '@/lib/format-currency';
import { startOfTashkentMonthKey } from '@/lib/time';

/** The DB trigger refuses writes to a month whose pay run is approved. */
const lockedOr = (error: unknown, fallback: string) =>
  error instanceof Error && /period_locked/.test(error.message) ? 'periodLocked' : fallback;

export type FinanceActionState = { error?: string; fieldErrors?: FieldErrors } | undefined;

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])-01$/;

/** Every page that shows a ledger row or a total built from one. */
function revalidateFinance() {
  revalidatePath('/[locale]/finance', 'page');
  revalidatePath('/[locale]/finance/[staffId]', 'page');
  revalidatePath('/[locale]/profile/[id]', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
}

// Rows a workflow owns are not edited from the ledger: KPI grades (re-grade
// in KPI), pay-run payments (undo the run), corrections (immutable by
// design). Only hand-written rows are edited; an approved advance may also
// be withdrawn (deleted), which cancels its request.

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
    } = await requireCap('finance.manage'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = addEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput', fieldErrors: fieldErrorCodes(parsed.error) };

  const kind = parsed.data.kind ?? 'adjustment';
  // Every row belongs to a payroll month — a period-less row never reached
  // the pay run and slipped past the month lock (finance audit 2026-10-10).
  const period = parsed.data.period || startOfTashkentMonthKey();
  // The kind decides the sign: a jarima is always a deduction, a payment
  // always positive; only a bonus / tuzatish carries its own sign.
  const amount =
    kind === 'penalty' ? -Math.abs(parsed.data.amount)
    : kind === 'salary' || kind === 'advance' ? Math.abs(parsed.data.amount)
    : parsed.data.amount;

  try {
    await sql`
      insert into finance_entries (staff_id, title, amount, note, created_by, kind, period)
      values (
        ${parsed.data.staffId}, ${parsed.data.title}, ${amount},
        ${parsed.data.note || null}, ${adminId}, ${kind}, ${period}
      )
    `;
  } catch (error) {
    console.error('addFinanceEntryAction failed', error instanceof Error ? error.message : error);
    return { error: lockedOr(error, 'updateFailed') };
  }

  logSystemAction(
    'finance.entry_add',
    `Added ${kind} entry "${parsed.data.title}" (${amount}) for staff ${parsed.data.staffId} [${period}]`,
  );

  // Notify the staff member (salary / advance / penalty) once the response
  // is sent — a Telegram hiccup can never fail or slow the save.
  if (kind !== 'adjustment') after(async () => {
    try {
      const [staff] = await sql<{ telegram_id: number | null; first_name: string | null; last_name: string | null }[]>`
        select telegram_id, first_name, last_name from profiles where id = ${parsed.data.staffId}
      `;
      if (staff?.telegram_id) {
        const kindLabels: Record<string, string> = {
          salary: '💰 Oylik maosh',
          advance: '📊 Avans',
          penalty: '⚠️ Jarima',
        };
        const label = kindLabels[kind] || kind;
        const amountStr = formatUZS(Math.abs(amount));
        const text =
          `<b>${label}</b>\n<b>Miqdori:</b> ${escapeTelegramText(amountStr)} so‘m\n` +
          `<b>Sabab:</b> ${escapeTelegramText(parsed.data.title)}` +
          (parsed.data.note ? `\n<b>Izoh:</b> ${escapeTelegramText(parsed.data.note)}` : '');
        await sendTelegramAs('pay', staff.telegram_id, text);
      }
    } catch (error) {
      console.error('Finance notification failed:', error instanceof Error ? error.message : error);
    }
  });

  revalidateFinance();
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
    } = await requireCap('finance.manage'));
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
    return { error: lockedOr(error, 'updateFailed') };
  }

  logSystemAction(
    'finance.salary_set',
    `Set ${parsed.data.period} salary for staff ${parsed.data.staffId} to ${parsed.data.grossAmount}`,
  );

  revalidateFinance();
  return {};
}

const deleteEntrySchema = z.object({ entryId: z.string().uuid() });

const updateEntrySchema = z.object({
  entryId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  amount: z.coerce.number().refine((n) => n !== 0, 'nonzero'),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});

/** Edits a ledger row's title, amount and note. The kind (salary / advance /
 * penalty) and the payroll period are left untouched — changing them here
 * would silently move a payment out of "Berilgan". The amount keeps the
 * row's sign: the edit form takes a plain number, and penalties are stored
 * negative. */
export async function updateFinanceEntryAction(
  _prevState: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  try {
    await requireCap('finance.manage');
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = updateEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput', fieldErrors: fieldErrorCodes(parsed.error) };
  const magnitude = Math.abs(parsed.data.amount);

  let before: { staff_id: string; title: string; amount: number } | undefined;
  try {
    [before] = await sql<{ staff_id: string; title: string; amount: number }[]>`
      update finance_entries fe set
        title = ${parsed.data.title},
        amount = case when fe.amount < 0 then ${-magnitude}::numeric else ${magnitude}::numeric end,
        note = ${parsed.data.note || null}
      from (select id, staff_id, title, amount from finance_entries where id = ${parsed.data.entryId}) old
      where fe.id = old.id and fe.source = 'manual'
      returning old.staff_id, old.title, old.amount
    `;
  } catch (error) {
    console.error('updateFinanceEntryAction failed', error instanceof Error ? error.message : error);
    return { error: lockedOr(error, 'updateFailed') };
  }
  if (!before) {
    const [exists] = await sql`select 1 from finance_entries where id = ${parsed.data.entryId}`.catch(() => []);
    return { error: exists ? 'systemEntry' : 'notFound' };
  }

  logSystemAction(
    'finance.entry_update',
    `Edited entry ${parsed.data.entryId} for staff ${before.staff_id}: "${before.title}" (${before.amount}) → "${parsed.data.title}" (${before.amount < 0 ? -magnitude : magnitude})`,
  );
  revalidateFinance();
  return {};
}

export async function deleteFinanceEntryAction(
  _prevState: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  try {
    await requireCap('finance.manage');
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = deleteEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  let gone: { staff_id: string; title: string; amount: number; source: string } | undefined;
  try {
    gone = await sql.begin(async (tx) => {
      const [row] = await tx<{ staff_id: string; title: string; amount: number; source: string }[]>`
        delete from finance_entries
        where id = ${parsed.data.entryId} and source in ('manual', 'advance')
        returning staff_id, title, amount, source
      `;
      // A withdrawn advance must not stay "Tasdiqlangan" on the staff side.
      if (row?.source === 'advance')
        await tx`
          update advance_requests set status = 'cancelled', finance_entry_id = null,
            decision_note = coalesce(decision_note || ' · ', '') || 'To‘lov yozuvi o‘chirildi'
          where finance_entry_id = ${parsed.data.entryId}
        `;
      return row;
    });
  } catch (error) {
    console.error('deleteFinanceEntryAction failed', error instanceof Error ? error.message : error);
    return { error: lockedOr(error, 'deleteFailed') };
  }
  if (!gone) {
    const [exists] = await sql`select 1 from finance_entries where id = ${parsed.data.entryId}`.catch(() => []);
    return { error: exists ? 'systemEntry' : 'notFound' };
  }

  logSystemAction(
    'finance.entry_delete',
    `Deleted ${gone.source} entry "${gone.title}" (${gone.amount}) for staff ${gone.staff_id}`,
  );
  revalidateFinance();
  return {};
}
