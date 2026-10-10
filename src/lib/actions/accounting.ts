'use server';

import { z } from 'zod';
import type { TransactionSql } from 'postgres';
import { revalidatePath } from 'next/cache';
import { authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { loadPayLines, loadPayRun } from '@/lib/pay-run-data';
import { isRelevant } from '@/lib/pay-run';
import { teacherCostFor } from '@/lib/accounting-ma';
import {
  DEFAULT_TAX,
  depreciation,
  disposalPostings,
  monthEnd,
  monthStart,
  payrollPostings,
  type Asset,
  type TaxSettings,
} from '@/lib/accounting';
import { requireCap } from '@/lib/auth/require-admin';
import { loadClosePeriod, type ClosePeriod } from '@/lib/acct-close';
import { createSignedReadUrl, createSignedWriteUrl, deleteObject } from '@/lib/gcp/storage';
import { CASH_ACC, CASH_CATS, cashDescription, templateDoc } from '@/lib/accounting-cash';

type Result = { error?: string };

/** A closed month's journal is frozen by a DB trigger ('period_closed'). */
const closedOr = (error: unknown) => (error instanceof Error && /period_closed/.test(error.message) ? 'periodClosed' : 'updateFailed');

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const code = z.string().regex(/^\d{4}$/);
const money = z.number().finite().positive().max(1e13);

function done(path = '/[locale]/accounting') {
  revalidatePath(path, 'page');
  revalidatePath('/[locale]/strategy', 'page');
  return {};
}

async function requireEditor(cap: 'accounting.edit' | 'strategy.finance' = 'accounting.edit'): Promise<{ id: string } | { error: string }> {
  try {
    const { profile } = await requireCap(cap);
    return { id: profile.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

async function loadTax(): Promise<TaxSettings> {
  const [row] = await sql<{ value: Partial<TaxSettings> }[]>`select value from acct_settings where key = 'tax'`;
  return { ...DEFAULT_TAX, ...(row?.value ?? {}) };
}

/** Replace every journal row whose source starts with `prefix` by `rows`,
 * atomically — re-posting a month never duplicates it. */
async function replacePostings(
  prefix: string,
  date: string,
  rows: { debit: string; credit: string; amount: number; description: string; source: string }[],
  by: string,
) {
  await sql.begin(async (tx) => {
    await tx`delete from acct_entries where source like ${`${prefix}%`}`;
    for (const r of rows) {
      await tx`
        insert into acct_entries (entry_date, doc, description, debit, credit, amount, source, created_by)
        values (${date}, 'AUTO', ${r.description}, ${r.debit}, ${r.credit}, ${r.amount}, ${r.source}, ${by})`;
    }
  });
}

const entrySchema = z.object({
  /** Edit an existing manual entry (auto postings are re-posted instead). */
  id: z.string().uuid().optional(),
  date: ymd,
  doc: z.string().trim().max(40).default(''),
  description: z.string().trim().min(1).max(300),
  debit: code,
  credit: code,
  amount: money,
});

export async function addJournalEntryAction(input: z.input<typeof entrySchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = entrySchema.safeParse(input);
  if (!p.success || p.data.debit === p.data.credit) return { error: 'invalidInput' };
  const amount = Math.round(p.data.amount * 100) / 100;
  try {
    if (p.data.id) {
      const res = await sql`
        update acct_entries set entry_date = ${p.data.date}, doc = ${p.data.doc}, description = ${p.data.description},
          debit = ${p.data.debit}, credit = ${p.data.credit}, amount = ${amount}
        where id = ${p.data.id} and source is null`;
      if (res.count === 0) return { error: 'notFound' };
    } else {
      await sql`
        insert into acct_entries (entry_date, doc, description, debit, credit, amount, created_by)
        values (${p.data.date}, ${p.data.doc}, ${p.data.description}, ${p.data.debit}, ${p.data.credit},
          ${amount}, ${g.id})`;
    }
  } catch (error) {
    return { error: closedOr(error) };
  }
  logSystemAction('acct.entry', `${p.data.debit}/${p.data.credit} ${p.data.amount} "${p.data.description}"`);
  return done();
}

export async function deleteJournalEntryAction(id: string): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    // Auto postings (payroll, depreciation, tax) are managed by re-posting.
    const res = await sql`delete from acct_entries where id = ${id} and source is null`;
    if (res.count === 0) return { error: 'notFound' };
  } catch (error) {
    return { error: closedOr(error) };
  }
  logSystemAction('acct.entry_delete', `Deleted journal entry ${id}`);
  return done();
}

export async function setOpeningBalancesAction(values: Record<string, number>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = z.record(code, z.number().finite().min(0).max(1e13)).safeParse(values);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql.begin(async (tx) => {
      for (const [c, amount] of Object.entries(p.data)) {
        await tx`
          insert into acct_opening (code, amount) values (${c}, ${amount})
          on conflict (code) do update set amount = excluded.amount, updated_at = now()`;
      }
    });
  } catch (error) {
    return { error: closedOr(error) };
  }
  logSystemAction('acct.opening', 'Updated opening balances');
  return done();
}

const overridesSchema = z.record(z.string().uuid(), z.number().finite().min(0).max(1e12)).default({});

/** Posts the month's payroll. `overrides` (staffId → gross) are the
 * accountant's corrections to the accrued amount made in the vedomost. */
export async function postPayrollAction(month: string, overrides: Record<string, number> = {}): Promise<Result & { count?: number }> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const ov = overridesSchema.safeParse(overrides);
  if (!ym.safeParse(month).success || !ov.success) return { error: 'invalidInput' };
  try {
    const [base, tax] = await Promise.all([payrollBase(month), loadTax()]);
    const rows = payrollPostings(
      month,
      base.map((r) => ({ ...r, gross: ov.data[r.staffId] ?? r.gross })),
      tax,
    );
    await replacePostings(`payroll:${month}:`, monthEnd(month), rows, g.id);
    // An accountant's hand edit of an accrued amount is a decision — keep it on record.
    const edited = base.filter((r) => ov.data[r.staffId] !== undefined && ov.data[r.staffId] !== r.gross);
    logSystemAction(
      'acct.payroll_post',
      `Posted payroll ${month} (${rows.length} rows)` +
        (edited.length ? `; edited: ${edited.map((r) => `${r.staffId} ${r.gross}→${ov.data[r.staffId]}`).join(', ')}` : ''),
    );
    done();
    return { count: rows.length };
  } catch (error) {
    return { error: closedOr(error) };
  }
}

export async function postDepreciationAction(month: string): Promise<Result & { amount?: number }> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!ym.safeParse(month).success) return { error: 'invalidInput' };
  try {
    const assets = await sql<Asset[]>`select id, name, category, cost, acquired, life_years, disposed from acct_assets`;
    const amount = Math.round(assets.reduce((a, x) => a + depreciation(x, month).charge, 0) * 100) / 100;
    await replacePostings(
      `depr:${month}`,
      monthEnd(month),
      amount > 0
        ? [{ debit: '9420', credit: '0200', amount, description: `Asosiy vositalar eskirishi (${month})`, source: `depr:${month}` }]
        : [],
      g.id,
    );
    done();
    return { amount };
  } catch (error) {
    return { error: closedOr(error) };
  }
}

export async function postTurnoverTaxAction(month: string): Promise<Result & { amount?: number }> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!ym.safeParse(month).success) return { error: 'invalidInput' };
  try {
    const tax = await loadTax();
    const [{ revenue }] = await sql<{ revenue: number }[]>`
      select coalesce(sum(case when credit = '9030' then amount else 0 end), 0)
           - coalesce(sum(case when debit = '9030' then amount else 0 end), 0) as revenue
      from acct_entries where entry_date between ${monthStart(month)} and ${monthEnd(month)}`;
    const amount = tax.regime === 'turn' ? Math.round(Number(revenue) * tax.turnover) / 100 : 0;
    await replacePostings(
      `tax:${month}`,
      monthEnd(month),
      amount > 0
        ? [{ debit: '9810', credit: '6410', amount, description: `Aylanmadan olinadigan soliq ${tax.turnover}% (${month})`, source: `tax:${month}` }]
        : [],
      g.id,
    );
    done();
    return { amount };
  } catch (error) {
    return { error: closedOr(error) };
  }
}

const taxSchema = z.object({
  turnover: z.number().min(0).max(100),
  pit: z.number().min(0).max(100),
  social: z.number().min(0).max(100),
  profit: z.number().min(0).max(100),
  vat: z.number().min(0).max(100),
  regime: z.enum(['turn', 'gen']),
  vatExempt: z.boolean(),
  minCash: z.number().min(0).max(1e13),
});

export async function saveTaxSettingsAction(input: TaxSettings): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = taxSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`
      insert into acct_settings (key, value) values ('tax', ${sql.json(p.data)})
      on conflict (key) do update set value = excluded.value`;
  } catch (error) {
    return { error: closedOr(error) };
  }
  logSystemAction('acct.tax_settings', JSON.stringify(p.data));
  return done();
}

const assetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(80).default(''),
  cost: money,
  acquired: ymd,
  lifeYears: z.number().int().min(1).max(50),
  /** Also book the purchase: Dt 0100 / Kt 5110. */
  journal: z.boolean().default(false),
});

export async function addAssetAction(input: z.input<typeof assetSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = assetSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    await sql.begin(async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into acct_assets (name, category, cost, acquired, life_years)
        values (${v.name}, ${v.category}, ${v.cost}, ${v.acquired}, ${v.lifeYears}) returning id`;
      if (v.journal) {
        await tx`
          insert into acct_entries (entry_date, doc, description, debit, credit, amount, source, created_by)
          values (${v.acquired}, 'AV', ${`Asosiy vosita xaridi: ${v.name}`}, '0100', '5110', ${v.cost},
            ${`asset:${row.id}`}, ${g.id})`;
      }
    });
  } catch (error) {
    return { error: closedOr(error) };
  }
  logSystemAction('acct.asset_add', `Asset "${v.name}" ${v.cost}`);
  return done();
}

export async function deleteAssetAction(id: string): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    await sql.begin(async (tx) => {
      await tx`delete from acct_entries where source = ${`asset:${id}`}`;
      await tx`delete from acct_entries where source = ${`dispose:${id}`}`;
      const res = await tx`delete from acct_assets where id = ${id}`;
      if (res.count === 0) throw new NotFound();
      // Re-state every month whose depreciation was already posted, so the
      // removed asset's charge doesn't linger in the journal.
      await restateDepreciation(tx);
    });
  } catch (e) {
    return { error: e instanceof NotFound ? 'notFound' : 'updateFailed' };
  }
  logSystemAction('acct.asset_delete', `Deleted asset ${id}`);
  return done();
}

class NotFound extends Error {}

type Tx = TransactionSql<{}>; // eslint-disable-line @typescript-eslint/no-empty-object-type

/** Recompute every already-posted monthly depreciation row from the current
 * asset list (after an asset is removed, disposed or restored). */
async function restateDepreciation(tx: Tx) {
  const assets = await tx<Asset[]>`select id, name, category, cost, acquired, life_years, disposed from acct_assets`;
  const posted = await tx<{ source: string; id: string }[]>`select id, source from acct_entries where source like 'depr:%'`;
  for (const row of posted) {
    const month = row.source.slice(5);
    const amount = Math.round(assets.reduce((a, x) => a + depreciation(x, month).charge, 0) * 100) / 100;
    if (amount > 0) await tx`update acct_entries set amount = ${amount} where id = ${row.id}`;
    else await tx`delete from acct_entries where id = ${row.id}`;
  }
}

const disposeSchema = z.object({ id: z.string().uuid(), date: ymd.nullable() });

/**
 * Dispose of (write off) a fixed asset on `date`, or restore it with
 * `date: null`. Depreciation stops after the disposal month; if the purchase
 * was booked in the journal, the write-off is booked too (see disposalPostings).
 */
export async function disposeAssetAction(input: z.input<typeof disposeSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = disposeSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { id, date } = p.data;
  try {
    await sql.begin(async (tx) => {
      const [asset] = await tx<Asset[]>`
        select id, name, category, cost, acquired, life_years, disposed from acct_assets where id = ${id} for update`;
      if (!asset) throw new NotFound();
      if (date && date < asset.acquired) throw new Invalid();
      await tx`update acct_assets set disposed = ${date} where id = ${id}`;
      await tx`delete from acct_entries where source = ${`dispose:${id}`}`;
      const [booked] = await tx`select 1 from acct_entries where source = ${`asset:${id}`}`;
      if (date && booked) {
        for (const r of disposalPostings({ ...asset, disposed: date })) {
          await tx`
            insert into acct_entries (entry_date, doc, description, debit, credit, amount, source, created_by)
            values (${date}, 'AV', ${r.description}, ${r.debit}, ${r.credit}, ${r.amount}, ${`dispose:${id}`}, ${g.id})`;
        }
      }
      await restateDepreciation(tx);
    });
  } catch (e) {
    return { error: e instanceof NotFound ? 'notFound' : e instanceof Invalid ? 'invalidInput' : 'updateFailed' };
  }
  logSystemAction('acct.asset_dispose', `${date ? 'Disposed' : 'Restored'} asset ${id}`);
  return done();
}

class Invalid extends Error {}

const budgetSchema = z.object({ month: ym, code, amount: z.number().finite().min(0).max(1e13) });

export async function setBudgetAction(input: z.input<typeof budgetSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = budgetSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`
      insert into acct_budget (period, code, amount) values (${monthStart(p.data.month)}, ${p.data.code}, ${p.data.amount})
      on conflict (period, code) do update set amount = excluded.amount`;
  } catch (error) {
    return { error: closedOr(error) };
  }
  return done();
}

const courseSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  fee: z.number().finite().min(0).max(1e11),
  students: z.number().int().min(0).max(100000),
  teacherCost: z.number().finite().min(0).max(1e12),
  bookCost: z.number().finite().min(0).max(1e11),
  teacherShare: z.number().finite().min(0).max(100).nullable().optional(),
  hoursMonth: z.number().finite().min(0).max(100000).optional(),
});

export async function saveCourseAction(input: z.input<typeof courseSchema>): Promise<Result> {
  // Course tariffs are also edited from Strategy › Moliya (strategy.finance).
  let g = await requireEditor();
  if ('error' in g) g = await requireEditor('strategy.finance');
  if ('error' in g) return g;
  const p = courseSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  const share = v.teacherShare ?? null;
  const hours = v.hoursMonth ?? 0;
  // Teacher-share pay model: the monthly cost follows fee × students × share.
  const teacherCost = teacherCostFor(v.fee, v.students, share, v.teacherCost);
  try {
    if (v.id) {
      const res = await sql`
        update acct_courses set name = ${v.name}, fee = ${v.fee}, students = ${v.students},
          teacher_cost = ${teacherCost}, book_cost = ${v.bookCost}, teacher_share = ${share},
          hours_month = ${hours}, updated_at = now()
        where id = ${v.id}`;
      if (res.count === 0) return { error: 'notFound' };
    } else {
      await sql`
        insert into acct_courses (name, fee, students, teacher_cost, book_cost, teacher_share, hours_month, sort_order)
        values (${v.name}, ${v.fee}, ${v.students}, ${teacherCost}, ${v.bookCost}, ${share}, ${hours},
          (select coalesce(max(sort_order), 0) + 1 from acct_courses))`;
    }
  } catch (error) {
    return { error: closedOr(error) };
  }
  return done();
}

export async function deleteCourseAction(id: string): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    await sql`delete from acct_courses where id = ${id}`;
  } catch (error) {
    return { error: closedOr(error) };
  }
  return done();
}

export type PayrollLine = { staffId: string; name: string; role: string; gross: number; paid: number };

/**
 * A month's accrued payroll, per person, from the pay run — the same
 * numbers Moliya shows. Once the run is approved the frozen snapshot is the
 * truth (what was approved is what is booked); before that, the live
 * payable. Everyone with pay that month is included, not only active staff
 * — someone who left mid-month was still paid. Never trusts amounts sent by
 * the browser.
 */
async function payrollBase(month: string): Promise<PayrollLine[]> {
  const period = monthStart(month);
  const [lines, run] = await Promise.all([loadPayLines(period), loadPayRun(period)]);
  const locked = run.status === 'approved' || run.status === 'paid';
  const frozen = new Map((locked ? (run.snapshot ?? []) : []).map((s) => [s.staffId, s.payable]));
  return lines
    .filter(isRelevant)
    .map((l) => ({
      staffId: l.staffId,
      name: l.name,
      role: l.role,
      gross: Math.max(0, frozen.get(l.staffId) ?? l.payable),
      paid: l.paid,
    }))
    .filter((r) => r.gross > 0 || r.paid > 0);
}

/** Read-only: the real payroll for a month, for the Soliq & ish haqi tab. */
export async function getPayrollForMonthAction(month: string): Promise<{ error?: string; rows?: PayrollLine[] }> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!ym.safeParse(month).success) return { error: 'invalidInput' };
  try {
    return { rows: await payrollBase(month) };
  } catch {
    return { error: 'loadFailed' };
  }
}

const planSchema = z.object({ month: ym, students: z.number().int().min(0).max(1e6) });

/** Planned head-count for a month — drives the flexible budget. */
export async function setPlanStudentsAction(input: z.input<typeof planSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = planSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`
      insert into acct_settings (key, value) values ('plan_students', ${sql.json({ [p.data.month]: p.data.students })})
      on conflict (key) do update set value = acct_settings.value || excluded.value`;
  } catch (error) {
    return { error: closedOr(error) };
  }
  logSystemAction('acct.plan_students', `${p.data.month}: ${p.data.students}`);
  return done();
}

const budgetLineSchema = z.object({ period: ymd, code });

export async function deleteBudgetAction(input: z.input<typeof budgetLineSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = budgetLineSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from acct_budget where period = ${p.data.period} and code = ${p.data.code}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch (error) {
    return { error: closedOr(error) };
  }
  logSystemAction('acct.budget_delete', `${p.data.period} ${p.data.code}`);
  return done();
}

/* ------------------------------------------------------------ month close */

export async function getClosePeriodAction(month: string): Promise<{ error?: string; period?: ClosePeriod }> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!ym.safeParse(month).success) return { error: 'invalidInput' };
  try {
    return { period: await loadClosePeriod(month) };
  } catch (error) {
    console.error('getClosePeriodAction failed', error instanceof Error ? error.message : error);
    return { error: 'loadFailed' };
  }
}

/** Close a month: blocking checks must pass; the DB then freezes it. */
export async function closePeriodAction(month: string, note = ''): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!ym.safeParse(month).success) return { error: 'invalidInput' };
  try {
    const p = await loadClosePeriod(month);
    if (p.closed) return { error: 'alreadyClosed' };
    if (p.checks.some((c) => c.blocking && !c.ok)) return { error: 'blocked' };
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${`acct-close:${month}`}))`;
      await tx`
        insert into acct_periods (month, closed_at, closed_by, note) values (${`${month}-01`}, now(), ${g.id}, ${note || null})
        on conflict (month) do update set closed_at = now(), closed_by = excluded.closed_by, note = excluded.note`;
      await tx`insert into acct_period_log (month, actor, action, reason) values (${`${month}-01`}, ${g.id}, 'close', ${note || null})`;
    });
  } catch {
    return { error: 'updateFailed' };
  }
  logSystemAction('acct.close', `Closed ${month}`);
  return done();
}

export async function reopenPeriodAction(month: string, reason: string): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!ym.safeParse(month).success || reason.trim().length < 3) return { error: 'reasonRequired' };
  try {
    const res = await sql`update acct_periods set closed_at = null, closed_by = null where month = ${`${month}-01`} and closed_at is not null`;
    if (res.count === 0) return { error: 'notClosed' };
    await sql`insert into acct_period_log (month, actor, action, reason) values (${`${month}-01`}, ${g.id}, 'reopen', ${reason.trim()})`;
  } catch {
    return { error: 'updateFailed' };
  }
  logSystemAction('acct.reopen', `Reopened ${month}: ${reason.trim()}`);
  return done();
}

export async function markBudgetReviewedAction(month: string, reviewed: boolean): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!ym.safeParse(month).success) return { error: 'invalidInput' };
  try {
    await sql`
      insert into acct_periods (month, budget_review) values (${`${month}-01`}, ${reviewed})
      on conflict (month) do update set budget_review = excluded.budget_review`;
    if (reviewed) await sql`insert into acct_period_log (month, actor, action) values (${`${month}-01`}, ${g.id}, 'review')`;
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

/* ------------------------------------------------------------ receipts (v8-B) */

const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

/** Signed upload URL for a receipt photo / PDF of one journal entry. The
 * path is pinned to the entry (receipts/<entry id>/…) and re-checked on
 * attach, so a client can't point an entry at someone else's file. */
export async function requestReceiptUploadAction(entryId: string, fileName: string, fileType: string, size: number): Promise<{ error?: string; path?: string; url?: string }> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(entryId).success) return { error: 'invalidInput' };
  if (!RECEIPT_TYPES.includes(fileType)) return { error: 'fileType' };
  if (!(size > 0 && size <= 10 * 1024 * 1024)) return { error: 'fileSize' };
  // Only manual cash movements carry receipts (auto postings are re-posted).
  const [e] = await sql<{ id: string }[]>`select id from acct_entries where id = ${entryId} and source is null`;
  if (!e) return { error: 'notFound' };
  const path = `receipts/${entryId}/${crypto.randomUUID()}-${fileName.replace(/[^\w.\-]+/g, '_').slice(-80)}`;
  try {
    return { path, url: await createSignedWriteUrl('contract-files', path, fileType) };
  } catch {
    return { error: 'uploadFailed' };
  }
}

/** Attaches (path) or removes (null) an entry's receipt. Allowed in a closed
 * month too — the trigger lets a receipt-only change through. */
export async function setEntryReceiptAction(entryId: string, path: string | null): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(entryId).success) return { error: 'invalidInput' };
  if (path !== null && !new RegExp(`^receipts/${entryId}/[0-9a-f-]{36}-[\\w.\\-]{1,80}$`).test(path)) return { error: 'invalidInput' };
  let old: string | null = null;
  try {
    // Row lock: two attaches at once must not both see the same old file.
    const found = await sql.begin(async (tx) => {
      const [cur] = await tx<{ receipt_path: string | null }[]>`
        select receipt_path from acct_entries where id = ${entryId} and source is null for update`;
      if (!cur) return false;
      await tx`update acct_entries set receipt_path = ${path} where id = ${entryId}`;
      old = cur.receipt_path;
      return true;
    });
    if (!found) return { error: 'notFound' };
  } catch (error) {
    return { error: closedOr(error) };
  }
  if (old && old !== path) await deleteObject('contract-files', old).catch(() => {});
  logSystemAction('acct.receipt', `${path ? 'Attached' : 'Removed'} receipt on entry ${entryId}`);
  return done();
}

export async function getReceiptUrlAction(entryId: string): Promise<{ error?: string; url?: string }> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(entryId).success) return { error: 'invalidInput' };
  const [e] = await sql<{ receipt_path: string | null }[]>`select receipt_path from acct_entries where id = ${entryId}`;
  if (!e?.receipt_path) return { error: 'notFound' };
  return { url: await createSignedReadUrl('contract-files', e.receipt_path, 600) };
}

/* ------------------------------------------------------------ templates (v8-B) */

const templateSchema = z.object({
  id: z.string().uuid().optional(),
  cat: z.string().refine((k) => CASH_CATS.some((c) => c.k === k)),
  method: z.enum(CASH_ACC),
  amount: money,
  note: z.string().trim().max(200).default(''),
  day: z.number().int().min(1).max(28),
  active: z.boolean().default(true),
});

export async function saveCashTemplateAction(input: z.input<typeof templateSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = templateSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    if (v.id) {
      const res = await sql`
        update acct_templates set cat = ${v.cat}, method = ${v.method}, amount = ${v.amount}, note = ${v.note}, day = ${v.day}, active = ${v.active}
        where id = ${v.id}`;
      if (res.count === 0) return { error: 'notFound' };
    } else {
      await sql`
        insert into acct_templates (cat, method, amount, note, day, active, created_by)
        values (${v.cat}, ${v.method}, ${v.amount}, ${v.note}, ${v.day}, ${v.active}, ${g.id})`;
    }
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

export async function deleteCashTemplateAction(id: string): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  await sql`delete from acct_templates where id = ${id}`;
  return done();
}

/** Writes this month's entry for every active template that doesn't have
 * one yet (matched by the TPL:<id> doc tag). Safe to press twice. */
export async function applyCashTemplatesAction(month: string): Promise<Result & { count?: number }> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!ym.safeParse(month).success) return { error: 'invalidInput' };
  const tpls = await sql<{ id: string; cat: string; method: string; amount: number; note: string; day: number }[]>`
    select id, cat, method, amount, note, day from acct_templates
    where active and to_char(created_at at time zone 'Asia/Tashkent', 'YYYY-MM') <= ${month}`;
  let count = 0;
  try {
    await sql.begin(async (tx) => {
      // One applier per month at a time — the doc-tag check below is then exact.
      await tx`select pg_advisory_xact_lock(hashtext(${`acct-tpl:${month}`}))`;
      for (const t of tpls) {
        const cat = CASH_CATS.find((c) => c.k === t.cat);
        if (!cat) continue;
        const [exists] = await tx`
          select 1 from acct_entries where doc = ${templateDoc(t.id)} and entry_date between ${monthStart(month)} and ${monthEnd(month)}`;
        if (exists) continue;
        const [debit, credit] = cat.dir === 'in' ? [t.method, cat.acc] : [cat.acc, t.method];
        await tx`
          insert into acct_entries (entry_date, doc, description, debit, credit, amount, created_by)
          values (${`${month}-${String(t.day).padStart(2, '0')}`}, ${templateDoc(t.id)}, ${cashDescription(cat.n, t.note)},
                  ${debit}, ${credit}, ${t.amount}, ${g.id})`;
        count++;
      }
    });
  } catch (error) {
    return { error: closedOr(error) };
  }
  if (count) logSystemAction('acct.templates', `Applied ${count} recurring entries for ${month}`);
  return { ...done(), count };
}
