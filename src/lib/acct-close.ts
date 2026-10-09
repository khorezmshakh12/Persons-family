import 'server-only';
import { sql } from '@/lib/db/client';
import { loadPayLines } from '@/lib/pay-run-data';
import { isRelevant } from '@/lib/pay-run';

export type CloseCheck = { key: string; n: string; ok: boolean; detail: string; blocking: boolean; href?: string };
export type ClosePeriod = {
  ym: string;
  closed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  budgetReview: boolean;
  checks: CloseCheck[];
  log: { action: string; reason: string | null; at: string; actor: string | null }[];
};

const som = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');

/** Everything that should be true before a month's books are closed. */
export async function loadClosePeriod(ym: string): Promise<ClosePeriod> {
  const month = `${ym}-01`;
  const [y, m] = ym.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const [[period], [run], posted, [depr], [tax], cash, [entries], log] = await Promise.all([
    sql<{ closed_at: string | null; budget_review: boolean; first_name: string | null; last_name: string | null }[]>`
      select a.closed_at, a.budget_review, p.first_name, p.last_name
      from acct_periods a left join profiles p on p.id = a.closed_by where a.month = ${month}`,
    sql<{ status: string }[]>`select status from pay_runs where period = ${month}`,
    sql<{ code: string; amount: number }[]>`
      select source as code, sum(amount) as amount from acct_entries where source like ${`payroll:${ym}:%`} group by source`,
    sql<{ n: number }[]>`select count(*)::int as n from acct_entries where source = ${`depr:${ym}`}`,
    sql<{ n: number }[]>`select count(*)::int as n from acct_entries where source = ${`tax:${ym}`}`,
    sql<{ code: string; bal: number }[]>`
      select a.code,
        coalesce((select amount from acct_opening o where o.code = a.code), 0)
        + coalesce((select sum(amount) from acct_entries e where e.debit = a.code and e.entry_date < ${next}), 0)
        - coalesce((select sum(amount) from acct_entries e where e.credit = a.code and e.entry_date < ${next}), 0) as bal
      from acct_accounts a where a.code in ('5010', '5110')`,
    sql<{ n: number }[]>`select count(*)::int as n from acct_entries where entry_date >= ${month} and entry_date < ${next}`,
    sql<{ action: string; reason: string | null; created_at: string; first_name: string | null; last_name: string | null }[]>`
      select l.action, l.reason, l.created_at, p.first_name, p.last_name
      from acct_period_log l left join profiles p on p.id = l.actor where l.month = ${month} order by l.created_at desc limit 20`,
  ]);

  // Payroll: the accrual posted to the books vs the approved pay run.
  const lines = (await loadPayLines(month)).filter(isRelevant);
  const payable = lines.reduce((a, l) => a + Math.max(0, l.payable), 0);
  // Only the gross accrual (payroll:YM:accr-*) — social tax is an expense
  // on top of pay and must not count against the pay run.
  const accrued = posted.filter((r) => /:accr-/.test(r.code)).reduce((a, r) => a + Number(r.amount), 0);
  const runOk = run?.status === 'approved' || run?.status === 'paid';
  const diff = Math.abs(accrued - payable);

  const checks: CloseCheck[] = [
    { key: 'payrun', n: 'Oylik jarayoni tasdiqlangan', ok: runOk, detail: run ? `holat: ${run.status}` : 'oylik jarayoni boshlanmagan', blocking: true, href: `/finance?period=${month}` },
    {
      key: 'payroll',
      n: 'Ish haqi jurnalga o‘tkazilgan va Moliya bilan mos',
      ok: posted.length > 0 && diff < 1000,
      detail: posted.length
        ? `jurnalda ${som(accrued)} · oylik jarayonida ${som(payable)}${diff >= 1000 ? ` · farq ${som(diff)}` : ''}`
        : 'hali o‘tkazilmagan (Moliya › Buxgalteriyaga o‘tkazish)',
      blocking: true,
      href: `/finance?period=${month}`,
    },
    { key: 'depr', n: 'Amortizatsiya hisoblangan', ok: depr.n > 0, detail: depr.n ? 'yozilgan' : '“Asosiy vositalar” bo‘limida hisoblang', blocking: false },
    { key: 'tax', n: 'Aylanma soliq hisoblangan', ok: tax.n > 0, detail: tax.n ? 'yozilgan' : '“Soliq” bo‘limida hisoblang', blocking: false },
    ...cash.map((c) => ({
      key: `cash-${c.code}`,
      n: c.code === '5010' ? 'Kassa qoldig‘i manfiy emas' : 'Bank qoldig‘i manfiy emas',
      ok: Number(c.bal) >= 0,
      detail: `oy oxiri: ${som(Number(c.bal))} so‘m`,
      blocking: true,
    })),
    { key: 'entries', n: 'Oyda yozuvlar bor', ok: entries.n > 0, detail: `${entries.n} ta yozuv`, blocking: false },
    { key: 'budget', n: 'Budjet farqi ko‘rib chiqildi', ok: !!period?.budget_review, detail: period?.budget_review ? 'belgilangan' : 'Budjet bo‘limini ko‘rib, belgilang', blocking: false },
  ];
  return {
    ym,
    closed: !!period?.closed_at,
    closedAt: period?.closed_at ?? null,
    closedBy: period?.first_name ? `${period.first_name} ${period.last_name ?? ''}`.trim() : null,
    budgetReview: !!period?.budget_review,
    checks,
    log: log.map((l) => ({ action: l.action, reason: l.reason, at: l.created_at, actor: l.first_name ? `${l.first_name} ${l.last_name ?? ''}`.trim() : null })),
  };
}
