'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { settle } from '@/lib/settle';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { fieldErrorCodes, type FieldErrors } from '@/lib/form-errors';
import { escapeTelegramText, sendTelegramAs } from '@/lib/telegram';
import { formatUZS } from '@/lib/format-currency';
import { startOfTashkentMonthKey } from '@/lib/time';
import { monthLabel, shiftMonth } from '@/lib/pay-run';
import { isCashBox, syncPayCash } from '@/lib/pay-cash';

/** The DB trigger refuses writes to a month whose pay run is approved. */
const lockedOr = (error: unknown, fallback: string) =>
  error instanceof Error && /period_locked/.test(error.message) ? 'periodLocked' : fallback;

/** `entryId` comes back from an add so the UI can offer "Qaytarish" (undo). */
export type FinanceActionState = { error?: string; fieldErrors?: FieldErrors; entryId?: string } | undefined;

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])-01$/;

/** Every page that shows a ledger row or a total built from one. */
/** One line in the month's history (pay_run_log) per ledger change, so the
 * payroll screen shows who changed what while a month was open. Never fails
 * the save it describes. */
async function logEntry(period: string, actor: string, action: string, detail: Record<string, unknown>) {
  await sql`insert into pay_run_log (period, actor, action, detail) values (${period}, ${actor}, ${action}, ${sql.json(detail as never)})`.catch(
    (error) => console.error('pay_run_log write failed', error instanceof Error ? error.message : error),
  );
}

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
  /** Cash box (acct_accounts.cash_box) a salary / advance payment left from. */
  method: z.string().regex(/^\d{4}$/).optional().or(z.literal('')),
  /** Cancels one system component ('perf:<id>', 'ms:<id>', 'sd:<id>', 'fe:<id>'):
   * written as a correction that points at it, so exactly that one is cancelled. */
  reversalOf: z.string().regex(/^(fe|perf|sd|ms):[0-9a-f-]{36}$/).optional().or(z.literal('')),
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
  const isPayment = kind === 'salary' || kind === 'advance';
  const method = isPayment && parsed.data.method ? parsed.data.method : null;
  if (method && !(await isCashBox(method).catch(() => false))) return { error: 'invalidInput' };

  const reversalOf = parsed.data.reversalOf || null;
  let entryId: string | undefined;
  try {
    [{ id: entryId }] = await sql<{ id: string }[]>`
      insert into finance_entries (staff_id, title, amount, note, created_by, kind, period, method, source, reversal_of)
      values (
        ${parsed.data.staffId}, ${parsed.data.title}, ${amount},
        ${parsed.data.note || (reversalOf ? 'Bekor qilindi' : null)}, ${adminId}, ${kind}, ${period}, ${method},
        ${reversalOf ? 'correction' : 'manual'}, ${reversalOf}
      )
      returning id
    `;
  } catch (error) {
    console.error('addFinanceEntryAction failed', error instanceof Error ? error.message : error);
    return { error: lockedOr(error, 'updateFailed') };
  }

  logSystemAction(
    'finance.entry_add',
    `Added ${kind} entry "${parsed.data.title}" (${amount}) for staff ${parsed.data.staffId} [${period}]`,
  );
  await logEntry(period, adminId, 'entry.add', { staffId: parsed.data.staffId, kind, title: parsed.data.title, amount });
  if (isPayment) await settle(() => syncPayCash(period));

  // Notify the staff member (salary / advance / penalty) once the response
  // is sent — a Telegram hiccup can never fail or slow the save.
  if (kind !== 'adjustment') await settle(async () => {
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
  return { entryId };
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

  await logEntry(parsed.data.period, adminId, 'salary.set', { staffId: parsed.data.staffId, amount: parsed.data.grossAmount });
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
  /** Move the row to another payroll month (both months must be open). */
  period: z.string().regex(PERIOD_RE).optional().or(z.literal('')),
  /** A payment's cash box; ignored on non-payment rows. */
  method: z.string().regex(/^\d{4}$/).optional().or(z.literal('')),
});

/** Edits a ledger row's title, amount, note and (optionally) its payroll
 * month. The kind stays — a payment never silently turns into a bonus. The
 * amount keeps the row's sign: the form takes a plain number, and penalties
 * are stored negative. Hand-made rows, approved advances and the pay run's
 * own payments are editable (Finance v2); KPI / correction / carry rows
 * change in their own workflow. The DB lock still refuses a locked month. */
export async function updateFinanceEntryAction(
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

  const parsed = updateEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput', fieldErrors: fieldErrorCodes(parsed.error) };
  const magnitude = Math.abs(parsed.data.amount);
  const newPeriod = parsed.data.period || null;
  const newMethod = parsed.data.method || null;
  if (newMethod && !(await isCashBox(newMethod).catch(() => false))) return { error: 'invalidInput' };

  type Before = { staff_id: string; title: string; amount: number; period: string; new_period: string; kind: string };
  let before: Before | undefined;
  try {
    [before] = await sql<Before[]>`
      update finance_entries fe set
        title = ${parsed.data.title},
        amount = case when fe.amount < 0 then ${-magnitude}::numeric else ${magnitude}::numeric end,
        note = case when ${parsed.data.note === undefined} then fe.note else ${parsed.data.note || null} end,
        period = coalesce(${newPeriod}::date, fe.period),
        method = case when fe.kind in ('salary', 'advance') then coalesce(${newMethod}, fe.method) else fe.method end
      from (select id, staff_id, title, amount, period from finance_entries where id = ${parsed.data.entryId}) old
      where fe.id = old.id and fe.source in ('manual', 'advance', 'payrun', 'reimburse') and fe.group_id is null
      returning old.staff_id, old.title, old.amount, to_char(old.period, 'YYYY-MM-DD') as period, to_char(fe.period, 'YYYY-MM-DD') as new_period, fe.kind::text as kind
    `;
  } catch (error) {
    console.error('updateFinanceEntryAction failed', error instanceof Error ? error.message : error);
    return { error: lockedOr(error, 'updateFailed') };
  }
  if (!before) {
    const [exists] = await sql<{ grouped: boolean }[]>`select group_id is not null as grouped from finance_entries where id = ${parsed.data.entryId}`.catch(() => []);
    return { error: exists ? (exists.grouped ? 'groupedAdvance' : 'systemEntry') : 'notFound' };
  }

  logSystemAction(
    'finance.entry_update',
    `Edited entry ${parsed.data.entryId} for staff ${before.staff_id}: "${before.title}" (${before.amount}) → "${parsed.data.title}" (${before.amount < 0 ? -magnitude : magnitude})`,
  );
  await logEntry(before.period, adminId, 'entry.edit', {
    staffId: before.staff_id,
    title: parsed.data.title,
    from: before.amount,
    to: before.amount < 0 ? -magnitude : magnitude,
    movedTo: before.new_period !== before.period ? before.new_period : undefined,
  });
  const b = before;
  if (b.kind === 'salary' || b.kind === 'advance') await settle(() => syncPayCash(b.period, b.new_period));
  revalidateFinance();
  return {};
}

export async function deleteFinanceEntryAction(
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

  const parsed = deleteEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  type Gone = { staff_id: string; title: string; amount: number; source: string; kind: string; period: string };
  let gone: Gone | undefined;
  const touched = new Set<string>();
  try {
    gone = await sql.begin(async (tx) => {
      // A split advance goes as a whole (cash + every month's share), so no
      // half of it is left behind as a stray bonus or cut.
      const rows = await tx<(Gone & { id: string })[]>`
        delete from finance_entries
        where (id = ${parsed.data.entryId}
            or group_id = (select group_id from finance_entries where id = ${parsed.data.entryId} and group_id is not null))
          and (source in ('manual', 'advance', 'payrun', 'reimburse') or (source = 'correction' and reversal_of is not null))
        returning staff_id, title, amount, source, kind::text as kind, to_char(period, 'YYYY-MM-DD') as period, id
      `;
      const row = rows.find((r) => r.id === parsed.data.entryId) ?? rows[0];
      for (const r of rows) if (r.period && r.period !== row?.period) touched.add(r.period);
      // A withdrawn advance must not stay "Tasdiqlangan" on the staff side.
      if (row?.source === 'advance')
        await tx`
          update advance_requests set status = 'cancelled', finance_entry_id = null,
            decision_note = coalesce(decision_note || ' · ', '') || 'To‘lov yozuvi o‘chirildi'
          where finance_entry_id = any(${rows.map((r) => r.id)}::uuid[])
        `;
      // …nor a withdrawn reimbursement "Tasdiqlangan".
      if (row?.source === 'reimburse')
        await tx`
          update reimbursements set status = 'cancelled', entry_id = null,
            decision_note = case when decision_note = '' then 'To‘lov yozuvi o‘chirildi' else decision_note || ' · To‘lov yozuvi o‘chirildi' end
          where entry_id = ${parsed.data.entryId}
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
  await logEntry(gone.period, adminId, 'entry.delete', { staffId: gone.staff_id, title: gone.title, amount: gone.amount });
  if (gone.kind === 'salary' || gone.kind === 'advance') {
    const per = gone.period;
    await settle(() => syncPayCash(per, ...touched));
  }
  // The add sent the staff member a Telegram note for these kinds — say it
  // was withdrawn so they don't count on money that isn't coming.
  const g = gone;
  if (g.kind !== 'adjustment') await settle(async () => {
    try {
      const [staff] = await sql<{ telegram_id: number | null }[]>`select telegram_id from profiles where id = ${g.staff_id}`;
      if (staff?.telegram_id)
        await sendTelegramAs(
          'pay',
          staff.telegram_id,
          `<b>↩️ Bekor qilindi</b>
${escapeTelegramText(g.title)}: ${escapeTelegramText(formatUZS(Math.abs(g.amount)))} so‘m — xato kiritilgan, hisobingizdan olib tashlandi.`,
        );
    } catch (error) {
      console.error('Finance notification failed:', error instanceof Error ? error.message : error);
    }
  });
  revalidateFinance();
  return {};
}

/* ------------------------------------------------------------ Finance v2, phase 4 */

type Simple = { error?: string; count?: number; ids?: string[] };

async function requireFinanceManager(): Promise<{ id: string } | { error: string }> {
  try {
    const { user } = await requireCap('finance.manage');
    return { id: user.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

const salaryFromSchema = z.object({
  staffId: z.string().uuid(),
  period: z.string().regex(PERIOD_RE),
  grossAmount: z.number().finite().min(0).max(1e11),
});

/** A pay rise (or cut) from a month on: sets this month and the next eleven
 * to the new base, skipping months whose pay run is already locked. */
export async function setSalaryFromAction(input: z.input<typeof salaryFromSchema>): Promise<Simple> {
  const g = await requireFinanceManager();
  if ('error' in g) return g;
  const p = salaryFromSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { staffId, period, grossAmount } = p.data;
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(period, i));
  let count = 0;
  try {
    const rows = await sql`
      insert into salary_months (staff_id, period, gross_amount, set_by)
      select ${staffId}, m, ${grossAmount}, ${g.id}
      from unnest(${sql.array(months)}::date[]) as t(m)
      where not payroll_period_locked(m)
      on conflict (staff_id, period)
      do update set gross_amount = excluded.gross_amount, set_by = excluded.set_by, set_at = now()
      returning period`;
    count = rows.count;
  } catch (error) {
    console.error('setSalaryFromAction failed', error instanceof Error ? error.message : error);
    return { error: lockedOr(error, 'updateFailed') };
  }
  await logEntry(period, g.id, 'salary.set', { staffId, amount: grossAmount, months: count });
  logSystemAction('finance.salary_from', `Set salary ${grossAmount} for staff ${staffId} from ${period} (${count} months)`);
  revalidateFinance();
  return { count };
}

/** Everyone without a base this month gets last month's base — the usual
 * start of a new month. Never overwrites a base already set. */
export async function copyBasesFromPrevAction(period: string): Promise<Simple> {
  const g = await requireFinanceManager();
  if ('error' in g) return g;
  if (!PERIOD_RE.test(period)) return { error: 'invalidInput' };
  let count = 0;
  try {
    const rows = await sql`
      insert into salary_months (staff_id, period, gross_amount, set_by)
      select s.staff_id, ${period}, s.gross_amount, ${g.id}
      from salary_months s join profiles p on p.id = s.staff_id
      where s.period = ${shiftMonth(period, -1)} and s.gross_amount > 0 and p.is_active
      on conflict (staff_id, period) do nothing
      returning staff_id`;
    count = rows.count;
  } catch (error) {
    console.error('copyBasesFromPrevAction failed', error instanceof Error ? error.message : error);
    return { error: lockedOr(error, 'updateFailed') };
  }
  if (count) await logEntry(period, g.id, 'salary.copy', { count });
  revalidateFinance();
  return { count };
}

const installmentSchema = z.object({
  staffId: z.string().uuid(),
  period: z.string().regex(PERIOD_RE),
  amount: z.number().finite().positive().max(1e11),
  months: z.number().int().min(2).max(12),
  title: z.string().trim().max(200).optional().default(''),
  method: z.string().regex(/^\d{4}$/).optional().or(z.literal('')),
});

/**
 * An advance paid now and held back in equal parts over `months` months:
 * the cash leaves this month (an 'advance' payment), this month gives back
 * all but its own share, and each later month holds back one share. The
 * shares sum to the advance exactly (the last one takes the rounding).
 */
export async function addAdvanceInstallmentsAction(input: z.input<typeof installmentSchema>): Promise<Simple> {
  const g = await requireFinanceManager();
  if ('error' in g) return g;
  const p = installmentSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  const method = v.method || null;
  if (method && !(await isCashBox(method).catch(() => false))) return { error: 'invalidInput' };
  const amount = Math.round(v.amount);
  const share = Math.floor(amount / v.months);
  const last = amount - share * (v.months - 1);
  const title = v.title || `Avans · ${monthLabel(v.period)}`;
  // One group: deleting any of these rows removes the whole advance.
  const base = { staff_id: v.staffId, source: 'advance', created_by: g.id, group_id: crypto.randomUUID() };
  const rows = [
    { ...base, title, amount, kind: 'advance', period: v.period, method, note: `${v.months} oyga bo‘lib ushlanadi` },
    { ...base, title: `Avans: ${v.months - 1} oyga o‘tkazildi`, amount: amount - share, kind: 'adjustment', period: v.period, method: null, note: `1/${v.months} ulush shu oyda` },
    ...Array.from({ length: v.months - 1 }, (_, i) => ({
      ...base,
      title: `Avans qaytarish ${i + 2}/${v.months} · ${monthLabel(v.period)}`,
      amount: -(i === v.months - 2 ? last : share),
      kind: 'adjustment',
      period: shiftMonth(v.period, i + 1),
      method: null,
      note: null,
    })),
  ];
  let ids: string[] = [];
  try {
    const out = await sql<{ id: string }[]>`insert into finance_entries ${sql(rows)} returning id`;
    ids = out.map((r) => r.id);
  } catch (error) {
    console.error('addAdvanceInstallmentsAction failed', error instanceof Error ? error.message : error);
    return { error: lockedOr(error, 'updateFailed') };
  }
  await logEntry(v.period, g.id, 'entry.add', { staffId: v.staffId, kind: 'advance', title: `${title} (${v.months} oyga)`, amount });
  logSystemAction('finance.advance_split', `Advance ${amount} for staff ${v.staffId} from ${v.period} over ${v.months} months`);
  await settle(() => syncPayCash(v.period));
  revalidateFinance();
  return { ids, count: ids.length };
}

const bulkSchema = z.object({
  staffIds: z.array(z.string().uuid()).min(1).max(200),
  kind: z.enum(['adjustment', 'penalty']),
  amount: z.number().finite().positive().max(1e11),
  title: z.string().trim().min(1).max(200),
  period: z.string().regex(PERIOD_RE),
});

/** The same bonus / jarima for many people at once (one insert). */
export async function bulkAddEntriesAction(input: z.input<typeof bulkSchema>): Promise<Simple> {
  const g = await requireFinanceManager();
  if ('error' in g) return g;
  const p = bulkSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  const staffIds = [...new Set(v.staffIds)];
  const amount = v.kind === 'penalty' ? -Math.round(v.amount) : Math.round(v.amount);
  let ids: string[] = [];
  try {
    const rows = await sql<{ id: string }[]>`
      insert into finance_entries ${sql(staffIds.map((staffId) => ({ staff_id: staffId, title: v.title, amount, kind: v.kind, period: v.period, created_by: g.id })))}
      returning id`;
    ids = rows.map((r) => r.id);
  } catch (error) {
    console.error('bulkAddEntriesAction failed', error instanceof Error ? error.message : error);
    return { error: lockedOr(error, 'updateFailed') };
  }
  for (const staffId of staffIds) await logEntry(v.period, g.id, 'entry.add', { staffId, kind: v.kind, title: v.title, amount });
  logSystemAction('finance.bulk_add', `Added ${v.kind} "${v.title}" (${amount}) for ${ids.length} staff [${v.period}]`);
  revalidateFinance();
  return { ids, count: ids.length };
}

export type AttendanceProration = { workDays: number; present: number };

/** Attendance for prorating a base: days the centre marked anyone present
 * this month vs days this person was present (office / late / remote / left). */
export async function getAttendanceProrationAction(staffId: string, period: string): Promise<AttendanceProration | { error: string }> {
  const g = await requireFinanceManager();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(staffId).success || !PERIOD_RE.test(period)) return { error: 'invalidInput' };
  try {
    const [row] = await sql<{ work_days: number; present: number }[]>`
      select
        count(distinct day) filter (where status <> 'absent')::int as work_days,
        count(distinct day) filter (where status <> 'absent' and profile_id = ${staffId})::int as present
      from staff_attendance
      where day >= ${period}::date and day < (${period}::date + interval '1 month')`;
    return { workDays: row?.work_days ?? 0, present: row?.present ?? 0 };
  } catch (error) {
    console.error('getAttendanceProrationAction failed', error instanceof Error ? error.message : error);
    return { error: 'loadFailed' };
  }
}
