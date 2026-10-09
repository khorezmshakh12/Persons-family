import 'server-only';
import { sql } from '@/lib/db/client';
import { tashkentMidnight } from '@/lib/time';
import {
  computeLine,
  shiftMonth,
  type PayComponent,
  type PayInput,
  type PayLine,
  type PayRunStatus,
  type Payment,
  type SnapshotLine,
} from '@/lib/pay-run';

export type PayRun = {
  period: string;
  status: PayRunStatus;
  snapshot: SnapshotLine[] | null;
  note: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
  paid_at: string | null;
};

export type PayRunLogEntry = { id: string; action: string; detail: Record<string, unknown>; at: string; actor: string | null };

export type AdvanceRequest = {
  id: string;
  staff_id: string;
  staff_name: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  period: string;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
};

export type MonthPoint = { period: string; planned: number; paid: number };

const name = (f: string | null, l: string | null) => `${f ?? ''} ${l ?? ''}`.trim() || 'Xodim';

/** Every input of one month's pay, for everyone (or one person). */
async function loadInputs(period: string, staffId?: string): Promise<Omit<PayInput, 'prevPayable'>[]> {
  const from = tashkentMidnight(period).toISOString();
  const to = tashkentMidnight(shiftMonth(period, 1)).toISOString();
  const only = staffId ? sql`and p.id = ${staffId}` : sql``;
  const onlyCol = (col: string) => (staffId ? sql`and ${sql(col)} = ${staffId}` : sql``);

  const [people, salaries, entries, selfDev, perf, missions, kpi, advances] = await Promise.all([
    sql<{ id: string; first_name: string | null; last_name: string | null; role: string }[]>`
      select p.id, p.first_name, p.last_name, p.role from profiles p
      where (p.is_active
        or exists (select 1 from salary_months s where s.staff_id = p.id and s.period = ${period})
        or exists (select 1 from finance_entries f where f.staff_id = p.id and f.period = ${period}))
        ${only}
      order by p.first_name, p.last_name`,
    sql<{ staff_id: string; gross: number }[]>`
      select staff_id, gross_amount as gross from salary_months where period = ${period} ${onlyCol('staff_id')}`,
    sql<{ id: string; staff_id: string; title: string; amount: number; kind: string; source: string; created_at: string | null }[]>`
      select id, staff_id, title, amount, kind, source, created_at from finance_entries
      where period = ${period} ${onlyCol('staff_id')} order by created_at`,
    sql<{ user_id: string; bonus_amount: number | null; ceo_score: number | null; id: string }[]>`
      select id, user_id, bonus_amount, ceo_score from self_development where month = ${period} ${onlyCol('user_id')}`,
    sql<{ staff_id: string; entry_type: string; amount: number; reason: string | null; created_at: string }[]>`
      select staff_id, entry_type, amount, reason, created_at from performance_entries
      where created_at >= ${from} and created_at < ${to} ${onlyCol('staff_id')}`,
    sql<{ staff_id: string; bonus_amount: number; at: string | null }[]>`
      select staff_id, bonus_amount, coalesce(approved_at, created_at) as at from missions
      where status = 'approved' and bonus_amount is not null
        and coalesce(approved_at, created_at) >= ${from} and coalesce(approved_at, created_at) < ${to} ${onlyCol('staff_id')}`,
    sql<{ user_id: string }[]>`
      select user_id from kpi_plans where month = ${period} and status = 'approved' and grade is null ${onlyCol('user_id')}`,
    sql<{ staff_id: string }[]>`
      select distinct staff_id from advance_requests where status = 'pending' ${onlyCol('staff_id')}`,
  ]);

  const gross = new Map(salaries.map((s) => [s.staff_id, s.gross]));
  const kpiPending = new Set(kpi.map((k) => k.user_id));
  const advPending = new Set(advances.map((a) => a.staff_id));

  return people.map((p) => {
    const components: PayComponent[] = [];
    const payments: Payment[] = [];
    const g = gross.get(p.id) ?? 0;
    if (g) components.push({ kind: 'base', title: 'Asosiy maosh', amount: g });
    for (const e of entries) {
      if (e.staff_id !== p.id) continue;
      if (e.kind === 'salary' || e.kind === 'advance') {
        payments.push({ id: e.id, kind: e.kind, title: e.title, amount: e.amount, at: e.created_at });
        continue;
      }
      const kind =
        e.source === 'correction' ? 'correction'
        : e.source === 'kpi' || e.title.startsWith('KPI ·') ? 'kpi'
        : e.kind === 'penalty' ? 'penalty'
        : 'adjustment';
      components.push({ kind, title: e.title, amount: e.amount, at: e.created_at, entryId: e.id });
    }
    let selfDevPending = false;
    for (const s of selfDev) {
      if (s.user_id !== p.id) continue;
      if (s.ceo_score === null) selfDevPending = true;
      if (s.bonus_amount) components.push({ kind: 'selfdev', title: 'O‘zini rivojlantirish bonusi', amount: s.bonus_amount });
    }
    for (const r of perf) {
      if (r.staff_id !== p.id) continue;
      const sign = r.entry_type === 'bonus' ? 1 : -1;
      components.push({ kind: 'perf', title: r.reason || (sign > 0 ? 'Rag‘bat' : 'Jarima'), amount: sign * r.amount, at: r.created_at });
    }
    for (const m of missions) {
      if (m.staff_id !== p.id) continue;
      components.push({ kind: 'mission', title: 'Missiya bonusi', amount: m.bonus_amount, at: m.at });
    }
    return {
      staffId: p.id,
      name: name(p.first_name, p.last_name),
      role: p.role,
      components,
      payments,
      kpiPending: kpiPending.has(p.id),
      selfDevPending,
      advancePending: advPending.has(p.id),
    };
  });
}

/** The month's lines, each compared against the month before. */
export async function loadPayLines(period: string, staffId?: string): Promise<PayLine[]> {
  const [now, prev] = await Promise.all([loadInputs(period, staffId), loadInputs(shiftMonth(period, -1), staffId)]);
  const prevPay = new Map(prev.map((i) => [i.staffId, computeLine({ ...i, prevPayable: null }).payable]));
  return now.map((i) => computeLine({ ...i, prevPayable: prevPay.get(i.staffId) ?? null }));
}

export async function loadPayRun(period: string): Promise<PayRun> {
  const [row] = await sql<
    { status: PayRunStatus; snapshot: SnapshotLine[] | null; note: string | null; approved_at: string | null; paid_at: string | null; first_name: string | null; last_name: string | null }[]
  >`
    select r.status, r.snapshot, r.note, r.approved_at, r.paid_at, p.first_name, p.last_name
    from pay_runs r left join profiles p on p.id = r.approved_by
    where r.period = ${period}`;
  return {
    period,
    status: row?.status ?? 'draft',
    snapshot: row?.snapshot ?? null,
    note: row?.note ?? null,
    approved_at: row?.approved_at ?? null,
    approved_by_name: row?.approved_at ? name(row.first_name, row.last_name) : null,
    paid_at: row?.paid_at ?? null,
  };
}

export async function loadPayRunLog(period: string): Promise<PayRunLogEntry[]> {
  const rows = await sql<{ id: string; action: string; detail: Record<string, unknown>; created_at: string; first_name: string | null; last_name: string | null }[]>`
    select l.id, l.action, l.detail, l.created_at, p.first_name, p.last_name
    from pay_run_log l left join profiles p on p.id = l.actor
    where l.period = ${period} order by l.created_at desc limit 50`;
  return rows.map((r) => ({ id: r.id, action: r.action, detail: r.detail, at: r.created_at, actor: r.first_name ? name(r.first_name, r.last_name) : null }));
}

export async function loadAdvances(staffId?: string): Promise<AdvanceRequest[]> {
  const rows = await sql<(Omit<AdvanceRequest, 'staff_name'> & { first_name: string | null; last_name: string | null })[]>`
    select a.id, a.staff_id, a.amount, a.reason, a.status, a.period::text as period, a.decision_note, a.decided_at, a.created_at,
      p.first_name, p.last_name
    from advance_requests a join profiles p on p.id = a.staff_id
    where ${staffId ? sql`a.staff_id = ${staffId}` : sql`(a.status = 'pending' or a.created_at > now() - interval '60 days')`}
    order by (a.status = 'pending') desc, a.created_at desc
    limit 100`;
  return rows.map(({ first_name, last_name, ...r }) => ({ ...r, staff_name: name(first_name, last_name) }));
}

/** Last 12 months: planned salary fund vs paid out (team, or one person). */
export async function loadPayHistory(period: string, staffId?: string): Promise<MonthPoint[]> {
  const first = shiftMonth(period, -11);
  const [planned, paid] = await Promise.all([
    sql<{ period: string; v: number }[]>`
      select period::text as period, sum(gross_amount) as v from salary_months
      where period >= ${first} and period <= ${period} ${staffId ? sql`and staff_id = ${staffId}` : sql``}
      group by period`,
    sql<{ period: string; v: number }[]>`
      select period::text as period, sum(amount) as v from finance_entries
      where kind in ('salary', 'advance') and period >= ${first} and period <= ${period}
        ${staffId ? sql`and staff_id = ${staffId}` : sql``}
      group by period`,
  ]);
  const pl = new Map(planned.map((r) => [r.period.slice(0, 10), Number(r.v)]));
  const pd = new Map(paid.map((r) => [r.period.slice(0, 10), Number(r.v)]));
  return Array.from({ length: 12 }, (_, i) => {
    const p = shiftMonth(first, i);
    return { period: p, planned: Math.round(pl.get(p) ?? 0), paid: Math.round(pd.get(p) ?? 0) };
  });
}
