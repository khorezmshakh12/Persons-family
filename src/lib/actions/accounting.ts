'use server';

import { z } from 'zod';
import type { TransactionSql } from 'postgres';
import { revalidatePath } from 'next/cache';
import { authErrorCode } from '@/lib/auth/require-admin';
import { requireStrategyEditor } from '@/lib/strategy-auth';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { getPayrollSummary } from '@/lib/payroll';
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

type Result = { error?: string };

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const code = z.string().regex(/^\d{4}$/);
const money = z.number().finite().positive().max(1e13);

function done(path = '/[locale]/accounting') {
  revalidatePath(path, 'page');
  revalidatePath('/[locale]/strategy', 'page');
  return {};
}

async function requireEditor(): Promise<{ id: string } | { error: string }> {
  try {
    const { profile } = await requireStrategyEditor();
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
  } catch {
    return { error: 'updateFailed' };
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
  } catch {
    return { error: 'updateFailed' };
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
  } catch {
    return { error: 'updateFailed' };
  }
  logSystemAction('acct.opening', 'Updated opening balances');
  return done();
}

export async function postPayrollAction(month: string): Promise<Result & { count?: number }> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!ym.safeParse(month).success) return { error: 'invalidInput' };
  try {
    const [summary, tax] = await Promise.all([getPayrollSummary(monthStart(month)), loadTax()]);
    const rows = payrollPostings(
      month,
      summary.rows.map((r) => ({ staffId: r.staffId, name: r.name, role: r.role, gross: r.gross, paid: r.paid })),
      tax,
    );
    await replacePostings(`payroll:${month}:`, monthEnd(month), rows, g.id);
    logSystemAction('acct.payroll_post', `Posted payroll ${month} (${rows.length} rows)`);
    done();
    return { count: rows.length };
  } catch {
    return { error: 'updateFailed' };
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
  } catch {
    return { error: 'updateFailed' };
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
  } catch {
    return { error: 'updateFailed' };
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
  } catch {
    return { error: 'updateFailed' };
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
  } catch {
    return { error: 'updateFailed' };
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
  } catch {
    return { error: 'updateFailed' };
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
});

export async function saveCourseAction(input: z.input<typeof courseSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = courseSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    if (v.id) {
      const res = await sql`
        update acct_courses set name = ${v.name}, fee = ${v.fee}, students = ${v.students},
          teacher_cost = ${v.teacherCost}, book_cost = ${v.bookCost}, updated_at = now()
        where id = ${v.id}`;
      if (res.count === 0) return { error: 'notFound' };
    } else {
      await sql`
        insert into acct_courses (name, fee, students, teacher_cost, book_cost, sort_order)
        values (${v.name}, ${v.fee}, ${v.students}, ${v.teacherCost}, ${v.bookCost},
          (select coalesce(max(sort_order), 0) + 1 from acct_courses))`;
    }
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

export async function deleteCourseAction(id: string): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    await sql`delete from acct_courses where id = ${id}`;
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

export type PayrollLine = { staffId: string; name: string; role: string; gross: number; paid: number };

/** Read-only: the real payroll (salary_months + paid finance entries) for a
 * month, for the Soliq & ish haqi tab. */
export async function getPayrollForMonthAction(month: string): Promise<{ error?: string; rows?: PayrollLine[] }> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!ym.safeParse(month).success) return { error: 'invalidInput' };
  try {
    const summary = await getPayrollSummary(monthStart(month));
    return {
      rows: summary.rows
        .filter((r) => r.gross > 0 || r.paid > 0)
        .map((r) => ({ staffId: r.staffId, name: r.name, role: r.role, gross: r.gross, paid: r.paid })),
    };
  } catch {
    return { error: 'loadFailed' };
  }
}
