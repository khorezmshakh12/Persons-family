'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authErrorCode, requireCap, requireSection } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';
import { tashkentMonthKey } from '@/lib/time';
import { SCENARIO_LABEL, monthName, pctFor, shiftMonth, type Scenario } from '@/lib/kpi-plan';

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

const month01 = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/);
const scenario = z.enum(['bad', 'good', 'great']);
const text = (max: number) => z.string().trim().max(max);

function done(): Result {
  revalidatePath('/[locale]/my-kpi', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
  return {};
}

/** Current Tashkent month as YYYY-MM-01. */
const thisMonth = () => `${tashkentMonthKey()}-01`;

async function notify(userId: string, message: string) {
  try {
    const [p] = await sql<{ telegram_id: number | null }[]>`select telegram_id from profiles where id = ${userId}`;
    if (p?.telegram_id) await sendTelegramMessage(p.telegram_id, message);
  } catch (error) {
    console.error('kpi notify failed', error instanceof Error ? error.message : error);
  }
}

/* ------------------------------------------------------------ employee */

const itemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(['number', 'money', 'percent', 'projects', 'text']),
  unit: text(20).default(''),
  target_bad: text(2000).default(''),
  target_good: text(2000).default(''),
  target_great: text(2000).default(''),
});

const planSchema = z.object({
  month: month01,
  scenarios: z.object({
    bad: z.object({ summary: text(4000) }),
    good: z.object({ summary: text(4000) }),
    great: z.object({ summary: text(4000) }),
  }),
  items: z.array(itemSchema).min(1).max(15),
  submit: z.boolean(),
});

/** Save (draft) or submit the viewer's own plan for this or next month. */
export async function saveKpiPlanAction(input: z.input<typeof planSchema>): Promise<Result<{ id: string }>> {
  let userId: string;
  try {
    ({ profile: { id: userId } } = await requireSection('kpi'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = planSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  const now = thisMonth();
  if (v.month !== now && v.month !== shiftMonth(now, 1)) return { error: 'invalidInput' };
  if (v.submit) {
    // A submitted plan has to be complete: every scenario described and every row targeted.
    const missing =
      (['bad', 'good', 'great'] as const).some((s) => !v.scenarios[s].summary) ||
      v.items.some((it) => !it.target_bad || !it.target_good || !it.target_great);
    if (missing) return { error: 'incomplete' };
  }
  try {
    const id = await sql.begin(async (tx) => {
      const [cur] = await tx<{ id: string; status: string }[]>`
        select id, status from kpi_plans where user_id = ${userId} and month = ${v.month} for update`;
      // Approved plans are locked; the CEO has to return them first.
      if (cur?.status === 'approved') return null;
      const status = v.submit ? 'submitted' : cur?.status === 'submitted' ? 'submitted' : cur?.status === 'returned' ? 'returned' : 'draft';
      const [row] = cur
        ? await tx<{ id: string }[]>`
            update kpi_plans set scenarios = ${sql.json(v.scenarios)}, status = ${status},
              submitted_at = case when ${v.submit} then now() else submitted_at end, updated_at = now()
            where id = ${cur.id} returning id`
        : await tx<{ id: string }[]>`
            insert into kpi_plans (user_id, month, scenarios, status, submitted_at)
            values (${userId}, ${v.month}, ${sql.json(v.scenarios)}, ${status}, ${v.submit ? sql`now()` : null})
            returning id`;
      await tx`delete from kpi_items where plan_id = ${row.id}`;
      for (const [i, it] of v.items.entries()) {
        await tx`
          insert into kpi_items (plan_id, title, kind, unit, target_bad, target_good, target_great, sort_order)
          values (${row.id}, ${it.title}, ${it.kind}, ${it.unit}, ${it.target_bad}, ${it.target_good}, ${it.target_great}, ${i})`;
      }
      return row.id;
    });
    if (!id) return { error: 'locked' };
    if (v.submit) logSystemAction('kpi.submit', `KPI plan ${v.month}`);
    done();
    return { id };
  } catch {
    return { error: 'updateFailed' };
  }
}

/** Remove the viewer's own plan while it is still a draft or returned. */
export async function deleteKpiPlanAction(planId: string): Promise<Result> {
  let userId: string;
  try {
    ({ profile: { id: userId } } = await requireSection('kpi'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!z.string().uuid().safeParse(planId).success) return { error: 'invalidInput' };
  try {
    const res = await sql`
      delete from kpi_plans where id = ${planId} and user_id = ${userId} and status in ('draft', 'returned')`;
    if (res.count === 0) return { error: 'locked' };
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

const selfSchema = z.object({
  planId: z.string().uuid(),
  result: scenario,
  note: text(4000).default(''),
  actuals: z.record(z.string().uuid(), text(2000)),
});

/** Month-end self-assessment on an approved, not yet graded plan. */
export async function selfAssessKpiAction(input: z.input<typeof selfSchema>): Promise<Result> {
  let userId: string;
  try {
    ({ profile: { id: userId } } = await requireSection('kpi'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = selfSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const res = await sql.begin(async (tx) => {
      const r = await tx`
        update kpi_plans set self_result = ${v.result}, self_note = ${v.note}, self_at = now(), updated_at = now()
        where id = ${v.planId} and user_id = ${userId} and status = 'approved' and grade is null`;
      if (r.count === 0) return false;
      for (const [itemId, actual] of Object.entries(v.actuals)) {
        await tx`update kpi_items set actual = ${actual} where id = ${itemId} and plan_id = ${v.planId}`;
      }
      return true;
    });
    if (!res) return { error: 'locked' };
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

/* ------------------------------------------------------------ CEO */

const pct = z.number().finite().min(-100).max(200);
const reviewSchema = z.object({
  planId: z.string().uuid(),
  decision: z.enum(['approve', 'return']),
  note: text(2000).default(''),
  pctBad: pct,
  pctGood: pct,
  pctGreat: pct,
});

/** Approve next month's plan (fixing each scenario's % of salary) or send it back. */
export async function reviewKpiPlanAction(input: z.input<typeof reviewSchema>): Promise<Result> {
  let reviewerId: string;
  try {
    ({ profile: { id: reviewerId } } = await requireCap('kpi.review'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = reviewSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  if (v.decision === 'return' && !v.note) return { error: 'noteRequired' };
  try {
    const [row] = await sql<{ user_id: string; month: string }[]>`
      update kpi_plans set
        status = ${v.decision === 'approve' ? 'approved' : 'returned'},
        review_note = ${v.note || null}, reviewed_by = ${reviewerId}, reviewed_at = now(),
        pct_bad = ${v.pctBad}, pct_good = ${v.pctGood}, pct_great = ${v.pctGreat}, updated_at = now()
      where id = ${v.planId} and status in ('submitted', 'approved', 'returned') and grade is null
      returning user_id, month::text as month`;
    if (!row) return { error: 'notFound' };
    logSystemAction('kpi.review', `KPI ${v.decision} ${row.month}`);
    await notify(
      row.user_id,
      v.decision === 'approve'
        ? `✅ ${monthName(row.month)} KPI rejangiz tasdiqlandi.\nYomon: ${v.pctBad}% · Yaxshi: ${v.pctGood}% · Juda yaxshi: +${v.pctGreat}%`
        : `↩️ ${monthName(row.month)} KPI rejangiz qaytarildi.\nIzoh: ${escapeTelegramText(v.note)}\nTuzatib, qayta topshiring.`,
    );
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

const gradeSchema = z.object({
  planId: z.string().uuid(),
  grade: scenario,
  /** Manual override of the computed amount (so'm, signed). */
  amount: z.number().finite().min(-1e11).max(1e11).nullable(),
  note: text(2000).default(''),
});

/**
 * Grade a finished month: the scenario reached → % of that month's salary
 * (salary_months.gross_amount) → a finance_entries adjustment for the month.
 * Re-grading replaces the previous entry, in the same transaction.
 */
export async function gradeKpiPlanAction(input: z.input<typeof gradeSchema>): Promise<Result<{ amount: number }>> {
  let reviewerId: string;
  try {
    ({ profile: { id: reviewerId } } = await requireCap('kpi.review'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = gradeSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const out = await sql.begin(async (tx) => {
      const [plan] = await tx<
        { id: string; user_id: string; month: string; pct_bad: number; pct_good: number; pct_great: number; finance_entry_id: string | null }[]
      >`
        select id, user_id, month::text as month, pct_bad::float8 as pct_bad, pct_good::float8 as pct_good,
               pct_great::float8 as pct_great, finance_entry_id
        from kpi_plans where id = ${v.planId} and status = 'approved' for update`;
      if (!plan) return null;
      if (plan.month > thisMonth()) return 'future' as const;
      const [sal] = await tx<{ gross: number }[]>`
        select gross_amount::float8 as gross from salary_months
        where staff_id = ${plan.user_id} and period <= ${plan.month}
        order by period desc limit 1`;
      const percent = pctFor(plan, v.grade as Scenario);
      const amount = v.amount ?? Math.round(((sal?.gross ?? 0) * percent) / 100);
      if (plan.finance_entry_id) await tx`delete from finance_entries where id = ${plan.finance_entry_id}`;
      let entryId: string | null = null;
      if (amount !== 0) {
        const [e] = await tx<{ id: string }[]>`
          insert into finance_entries (staff_id, title, amount, note, created_by, kind, period)
          values (${plan.user_id}, ${`KPI · ${monthName(plan.month)}: ${SCENARIO_LABEL[v.grade as Scenario]} (${percent > 0 ? '+' : ''}${percent}%)`},
                  ${amount}, ${v.note || null}, ${reviewerId}, 'adjustment', ${plan.month})
          returning id`;
        entryId = e.id;
      }
      await tx`
        update kpi_plans set grade = ${v.grade}, grade_pct = ${percent}, grade_amount = ${amount}, grade_note = ${v.note || null},
          graded_by = ${reviewerId}, graded_at = now(), finance_entry_id = ${entryId}, updated_at = now()
        where id = ${plan.id}`;
      return { amount, userId: plan.user_id, month: plan.month, percent };
    });
    if (!out) return { error: 'notFound' };
    if (out === 'future') return { error: 'notYet' };
    logSystemAction('kpi.grade', `KPI graded ${out.month}: ${v.grade}`);
    const fmt = (n: number) => Math.abs(n).toLocaleString('ru-RU').replace(/,/g, ' ');
    await notify(
      out.userId,
      `📊 ${monthName(out.month)} KPI natijangiz: <b>${SCENARIO_LABEL[v.grade as Scenario]}</b> (${out.percent > 0 ? '+' : ''}${out.percent}%)\n` +
        (out.amount > 0 ? `Bonus: +${fmt(out.amount)} so‘m` : out.amount < 0 ? `Ushlab qolinadi: −${fmt(out.amount)} so‘m` : 'Oylik o‘zgarmaydi') +
        (v.note ? `\nIzoh: ${escapeTelegramText(v.note)}` : ''),
    );
    revalidatePath('/[locale]/finance', 'layout');
    done();
    return { amount: out.amount };
  } catch {
    return { error: 'updateFailed' };
  }
}
