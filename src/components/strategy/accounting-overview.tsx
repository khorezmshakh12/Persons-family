'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Books } from '@/lib/accounting-data';
import { addMonths, cashWeeks, fmtMln, fmtNum, ledger, monthEnd, monthlySeries, monthStart, statements } from '@/lib/accounting';
import { cashForecast } from '@/lib/accounting-ma';
import { CASH_ACC, templateDoc } from '@/lib/accounting-cash';
import { getClosePeriodAction } from '@/lib/actions/accounting';
import type { ClosePeriod } from '@/lib/acct-close';
import { Chart } from './charts';

/** Hisob-kitob › Umumiy (v8-B, 2026-10-10): the month at a glance — result
 * against last month, cash now and 13 weeks ahead, the close status, and
 * the few things that need a hand today, each one click from its tab. */

type Go = (tab: string) => void;
type Item = { tone: 'bad' | 'warn' | 'info'; text: string; tab: string; cta: string };

const P_AND_L_CODES = ['9130', '9410', '9420', '9430'];
const CODE_NAME: Record<string, string> = { '9130': 'Tannarx', '9410': 'Marketing', '9420': 'Ma’muriy', '9430': 'Boshqa xarajatlar' };

function delta(cur: number, prev: number, goodUp = true) {
  if (!prev) return null;
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  const good = goodUp ? d >= 0 : d <= 0;
  return (
    <span className={cn('text-xs font-semibold', good ? 'text-au-ok' : 'text-au-bad')}>
      {d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(0)}% o‘tgan oyga nisbatan
    </span>
  );
}

export function AccountingOverview({ books, ym, today, go }: { books: Books; ym: string; today: string; go: Go }) {
  const prevYm = addMonths(ym, -1);
  const st = statements(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const pst = statements(books.accounts, books.opening, books.entries, monthStart(prevYm), monthEnd(prevYm));
  const expense = (s: typeof st) => s.cogs + s.selling + s.admin + s.other + s.tax;
  const W = cashWeeks(books.accounts, books.opening, books.entries, today, 13);
  const cashNow = W.at(-1)?.closing ?? 0;
  const min = books.tax.minCash;
  const fc = cashForecast(books.accounts, books.opening, books.entries, today, 13, 13);
  const lowWeek = fc.weeks.find((w) => w.closing < min);
  const series = monthlySeries(books.accounts, books.opening, books.entries, ym, 6);

  // Close status of last month (the one that should be closed by now).
  const [close, setClose] = useState<ClosePeriod | null>(null);
  useEffect(() => {
    let live = true;
    getClosePeriodAction(prevYm).then((r) => live && setClose(r.period ?? null)).catch(() => {});
    return () => {
      live = false;
    };
  }, [prevYm]);

  const isCash = (c: string) => (CASH_ACC as readonly string[]).includes(c);
  const inMonth = (d: string) => d >= monthStart(ym) && d <= monthEnd(ym);
  const noReceipt = books.entries.filter((e) => inMonth(e.entry_date) && !e.source && isCash(e.credit) && !isCash(e.debit) && !e.receipt_path);
  const L = ledger(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const over = P_AND_L_CODES.map((code) => {
    const plan = books.budget.find((b) => b.period === ym && b.code === code)?.amount ?? 0;
    const fact = L[code] ? L[code].debit - L[code].credit : 0;
    return { code, plan, fact };
  }).filter((r) => r.plan > 0 && r.fact > r.plan * 1.05);
  const missingTpl = books.templates.filter(
    (t) => t.active && !books.entries.some((e) => e.doc === templateDoc(t.id) && inMonth(e.entry_date)),
  );
  const payrollPosted = books.entries.some((e) => e.source?.startsWith(`payroll:${prevYm}:`));

  const items: Item[] = [];
  if (lowWeek) items.push({ tone: 'bad', text: `Pul ${lowWeek.from.slice(8, 10)}.${lowWeek.from.slice(5, 7)} haftasida minimal zaxiradan (${fmtMln(min)}) pastga tushishi kutilmoqda`, tab: 'ma_cash', cta: 'Pul oqimi' });
  if (close && !close.closed) items.push({ tone: 'warn', text: `${prevYm} oyi hali yopilmagan — ${close.checks.filter((c) => !c.ok).length} ta tekshiruv qolgan`, tab: 'fa_close', cta: 'Oy yopish' });
  if (!payrollPosted) items.push({ tone: 'warn', text: `${prevYm} ish haqi hali jurnalga o‘tkazilmagan`, tab: 'fa_tax', cta: 'Ish haqi' });
  if (missingTpl.length) items.push({ tone: 'info', text: `${missingTpl.length} ta har oylik to‘lov (ijara, internet…) bu oy hali yozilmagan`, tab: 'ma_cash', cta: 'Yozish' });
  if (noReceipt.length)
    items.push({ tone: 'info', text: `${noReceipt.length} ta chiqimda chek yo‘q (${fmtNum(noReceipt.reduce((a, e) => a + e.amount, 0))} so‘m)`, tab: 'ma_cash', cta: 'Chek biriktirish' });
  for (const r of over) items.push({ tone: 'warn', text: `${CODE_NAME[r.code]}: rejadan ${fmtNum(r.fact - r.plan)} so‘m oshdi (${Math.round((r.fact / r.plan) * 100)}%)`, tab: 'ma_bud', cta: 'Reja vs fakt' });

  const lbl = (m: string) => `${m.slice(5, 7)}.${m.slice(2, 4)}`;
  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat dark s3">
        <div className="l">Tushum · {ym}</div>
        <div className="v">{fmtMln(st.revenue)}</div>
        <div className="d">{delta(st.revenue, pst.revenue) ?? 'o‘tgan oy ma’lumoti yo‘q'}</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Xarajat</div>
        <div className="v">{fmtMln(expense(st))}</div>
        <div className="d">{delta(expense(st), expense(pst), false) ?? '—'}</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Sof foyda</div>
        <div className="v" style={{ color: st.net < 0 ? 'var(--au-bad)' : 'var(--au-ok)' }}>{fmtMln(st.net)}</div>
        <div className="d">{st.revenue ? `marja ${((st.net / st.revenue) * 100).toFixed(1)}%` : '—'}</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Pul hozir (kassa + bank)</div>
        <div className="v" style={{ color: cashNow < min ? 'var(--au-bad)' : undefined }}>{fmtMln(cashNow)}</div>
        <div className="d">13 haftadan keyin ≈ {fmtMln(fc.weeks.at(-1)?.closing ?? cashNow)}</div>
      </div>

      <div className="sx-card s7">
        <div className="sx-h">
          <h3>So‘nggi 6 oy</h3>
          <small>tushum, xarajat va sof foyda</small>
        </div>
        <Chart
          labels={series.map((m) => lbl(m.ym))}
          fmt={fmtMln}
          series={[
            { n: 'Tushum', c: '#139a52', v: series.map((m) => m.revenue) },
            { n: 'Xarajat', c: '#e8567a', v: series.map((m) => -(m.cogs + m.selling + m.admin + m.other + m.tax)) },
            { n: 'Sof foyda', c: '#17161a', v: series.map((m) => m.net), kind: 'line' },
          ]}
        />
      </div>

      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Bugun e’tibor kerak</h3>
          <small>{items.length ? `${items.length} ta` : 'hammasi joyida'}</small>
        </div>
        {items.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-au-ok">
            <CheckCircle2 className="size-5" /> Kassa, oy yopish, ish haqi va cheklar — hammasi tartibda.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((it, k) => (
              <li key={k} className="flex items-start gap-2.5 rounded-xl border border-au-line bg-au-card-2 px-3 py-2.5">
                <AlertTriangle className={cn('mt-0.5 size-4 shrink-0', it.tone === 'bad' ? 'text-au-bad' : it.tone === 'warn' ? 'text-au-accent-text' : 'text-au-info')} />
                <span className="min-w-0 flex-1 text-sm">{it.text}</span>
                <button className="sx-btn sm shrink-0" onClick={() => go(it.tab)}>
                  {it.cta} <ArrowRight className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-au-muted">
          Har kuni: pul kelganda yoki ketganda «Kirim-chiqim»ga yozing. Oy oxirida: ish haqini o‘tkazing va «Oy yopish»ni bajaring.
        </p>
      </div>
    </div>
  );
}
