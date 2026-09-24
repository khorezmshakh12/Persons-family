'use client';

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import {
  addMonths,
  courseEconomics,
  fmtMln,
  monthEnd,
  monthStart,
  monthlySeries,
  statements,
  type Account,
  type Course,
  type Entry,
  type TaxSettings,
} from '@/lib/accounting';
import { MONF } from '@/lib/strategy';
import { Chart, HBars } from './charts';

export type BooksLite = {
  accounts: Account[];
  opening: Record<string, number>;
  entries: Entry[];
  courses: Course[];
  tax: TaxSettings;
};

const monthName = (ym: string) => `${MONF[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const delta = (a: number, b: number) => (b === 0 ? null : (a - b) / Math.abs(b));

function Delta({ now, prev }: { now: number; prev: number }) {
  const d = delta(now, prev);
  if (d === null) return <span className="text-au-faint">o‘tgan oy: —</span>;
  return (
    <span style={{ color: d >= 0 ? 'var(--au-ok)' : 'var(--au-bad)' }}>
      {d >= 0 ? '▲' : '▼'} {Math.abs(d * 100).toFixed(1)}% o‘tgan oyga nisbatan
    </span>
  );
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button className="sx-chipb" onClick={() => onChange(addMonths(value, -1))} aria-label="Oldingi oy">
        ‹
      </button>
      <input type="month" className="sx-inp !h-[30px] !w-[150px]" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <button className="sx-chipb" onClick={() => onChange(addMonths(value, 1))} aria-label="Keyingi oy">
        ›
      </button>
    </div>
  );
}

export function FinanceView({ books, today }: { books: BooksLite; today: string }) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const { accounts, opening, entries, courses } = books;
  const s = useMemo(() => statements(accounts, opening, entries, monthStart(ym), monthEnd(ym)), [accounts, opening, entries, ym]);
  const p = useMemo(
    () => statements(accounts, opening, entries, monthStart(addMonths(ym, -1)), monthEnd(addMonths(ym, -1))),
    [accounts, opening, entries, ym],
  );
  const students = courses.reduce((a, c) => a + c.students, 0);
  const eco = courses.map((c) => ({ c, e: courseEconomics(c) }));
  const expenses = s.cogs + s.selling + s.admin + s.other + s.tax;
  const fixed = s.selling + s.admin + s.other;
  const avgUnit = students ? eco.reduce((a, x) => a + (x.c.fee - x.c.book_cost) * x.c.students, 0) / students : 0;
  const teach = courses.reduce((a, c) => a + c.teacher_cost, 0);
  const beStudents = avgUnit > 0 ? Math.ceil((teach + fixed) / avgUnit) : null;
  const runway = expenses > 0 ? s.cash / expenses : null;
  const empty = entries.length === 0 && courses.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 pt-4">
        <MonthPicker value={ym} onChange={setYm} />
        <span className="text-sm text-au-muted">{monthName(ym)} · jurnal va kurslar ma’lumotidan hisoblangan</span>
        <span className="flex-1" />
        <Link href="/strategy/accounting" className="sx-btn sm">
          Hisob-kitobga o‘tish →
        </Link>
      </div>
      {empty && (
        <div className="sx-card mt-4 p-5 text-sm text-au-muted">
          Hali ma’lumot yo‘q. <b>Hisob-kitob → Jurnal</b> bo‘limida tushum va xarajatlarni kiriting, <b>Xarajat & marja</b> bo‘limida
          kurslarni (narx, o‘quvchilar soni) qo‘shing — bu yerdagi barcha ko‘rsatkichlar avtomatik hisoblanadi.
        </div>
      )}
      <div className="sx-grid">
        <div className="sx-card sx-stat dark s4">
          <div className="l">1 · Tushum (9030)</div>
          <div className="v">{fmtMln(s.revenue)}</div>
          <div className="d">
            <Delta now={s.revenue} prev={p.revenue} />
          </div>
        </div>
        <div className="sx-card sx-stat s4">
          <div className="l">2 · Sof foyda</div>
          <div className="v" style={{ color: s.net < 0 ? 'var(--au-bad)' : 'var(--au-ok)' }}>
            {fmtMln(s.net)}
          </div>
          <div className="d">Rentabellik: {s.revenue ? pct(s.net / s.revenue) : '—'}</div>
        </div>
        <div className="sx-card sx-stat s4">
          <div className="l">3 · Yalpi marja</div>
          <div className="v">{s.revenue ? pct(s.gross / s.revenue) : '—'}</div>
          <div className="d">Tannarx (9130): {fmtMln(s.cogs)}</div>
        </div>
        <div className="sx-card sx-stat s4">
          <div className="l">4 · O‘quvchilar · o‘rtacha to‘lov</div>
          <div className="v">{students}</div>
          <div className="d">
            {students ? `${fmtMln(courses.reduce((a, c) => a + c.fee * c.students, 0) / students)} so‘m / oy` : 'Kurslar kiritilmagan'}
            {beStudents !== null && ` · zararsizlik: ${beStudents} o‘quvchi`}
          </div>
        </div>
        <div className="sx-card sx-stat s4">
          <div className="l">5 · Debitorlik (4010)</div>
          <div className="v" style={{ color: s.receivables > 0 ? 'var(--au-accent-text)' : undefined }}>
            {fmtMln(s.receivables)}
          </div>
          <div className="d">O‘quvchilarning to‘lanmagan qarzi (oy oxiriga)</div>
        </div>
        <div className="sx-card sx-stat s4">
          <div className="l">6 · Pul qoldig‘i</div>
          <div className="v" style={{ color: s.cash < books.tax.minCash ? 'var(--au-bad)' : undefined }}>
            {fmtMln(s.cash)}
          </div>
          <div className="d">{runway !== null ? `≈ ${runway.toFixed(1)} oylik xarajatga yetadi` : 'Kassa + bank (5010 + 5110)'}</div>
        </div>

        <div className="sx-card s7">
          <div className="sx-h">
            <h3>Xarajatlar tarkibi</h3>
            <small>{monthName(ym)}</small>
          </div>
          {expenses === 0 ? (
            <div className="sx-empty">Bu oy xarajat yozilmagan</div>
          ) : (
            <HBars
              fmt={fmtMln}
              rows={[
                { n: "Tannarx (o'qituvchi, darslik)", v: s.cogs, c: '#2477c9' },
                { n: 'Marketing', v: s.selling, c: '#e8567a' },
                { n: "Ma'muriy", v: s.admin, c: '#7a5af8' },
                { n: 'Boshqa operatsion', v: s.other, c: '#0ea5a4' },
                { n: 'Soliq', v: s.tax, c: '#c7322b' },
              ].map((r) => ({ ...r, sub: s.revenue ? pct(r.v / s.revenue) + ' tushumdan' : undefined }))}
            />
          )}
        </div>
        <div className="sx-card s5">
          <div className="sx-h">
            <h3>Kurslar bo‘yicha marja</h3>
            <small>oylik</small>
          </div>
          {eco.length === 0 ? (
            <div className="sx-empty">Kurslar yo‘q — Hisob-kitob → Xarajat & marja</div>
          ) : (
            <HBars
              fmt={fmtMln}
              rows={eco.map((x, i) => ({
                n: x.c.name,
                v: x.e.contribution,
                c: ['#ff9f1c', '#2477c9', '#e8567a', '#7a5af8', '#139a52', '#0ea5a4'][i % 6],
                sub: pct(x.e.margin),
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsView({ books, today }: { books: BooksLite; today: string }) {
  const ym = today.slice(0, 7);
  const S = useMemo(() => monthlySeries(books.accounts, books.opening, books.entries, ym, 12), [books, ym]);
  const labels = S.map((m) => `${MONF[+m.ym.slice(5, 7) - 1].slice(0, 3)} ${m.ym.slice(2, 4)}`);
  const exp = S.map((m) => m.cogs + m.selling + m.admin + m.other + m.tax);
  const last = S[S.length - 1];
  const ytdRev = S.reduce((a, m) => a + m.revenue, 0);
  const ytdNet = S.reduce((a, m) => a + m.net, 0);
  const best = [...S].sort((a, b) => b.net - a.net)[0];
  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat dark s4">
        <div className="l">12 oylik tushum</div>
        <div className="v">{fmtMln(ytdRev)}</div>
        <div className="d">Oxirgi oy: {fmtMln(last.revenue)}</div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">12 oylik sof foyda</div>
        <div className="v" style={{ color: ytdNet < 0 ? 'var(--au-bad)' : 'var(--au-ok)' }}>
          {fmtMln(ytdNet)}
        </div>
        <div className="d">Rentabellik: {ytdRev ? pct(ytdNet / ytdRev) : '—'}</div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">Eng yaxshi oy</div>
        <div className="v">{best && best.net !== 0 ? monthName(best.ym) : '—'}</div>
        <div className="d">{best && best.net !== 0 ? `Sof foyda ${fmtMln(best.net)}` : 'Hali ma’lumot yo‘q'}</div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Tushum, xarajat va sof foyda</h3>
          <small>12 oy · jurnaldan</small>
        </div>
        <Chart
          labels={labels}
          fmt={fmtMln}
          series={[
            { n: 'Tushum', c: '#ff9f1c', v: S.map((m) => m.revenue) },
            { n: 'Xarajat', c: '#c9c3b8', v: exp },
            { n: 'Sof foyda', c: '#139a52', v: S.map((m) => m.net), kind: 'line' },
          ]}
        />
      </div>
      <div className="sx-card s6">
        <div className="sx-h">
          <h3>Yalpi va sof marja</h3>
          <small>% tushumdan</small>
        </div>
        <Chart
          labels={labels}
          height={200}
          fmt={(v) => `${Math.round(v)}%`}
          series={[
            { n: 'Yalpi marja', c: '#2477c9', v: S.map((m) => (m.revenue ? (m.gross / m.revenue) * 100 : 0)), kind: 'line' },
            { n: 'Sof marja', c: '#139a52', v: S.map((m) => (m.revenue ? (m.net / m.revenue) * 100 : 0)), kind: 'line' },
          ]}
        />
      </div>
      <div className="sx-card s6">
        <div className="sx-h">
          <h3>Pul qoldig‘i va debitorlik</h3>
          <small>oy oxiriga</small>
        </div>
        <Chart
          labels={labels}
          height={200}
          fmt={fmtMln}
          series={[
            { n: 'Pul (kassa + bank)', c: '#0ea5a4', v: S.map((m) => m.cash), kind: 'line' },
            { n: 'Debitorlik', c: '#e8567a', v: S.map((m) => m.receivables), kind: 'line' },
          ]}
        />
      </div>
    </div>
  );
}
