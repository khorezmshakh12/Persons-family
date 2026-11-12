import 'server-only';
import { sql } from '@/lib/db/client';
import { loadPayLines } from '@/lib/pay-run-data';
import { EDITABLE_SOURCES, type PayLine } from '@/lib/pay-run';
import { tashkentDayKey } from '@/lib/time';
import { getPreviousMonth, periodToYm, ymToPeriod, type MonEmp, type MonOp, type MonTx } from '@/lib/monitor';

/**
 * Finance › Moliya (Monitor) ma'lumoti. Hamma narsa mavjud jadvallardan:
 * oylik — salary_months; avans / oylik to'lov / bonus / jarima —
 * finance_entries; KPI, o'zini rivojlantirish, missiya, rag'bat — pay-run
 * dvigateli (loadPayLines) orqali, shuning uchun xodim sahifasi, buxgalteriya
 * va bu ekran bir xil summani ko'rsatadi.
 */
export type MonitorData = {
  month: string;
  employees: MonEmp[];
  transactions: MonTx[];
};

const day = (at: string | Date | null | undefined) => (at ? tashkentDayKey(new Date(at)) : '');

function lineTxs(line: PayLine, ym: string): MonTx[] {
  const out: MonTx[] = [];
  for (const c of line.components) {
    if (c.kind === 'base' || !c.amount) continue;
    out.push({
      id: c.ref ?? `${c.kind}:${line.staffId}:${ym}:${out.length}`,
      staffId: line.staffId,
      type: c.amount > 0 ? 'BONUS' : 'PENALTY',
      amount: Math.abs(c.amount),
      month: ym,
      reason: c.title,
      createdAt: day(c.at),
      entryId: c.entryId && c.source && EDITABLE_SOURCES.has(c.source) ? c.entryId : null,
      auto: !c.entryId || c.source !== 'manual',
    });
  }
  for (const p of line.payments) {
    out.push({
      id: `fe:${p.id}`,
      staffId: line.staffId,
      type: p.kind === 'advance' ? 'AVANS' : 'SALARY_PAY',
      amount: Math.abs(p.amount),
      month: ym,
      reason: p.title,
      createdAt: day(p.at),
      entryId: p.source && EDITABLE_SOURCES.has(p.source) ? p.id : null,
      auto: false,
    });
  }
  return out;
}

export async function loadMonitor(month: string): Promise<MonitorData> {
  const prev = getPreviousMonth(month);
  const [curLines, prevLines, salaries, older, requests, flags] = await Promise.all([
    loadPayLines(ymToPeriod(month)),
    loadPayLines(ymToPeriod(prev)),
    sql<{ staff_id: string; period: string; gross: number }[]>`
      select staff_id, period::text as period, gross_amount as gross from salary_months where period <= ${ymToPeriod(month)}`,
    // Drawer journal: every other month's ledger rows (curr/prev come from the engine above).
    sql<{ id: string; staff_id: string; title: string; amount: number; kind: string; source: string; period: string; created_at: string }[]>`
      select id, staff_id, title, amount, kind, source, period::text as period, created_at from finance_entries
      where period is not null and period not in (${ymToPeriod(month)}, ${ymToPeriod(prev)})`,
    sql<{ staff_id: string; period: string | null; created_at: string }[]>`
      select staff_id, period::text as period, created_at from advance_requests where status = 'pending'`,
    sql<{ staff_id: string; period: string }[]>`select staff_id, period::text as period from payroll_avans_flags`.catch(() => []),
  ]);

  const people = new Map<string, { first: string; last: string; role: string }>();
  const profiles = await sql<{ id: string; first_name: string | null; last_name: string | null; role: string }[]>`
    select id, first_name, last_name, role::text as role from profiles
    where id = any(${sql.array([...new Set([...curLines, ...prevLines].map((l) => l.staffId))])}::uuid[])`;
  for (const p of profiles) people.set(p.id, { first: p.first_name ?? '', last: p.last_name ?? '', role: p.role });

  const sal = new Map<string, Record<string, number>>();
  for (const s of salaries) {
    if (!sal.has(s.staff_id)) sal.set(s.staff_id, {});
    sal.get(s.staff_id)![periodToYm(s.period)] = s.gross;
  }
  const req = new Map<string, Record<string, boolean>>();
  const mark = (id: string, ym: string) => {
    if (!req.has(id)) req.set(id, {});
    req.get(id)![ym] = true;
  };
  // A staff member's own pending request counts for the month it names
  // (or the month it was sent, when it names none).
  for (const r of requests) mark(r.staff_id, r.period ? periodToYm(r.period) : periodToYm(tashkentDayKey(new Date(r.created_at))));
  for (const f of flags) mark(f.staff_id, periodToYm(f.period));

  const ids = curLines.map((l) => l.staffId);
  const employees: MonEmp[] = ids.map((id) => {
    const p = people.get(id) ?? { first: 'Xodim', last: '', role: '' };
    return { id, firstName: p.first, lastName: p.last, role: p.role, salaries: sal.get(id) ?? {}, requested: req.get(id) ?? {} };
  });

  const typeOf = (kind: string, amount: number): MonOp =>
    kind === 'advance' ? 'AVANS' : kind === 'salary' ? 'SALARY_PAY' : amount > 0 ? 'BONUS' : 'PENALTY';
  const transactions: MonTx[] = [
    ...curLines.flatMap((l) => lineTxs(l, month)),
    ...prevLines.filter((l) => ids.includes(l.staffId)).flatMap((l) => lineTxs(l, prev)),
    ...older
      .filter((e) => ids.includes(e.staff_id))
      .map((e) => ({
        id: `fe:${e.id}`,
        staffId: e.staff_id,
        type: typeOf(e.kind, e.amount),
        amount: Math.abs(e.amount),
        month: periodToYm(e.period),
        reason: e.title,
        createdAt: day(e.created_at),
        entryId: EDITABLE_SOURCES.has(e.source) ? e.id : null,
        auto: e.source !== 'manual' && e.kind !== 'salary' && e.kind !== 'advance',
      })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  return { month, employees, transactions };
}
