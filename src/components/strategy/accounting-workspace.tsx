'use client';

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  BookOpen,
  Building2,
  ChartColumn,
  Coins,
  FileText,
  Percent,
  Rows3,
  SlidersHorizontal,
  Wallet,
  Pencil,
  Trash2,
  Plus,
} from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  JOURNAL_TEMPLATES,
  addMonths,
  cashWeeks,
  courseEconomics,
  debitNormal,
  assetOnBooks,
  depreciation,
  fmtMln,
  fmtNum,
  ledger,
  monthEnd,
  monthStart,
  payrollTaxes,
  statements,
  taxCompare,
  type TaxSettings,
} from '@/lib/accounting';
import type { Books } from '@/lib/accounting-data';
import {
  CASH_BUCKETS,
  cashFlowStatement,
  cashForecast,
  cvp,
  cvpCurve,
  flexBudget,
  nbvByCategory,
  ratios,
  reconcile,
  segmentPL,
  studentsForTarget,
  taxCalendar,
  tornado,
  type BudgetLine,
  type Driver,
} from '@/lib/accounting-ma';
import {
  addAssetAction,
  addJournalEntryAction,
  deleteAssetAction,
  deleteCourseAction,
  deleteJournalEntryAction,
  disposeAssetAction,
  getPayrollForMonthAction,
  postDepreciationAction,
  postPayrollAction,
  postTurnoverTaxAction,
  saveCourseAction,
  saveTaxSettingsAction,
  setBudgetAction,
  setOpeningBalancesAction,
  setPlanStudentsAction,
  type PayrollLine,
} from '@/lib/actions/accounting';
import { SectionHead, SuiteShell, SuiteTabs, playSound, toast, type PaletteItem } from './suite-shell';
import { Chart, HBars } from './charts';
import { MonthPicker } from './view-finance';
import './strategy.css';
import './suite.css';

type Tab = 'ma_cost' | 'ma_bud' | 'ma_sim' | 'ma_cash' | 'fa_jr' | 'fa_gl' | 'fa_rep' | 'fa_tax' | 'fa_fa';
const TABS: ({ v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> } | { g: string })[] = [
  { g: 'Boshqaruv hisobi' },
  { v: 'ma_cost', n: 'Xarajat & marja', Icon: ChartColumn },
  { v: 'ma_bud', n: 'Byudjet vs fakt', Icon: Rows3 },
  { v: 'ma_sim', n: 'Ssenariy', Icon: SlidersHorizontal },
  { v: 'ma_cash', n: 'Pul oqimi', Icon: Coins },
  { g: 'Moliyaviy hisob' },
  { v: 'fa_jr', n: 'Jurnal', Icon: BookOpen },
  { v: 'fa_gl', n: 'Bosh daftar', Icon: Wallet },
  { v: 'fa_rep', n: 'Hisobotlar', Icon: FileText },
  { v: 'fa_tax', n: 'Soliq & ish haqi', Icon: Percent },
  { v: 'fa_fa', n: 'Asosiy vositalar', Icon: Building2 },
];
const FLAT = TABS.filter((t): t is { v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> } => 'v' in t);
const KEY = 'persons-acct-tab';
const err = (c: string) =>
  c === 'forbidden' ? "Ruxsat yo'q" : c === 'invalidInput' ? "Ma'lumot noto'g'ri" : c === 'notFound' ? 'Topilmadi' : 'Saqlab bo‘lmadi';
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Runs a server action, toasts the outcome and refreshes server data. */
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, ok?: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(err(res.error));
      else {
        if (ok) toast.success(ok);
        after?.();
        router.refresh();
      }
    });
  return { run, pending };
}

export function AccountingWorkspace({
  books,
  today,
  courseGroups,
}: {
  books: Books;
  today: string;
  /** Real groups per course_name — suggests the course list. */
  courseGroups: { course: string; groups: number }[];
}) {
  const [tab, setTab] = useState<Tab>('fa_jr');
  const [ym, setYm] = useState(today.slice(0, 7));
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const v = localStorage.getItem(KEY) as Tab | null;
      if (v && FLAT.some((t) => t.v === v)) setTab(v);
    } catch {}
  }, []);
  const go = (v: string) => {
    setTab(v as Tab);
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  };
  const st = useMemo(() => statements(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym)), [books, ym]);
  const items: PaletteItem[] = [
    { g: 'Amallar', t: "Jurnalga yozuv qo'shish", run: () => go('fa_jr') },
    { g: 'Amallar', t: "Ish haqini jurnalga o'tkazish", run: () => go('fa_tax') },
    { g: 'Amallar', t: 'Eskirishni hisoblash', run: () => go('fa_fa') },
    ...books.accounts.map((a) => ({ g: 'Hisoblar', t: `${a.code} ${a.name}`, run: () => go('fa_gl') })),
  ];

  return (
    <SuiteShell section="acct" tabs={FLAT} onTab={go} items={items}>
      <div className="px-4 sm:px-7">
        <SectionHead
          crumb="Hisob-kitob · Moliya markazi"
          title="Hisob-kitob"
          em="MA · FA"
          pill={st.imbalance === 0 ? 'Balans to‘g‘ri' : `Balans farqi: ${fmtNum(st.imbalance)}`}
          pillTone={st.imbalance === 0 ? 'ok' : 'bad'}
          right={<MonthPicker value={ym} onChange={setYm} />}
        />
        <SuiteTabs tabs={TABS} value={tab} onChange={(v) => { playSound('nav'); go(v); }} />
      </div>
      <section className="px-4 pb-10 sm:px-7">
        <div key={tab} className="sx-fade">
          {tab === 'ma_cost' && <MaCost books={books} ym={ym} courseGroups={courseGroups} />}
          {tab === 'ma_bud' && <MaBudget books={books} ym={ym} />}
          {tab === 'ma_sim' && <MaSim books={books} ym={ym} />}
          {tab === 'ma_cash' && <MaCash books={books} today={today} />}
          {tab === 'fa_jr' && <FaJournal books={books} ym={ym} today={today} />}
          {tab === 'fa_gl' && <FaLedger books={books} ym={ym} />}
          {tab === 'fa_rep' && <FaReports books={books} ym={ym} />}
          {tab === 'fa_tax' && <FaTax books={books} ym={ym} />}
          {tab === 'fa_fa' && <FaAssets books={books} ym={ym} today={today} />}
        </div>
      </section>
    </SuiteShell>
  );
}

/* ------------------------------------------------------------------ MA · cost */
function MaCost({ books, ym, courseGroups }: { books: Books; ym: string; courseGroups: { course: string; groups: number }[] }) {
  const { run, pending } = useRun();
  const st = statements(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const fixed = st.selling + st.admin + st.other;
  const rows = books.courses.map((c) => ({ c, e: courseEconomics(c) }));
  const tot = rows.reduce(
    (a, x) => ({ rev: a.rev + x.e.revenue, dir: a.dir + x.e.direct, con: a.con + x.e.contribution, st: a.st + x.c.students }),
    { rev: 0, dir: 0, con: 0, st: 0 },
  );
  const missing = courseGroups.filter((g) => g.course && !books.courses.some((c) => c.name.toLowerCase() === g.course.toLowerCase()));
  const save = (id: string | undefined, v: { name: string; fee: number; students: number; teacherCost: number; bookCost: number }) =>
    run(() => saveCourseAction({ id, ...v }), id ? `«${v.name}» saqlandi` : "Kurs qo'shildi");

  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat dark s3">
        <div className="l">Kurslar tushumi (reja)</div>
        <div className="v">{fmtMln(tot.rev)}</div>
        <div className="d">{tot.st} o‘quvchi · oylik</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Qoplama foyda</div>
        <div className="v" style={{ color: tot.con < 0 ? 'var(--au-bad)' : 'var(--au-ok)' }}>{fmtMln(tot.con)}</div>
        <div className="d">Marja: {tot.rev ? pct(tot.con / tot.rev) : '—'}</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Doimiy xarajatlar (jurnal)</div>
        <div className="v">{fmtMln(fixed)}</div>
        <div className="d">9410 + 9420 + 9430 · shu oy</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Operatsion natija (model)</div>
        <div className="v" style={{ color: tot.con - fixed < 0 ? 'var(--au-bad)' : undefined }}>{fmtMln(tot.con - fixed)}</div>
        <div className="d">Qoplama − doimiy xarajat</div>
      </div>

      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Kurslar iqtisodiyoti</h3>
          <small>narx, o‘quvchi soni va to‘g‘ridan-to‘g‘ri xarajat — o‘zgartirsangiz darhol qayta hisoblanadi</small>
          <span className="sp" />
          <button
            className="sx-btn sm"
            disabled={pending}
            onClick={() => save(undefined, { name: 'Yangi kurs', fee: 0, students: 0, teacherCost: 0, bookCost: 0 })}
          >
            <Plus className="size-3.5" /> Kurs
          </button>
        </div>
        {missing.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-au-muted">
            Saytdagi guruhlarda bor, bu yerda yo‘q:
            {missing.map((m) => (
              <button
                key={m.course}
                className="sx-chipb"
                disabled={pending}
                onClick={() => save(undefined, { name: m.course, fee: 0, students: 0, teacherCost: 0, bookCost: 0 })}
              >
                + {m.course} ({m.groups} guruh)
              </button>
            ))}
          </div>
        )}
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Kurs</th>
                <th>Oylik narx</th>
                <th>O‘quvchi</th>
                <th>O‘qituvchi xarajati</th>
                <th>Darslik / o‘quvchi</th>
                <th>Tushum</th>
                <th>Qoplama</th>
                <th>Marja</th>
                <th>Zararsizlik</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="l">
                    <div className="sx-empty">Kurs qo‘shing — tushum, marja va zararsizlik nuqtasi shu yerda hisoblanadi.</div>
                  </td>
                </tr>
              )}
              {rows.map(({ c, e }, i) => (
                <CourseRow key={c.id + c.fee + c.students + c.teacher_cost + c.book_cost + c.name} c={c} e={e} i={i} onSave={(v) => save(c.id, v)} onDelete={() => window.confirm(`«${c.name}» kursi o'chirilsinmi?`) && run(() => deleteCourseAction(c.id), "Kurs o'chirildi")} />
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td className="l">Jami</td>
                  <td />
                  <td>{tot.st}</td>
                  <td />
                  <td />
                  <td>{fmtNum(tot.rev)}</td>
                  <td>{fmtNum(tot.con)}</td>
                  <td>{tot.rev ? pct(tot.con / tot.rev) : '—'}</td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="sx-card s12">
          <div className="sx-h">
            <h3>Tushum va to‘g‘ridan-to‘g‘ri xarajat</h3>
            <small>kurslar kesimida</small>
          </div>
          <Chart
            labels={rows.map((r) => r.c.name)}
            fmt={fmtMln}
            height={200}
            series={[
              { n: 'Tushum', c: '#ff9f1c', v: rows.map((r) => r.e.revenue) },
              { n: 'To‘g‘ridan-to‘g‘ri xarajat', c: '#c9c3b8', v: rows.map((r) => r.e.direct) },
              { n: 'Qoplama', c: '#139a52', v: rows.map((r) => r.e.contribution), kind: 'line' },
            ]}
          />
        </div>
      )}
      {rows.length > 0 && <CostAnalysis books={books} st={st} />}
    </div>
  );
}

/** Cost structure, CVP, keep/close decision and segment P&L — all from the
 * course model plus the month's journal fixed costs. */
function CostAnalysis({ books, st }: { books: Books; st: ReturnType<typeof statements> }) {
  const [drv, setDrv] = useState<Driver>('students');
  const fixed = st.selling + st.admin + st.other;
  const c = cvp(books.courses, fixed);
  const curve = cvpCurve(c);
  const seg = segmentPL(books.courses, fixed, drv);
  const parts = [
    { n: 'O‘qituvchilar', v: c.teacher, col: '#17161a', vr: true },
    { n: 'Darsliklar', v: c.books, col: '#5c5760', vr: true },
    { n: 'Sotish / marketing (9410)', v: st.selling, col: '#ff9f1c', vr: false },
    { n: "Ma'muriy (9420)", v: st.admin, col: '#ffc46b', vr: false },
    { n: 'Boshqa (9430)', v: st.other, col: '#ffe0ad', vr: false },
  ].filter((p) => p.v > 0);
  const T = parts.reduce((a, p) => a + p.v, 0) || 1;
  const maxCm = Math.max(1, ...seg.map((r) => Math.abs(r.contribution)));
  return (
    <>
      <div className="sx-card sx-stat dark s4">
        <div className="l">Marjinal daromad (CM)</div>
        <div className="v">{c.revenue ? pct(c.contribution / c.revenue) : '—'}</div>
        <div className="d">
          CM: {fmtMln(c.contribution)} · 1 o‘quvchidan {fmtMln(c.cm)}
        </div>
        <div className="d">
          Operatsion leverage: {c.leverage === null ? '—' : `${c.leverage.toFixed(1)}×`} · Xavfsizlik zonasi: {c.safety === null ? '—' : pct(c.safety)}
        </div>
      </div>
      <div className="sx-card s8">
        <div className="sx-h">
          <h3>Xarajatlar tuzilishi</h3>
          <small>Fixed vs variable · o‘zgaruvchan = kurslar modelidagi to‘g‘ridan-to‘g‘ri xarajat, doimiy = jurnal (9410/9420/9430)</small>
        </div>
        <div className="flex h-7 overflow-hidden rounded-lg">
          {parts.map((p) => (
            <div key={p.n} title={`${p.n}: ${fmtNum(p.v)} (${pct(p.v / T)})`} style={{ flex: p.v, background: p.col }} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-au-muted">
          {parts.map((p) => (
            <span key={p.n} className="inline-flex items-center gap-1.5">
              <i className="size-2.5 rounded-sm" style={{ background: p.col }} />
              {p.n} <b className="text-au-ink">{pct(p.v / T)}</b>
            </span>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            O‘zgaruvchan / o‘quvchi <b className="block tabular-nums">{fmtNum(c.vc)}</b>
          </div>
          <div>
            O‘rtacha to‘lov <b className="block tabular-nums">{fmtNum(c.fee)}</b>
          </div>
          <div>
            Zararsizlik <b className="block tabular-nums">{c.breakEven ?? '—'} o‘q.</b>
          </div>
          <div>
            O‘zgaruvchan / doimiy{' '}
            <b className="block tabular-nums">
              {pct(c.direct / T)} / {pct(fixed / T)}
            </b>
          </div>
        </div>
      </div>
      <div className="sx-card s7">
        <div className="sx-h">
          <h3>CVP tahlili</h3>
          <small>Tushum = narx × N · Jami xarajat = doimiy + o‘zgaruvchan × N · hozir {c.N} o‘quvchi</small>
        </div>
        <Chart
          labels={curve.map((p) => `${p.n}`)}
          fmt={fmtMln}
          height={230}
          series={[
            { n: 'Tushum', c: '#17161a', v: curve.map((p) => p.revenue), kind: 'line' },
            { n: 'Jami xarajat', c: '#c7322b', v: curve.map((p) => p.cost), kind: 'line' },
            { n: 'Doimiy xarajat', c: '#a39fa8', v: curve.map((p) => p.fixed), kind: 'line', dash: true },
          ]}
        />
        <p className="sx-note">
          X o‘qi — o‘quvchilar soni. Zararsizlik nuqtasi (BEP): <b>{c.breakEven ?? '—'}</b> o‘quvchi; undan o‘ngda — foyda zonasi.
        </p>
      </div>
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Kursni yopish qarori</h3>
          <small>Relevant costing</small>
        </div>
        <p className="mb-2 text-xs text-au-muted">
          Taqsimlangan doimiy xarajat kurs yopilganda yo‘qolmaydi. Qaror faqat <b>CM</b> ga qarab qabul qilinadi.
        </p>
        <div className="flex flex-col gap-2">
          {seg.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              <span className="w-[110px] truncate">{r.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded bg-au-card-2">
                <i className="block h-full rounded" style={{ width: `${Math.max(2, (Math.abs(r.contribution) / maxCm) * 100)}%`, background: r.keep ? 'var(--au-ink)' : 'var(--au-bad)' }} />
              </div>
              <b className="w-[70px] text-right tabular-nums">{fmtMln(r.contribution)}</b>
              <span className={cn('sx-pl', r.keep ? 'ok' : 'bad')}>{r.keep ? 'Davom ettirish' : 'Qayta ko‘rish'}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Kurslar bo‘yicha segment hisoboti</h3>
          <small>Segment P&amp;L · doimiy xarajatni taqsimlash asosi:</small>
          <span className="sp" />
          {(
            [
              ['students', 'O‘quvchi soni'],
              ['revenue', 'Tushum ulushi'],
              ['equal', 'Teng'],
            ] as const
          ).map(([k, n]) => (
            <button key={k} className={cn('sx-chipb', drv === k && 'on')} onClick={() => setDrv(k)}>
              {n}
            </button>
          ))}
        </div>
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Kurs</th>
                <th>O‘quvchi</th>
                <th>Tushum</th>
                <th>O‘zgaruvchan</th>
                <th>CM</th>
                <th>CM %</th>
                <th>CM / o‘quvchi</th>
                <th>Taqsimlangan doimiy</th>
                <th>Segment foydasi</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {seg.map((r) => (
                <tr key={r.id}>
                  <td className="l">{r.name}</td>
                  <td>{r.students}</td>
                  <td>{fmtNum(r.revenue)}</td>
                  <td>{fmtNum(r.direct)}</td>
                  <td>
                    <b>{fmtNum(r.contribution)}</b>
                  </td>
                  <td>{pct(r.margin)}</td>
                  <td>{fmtNum(r.perStudent)}</td>
                  <td>{fmtNum(r.alloc)}</td>
                  <td style={{ color: r.segment < 0 ? 'var(--au-bad)' : 'var(--au-ok)' }}>
                    <b>{fmtNum(r.segment)}</b>
                  </td>
                  <td>
                    <span className={cn('sx-pl', r.status === 'loss' ? 'bad' : r.status === 'low' ? 'warn' : 'ok')}>
                      {r.status === 'loss' ? 'Zarar' : r.status === 'low' ? 'Past marja' : 'Sog‘lom'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="l">Jami</td>
                <td>{c.N}</td>
                <td>{fmtNum(c.revenue)}</td>
                <td>{fmtNum(c.direct)}</td>
                <td>{fmtNum(c.contribution)}</td>
                <td>{c.revenue ? pct(c.contribution / c.revenue) : '—'}</td>
                <td>{fmtNum(c.cm)}</td>
                <td>{fmtNum(fixed)}</td>
                <td>{fmtNum(c.profit)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

function CourseRow({
  c,
  e,
  i,
  onSave,
  onDelete,
}: {
  c: Books['courses'][number];
  e: ReturnType<typeof courseEconomics>;
  i: number;
  onSave: (v: { name: string; fee: number; students: number; teacherCost: number; bookCost: number }) => void;
  onDelete: () => void;
}) {
  const [v, setV] = useState({ name: c.name, fee: c.fee, students: c.students, teacherCost: c.teacher_cost, bookCost: c.book_cost });
  const commit = (next = v) => {
    if (
      next.name.trim() &&
      (next.name !== c.name || next.fee !== c.fee || next.students !== c.students || next.teacherCost !== c.teacher_cost || next.bookCost !== c.book_cost)
    )
      onSave({ ...next, name: next.name.trim() });
  };
  const num = (k: 'fee' | 'students' | 'teacherCost' | 'bookCost') => (
    <input
      className="sx-plain-inp"
      type="number"
      min={0}
      value={v[k]}
      onChange={(ev) => setV({ ...v, [k]: Math.max(0, Number(ev.target.value) || 0) })}
      onBlur={() => commit()}
      onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
    />
  );
  return (
    <tr style={{ animationDelay: `${i * 30}ms` }}>
      <td className="l">
        <input
          className="sx-plain-inp !w-[160px] !text-left"
          value={v.name}
          maxLength={120}
          onChange={(ev) => setV({ ...v, name: ev.target.value })}
          onBlur={() => commit()}
        />
      </td>
      <td>{num('fee')}</td>
      <td>{num('students')}</td>
      <td>{num('teacherCost')}</td>
      <td>{num('bookCost')}</td>
      <td>{fmtNum(e.revenue)}</td>
      <td style={{ color: e.contribution < 0 ? 'var(--au-bad)' : undefined }}>{fmtNum(e.contribution)}</td>
      <td>{e.revenue ? pct(e.margin) : '—'}</td>
      <td>
        {e.breakEven === null ? '—' : (
          <span className={cn('sx-pl', c.students >= e.breakEven ? 'ok' : 'bad')}>{e.breakEven} o‘quvchi</span>
        )}
      </td>
      <td>
        <button className="sx-btn sm text-au-bad" onClick={onDelete} aria-label="O'chirish">
          <Trash2 className="size-4" />
        </button>
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------- MA · budget */
const BUDGET_LINES = ['9030', '9130', '9410', '9420', '9430', '9810'];
function MaBudget({ books, ym }: { books: Books; ym: string }) {
  const { run } = useRun();
  const [flex, setFlex] = useState(true);
  const L = ledger(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const lines: BudgetLine[] = BUDGET_LINES.filter((c) => L[c]).map((code) => {
    const a = L[code];
    const actual = a.type === 'R' ? a.credit - a.debit : a.debit - a.credit;
    const plan = books.budget.find((b) => b.period === ym && b.code === code)?.amount ?? 0;
    return { code, name: a.name, type: a.type === 'R' ? 'R' : 'X', plan, actual };
  });
  const plannedN = books.planStudents[ym] ?? 0;
  const actualN = books.courses.reduce((a, c) => a + c.students, 0);
  const fb = flexBudget(lines, plannedN, actualN, flex);
  const maxV = Math.max(1, ...fb.rows.map((r) => Math.abs(r.total)));
  const vv = (v: number) => (
    <span style={{ color: v === 0 ? undefined : v > 0 ? 'var(--au-ok)' : 'var(--au-bad)' }}>
      {v > 0 ? '+' : v < 0 ? '−' : ''}
      {fmtNum(Math.abs(v))} {v === 0 ? '' : v > 0 ? 'F' : 'U'}
    </span>
  );
  const copyPrev = () => {
    const prev = books.budget.filter((b) => b.period === addMonths(ym, -1));
    if (!prev.length) return toast.message("O'tgan oy byudjeti yo'q");
    run(async () => {
      for (const b of prev) {
        const r = await setBudgetAction({ month: ym, code: b.code, amount: b.amount });
        if (r.error) return r;
      }
      return {};
    }, "O'tgan oy byudjeti ko'chirildi");
  };
  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat s3">
        <div className="l">Byudjet foydasi</div>
        <div className="v">{fmtMln(fb.plan)}</div>
        <div className="d">{plannedN ? `${plannedN} o‘quvchi rejasida` : 'Rejadagi o‘quvchi kiritilmagan'}</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Moslashuvchan byudjet · Flexed</div>
        <div className="v">{fmtMln(fb.flexed)}</div>
        <div className="d">
          Fakt hajmi: {actualN} o‘quvchi{fb.k !== 1 ? ` (${fb.k >= 1 ? '+' : ''}${((fb.k - 1) * 100).toFixed(1)}%)` : ''}
        </div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Fakt foydasi</div>
        <div className="v" style={{ color: fb.actual >= fb.plan ? 'var(--au-ok)' : 'var(--au-bad)' }}>
          {fmtMln(fb.actual)}
        </div>
        <div className="d">Soliq va kommunal bilan · jurnaldan</div>
      </div>
      <div className="sx-card sx-stat dark s3">
        <div className="l">Umumiy og‘ish · Total variance</div>
        <div className="v">{fmtMln(fb.actual - fb.plan)}</div>
        <div className="d">{fb.actual >= fb.plan ? 'Rejadan yaxshi (F)' : 'Rejadan yomon (U)'}</div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Og‘ishlar tahlili</h3>
          <small>Hajm og‘ishi = Moslashuvchan − Statik · Narx/samaradorlik = Fakt − Moslashuvchan</small>
          <span className="sp" />
          <button className={cn('sx-chipb', flex && 'on')} onClick={() => setFlex(true)}>
            Moslashuvchan byudjet
          </button>
          <button className={cn('sx-chipb', !flex && 'on')} onClick={() => setFlex(false)}>
            Statik byudjet
          </button>
          <button className="sx-btn sm" onClick={copyPrev}>
            O‘tgan oydan ko‘chirish
          </button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-au-muted">
          <span>F — foydali, U — zararli og‘ish. Byudjet ustunini tahrirlash mumkin.</span>
          <label className="inline-flex items-center gap-2">
            Rejadagi o‘quvchi
            <input
              key={`${ym}${plannedN}`}
              className="sx-plain-inp !w-[90px]"
              type="number"
              min={0}
              defaultValue={plannedN}
              onBlur={(e) => {
                const v = Math.max(0, Math.round(Number(e.target.value) || 0));
                if (v !== plannedN) run(() => setPlanStudentsAction({ month: ym, students: v }), 'Rejadagi o‘quvchi saqlandi');
              }}
            />
            ta
          </label>
          <span>Fakt o‘quvchi — «Tannarx va marja» kurslar jadvalidan ({actualN}).</span>
        </div>
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Modda</th>
                <th>Statik byudjet</th>
                <th>Moslashuvchan</th>
                <th>Fakt</th>
                <th>Hajm og‘ishi</th>
                <th>Narx / samaradorlik</th>
                <th>Jami og‘ish</th>
                <th className="l" style={{ width: '18%' }}>
                  Foydaga ta’siri
                </th>
              </tr>
            </thead>
            <tbody>
              {fb.rows.map((l, i) => (
                <tr key={l.code} style={{ animationDelay: `${i * 30}ms` }}>
                  <td className="l">
                    <span className="code">{l.code}</span>
                    {l.name}
                    {l.variable && <small className="ml-1 text-au-faint">o‘zg.</small>}
                  </td>
                  <td>
                    <input
                      key={`${ym}${l.plan}`}
                      className="sx-plain-inp !w-[130px]"
                      type="number"
                      min={0}
                      defaultValue={l.plan}
                      onBlur={(e) => {
                        const v = Math.max(0, Number(e.target.value) || 0);
                        if (v !== l.plan) run(() => setBudgetAction({ month: ym, code: l.code, amount: v }));
                      }}
                    />
                  </td>
                  <td>{fmtNum(l.flexed)}</td>
                  <td>
                    <b>{fmtNum(l.actual)}</b>
                  </td>
                  <td>{vv(l.volume)}</td>
                  <td>{vv(l.spending)}</td>
                  <td>
                    <b>{vv(l.total)}</b>
                  </td>
                  <td className="l">
                    <div className="relative h-2 rounded bg-au-card-2">
                      <i
                        className="absolute inset-y-0 rounded"
                        style={{
                          [l.total >= 0 ? 'left' : 'right']: '50%',
                          width: `${(Math.abs(l.total) / maxV) * 50}%`,
                          background: l.total >= 0 ? 'var(--au-ok)' : 'var(--au-bad)',
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="l">Foyda</td>
                <td>{fmtNum(fb.plan)}</td>
                <td>{fmtNum(fb.flexed)}</td>
                <td>{fmtNum(fb.actual)}</td>
                <td>{vv(fb.flexed - fb.plan)}</td>
                <td>{vv(fb.actual - fb.flexed)}</td>
                <td>{vv(fb.actual - fb.plan)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-4">
          <Chart
            labels={fb.rows.map((l) => l.code)}
            fmt={fmtMln}
            height={180}
            series={[
              { n: flex ? 'Moslashuvchan reja' : 'Reja', c: '#d9d2c6', v: fb.rows.map((l) => l.flexed) },
              { n: 'Fakt', c: '#ff9f1c', v: fb.rows.map((l) => l.actual) },
            ]}
          />
        </div>
        <p className="sx-note">O‘zgaruvchan moddalar (tushum 9030, tannarx 9130, soliq 9810) fakt/reja o‘quvchi nisbatida moslashtiriladi; qolganlari doimiy.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- MA · sim */
function MaSim({ books, ym }: { books: Books; ym: string }) {
  const [sm, setSm] = useState({ price: 0, students: 0, teacher: 0, admin: 0, mkt: 0 });
  const st = statements(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const model = (k: typeof sm) => {
    const hasCourses = books.courses.length > 0;
    const revenue = hasCourses
      ? books.courses.reduce((a, c) => a + c.fee * (1 + k.price / 100) * Math.round(c.students * (1 + k.students / 100)), 0)
      : st.revenue * (1 + k.price / 100) * (1 + k.students / 100);
    const direct = hasCourses
      ? books.courses.reduce((a, c) => a + c.teacher_cost * (1 + k.teacher / 100) + c.book_cost * Math.round(c.students * (1 + k.students / 100)), 0)
      : st.cogs * (1 + k.teacher / 100);
    const fixed = st.admin * (1 + k.admin / 100) + st.selling * (1 + k.mkt / 100) + st.other;
    const tax = books.tax.regime === 'turn' ? (revenue * books.tax.turnover) / 100 : 0;
    const profit = revenue - direct - fixed - tax;
    return { revenue, direct, fixed, tax, profit };
  };
  const base = model({ price: 0, students: 0, teacher: 0, admin: 0, mkt: 0 });
  const sc = model(sm);
  const slider = (k: keyof typeof sm, n: string, min: number, max: number) => (
    <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
      <span className="flex justify-between">
        {n}
        <b className="tabular-nums text-au-ink">
          {sm[k] > 0 ? '+' : ''}
          {sm[k]}%
        </b>
      </span>
      <input className="sx-range" type="range" min={min} max={max} step={1} value={sm[k]} onChange={(e) => setSm({ ...sm, [k]: Number(e.target.value) })} />
    </label>
  );
  return (
    <div className="sx-grid">
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Ssenariy parametrlari</h3>
          <button className="sx-chipb ml-auto" onClick={() => setSm({ price: 0, students: 0, teacher: 0, admin: 0, mkt: 0 })}>
            Nolga qaytarish
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {slider('price', 'Kurs narxi', -30, 50)}
          {slider('students', "O'quvchilar soni", -50, 100)}
          {slider('teacher', "O'qituvchi xarajati", -30, 60)}
          {slider('admin', "Ma'muriy xarajat (ijara va b.)", -30, 60)}
          {slider('mkt', 'Marketing', -100, 200)}
        </div>
        <p className="sx-note">
          Asos: {books.courses.length ? 'kurslar jadvali (narx × o‘quvchi)' : 'shu oydagi jurnal'} va {ym} oyidagi haqiqiy doimiy xarajatlar.
          Soliq: {books.tax.regime === 'turn' ? `aylanma ${books.tax.turnover}%` : 'umumiy rejim (foyda solig‘i hisobga olinmagan)'}.
        </p>
      </div>
      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Natija</h3>
          <small>hozirgi holat vs ssenariy</small>
        </div>
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Ko‘rsatkich</th>
                <th>Hozir</th>
                <th>Ssenariy</th>
                <th>Farq</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Tushum', 'revenue'],
                  ["To'g'ridan-to'g'ri xarajat", 'direct'],
                  ['Doimiy xarajat', 'fixed'],
                  ['Soliq', 'tax'],
                ] as const
              ).map(([n, k]) => (
                <tr key={k}>
                  <td className="l">{n}</td>
                  <td>{fmtNum(base[k])}</td>
                  <td>{fmtNum(sc[k])}</td>
                  <td>{fmtNum(sc[k] - base[k])}</td>
                </tr>
              ))}
              <tr className="big">
                <td className="l">Foyda</td>
                <td>{fmtNum(base.profit)}</td>
                <td style={{ color: sc.profit < 0 ? 'var(--au-bad)' : 'var(--au-ok)' }}>{fmtNum(sc.profit)}</td>
                <td style={{ color: sc.profit >= base.profit ? 'var(--au-ok)' : 'var(--au-bad)' }}>{fmtNum(sc.profit - base.profit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <HBars
            fmt={fmtMln}
            rows={[
              { n: 'Hozirgi foyda', v: base.profit, c: '#c9c3b8' },
              { n: 'Ssenariy foydasi', v: sc.profit, c: sc.profit >= base.profit ? '#139a52' : '#c7322b' },
            ]}
          />
        </div>
      </div>
      <SimExtra model={(k) => model(k).profit} sm={sm} setSm={setSm} books={books} st={st} />
    </div>
  );
}

const SIM_LABEL = { price: 'Kurs narxi', students: "O'quvchilar soni", teacher: "O'qituvchi xarajati", admin: "Ma'muriy xarajat", mkt: 'Marketing' } as const;
type SimK = keyof typeof SIM_LABEL;
const PRESETS: [string, Partial<Record<SimK, number>>][] = [
  ['Narx +10%', { price: 10, students: -4 }],
  ['Kengayish', { students: 25, mkt: 60, admin: 30 }],
  ['Inqiroz', { students: -20, price: -5 }],
];

/** Presets, tornado sensitivity and the target-profit head-count. */
function SimExtra({
  model,
  sm,
  setSm,
  books,
  st,
}: {
  model: (k: Record<SimK, number>) => number;
  sm: Record<SimK, number>;
  setSm: (v: Record<SimK, number>) => void;
  books: Books;
  st: ReturnType<typeof statements>;
}) {
  const [target, setTarget] = useState(0);
  const tor = tornado(model, sm, 10);
  const mx = Math.max(1, ...tor.map((t) => t.range));
  const c = cvp(books.courses, st.selling + st.admin + st.other);
  const need = studentsForTarget(c.fixed, target, c.cm);
  return (
    <>
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Tayyor ssenariylar</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(([n, p]) => (
            <button key={n} className="sx-chipb" onClick={() => { setSm({ price: 0, students: 0, teacher: 0, admin: 0, mkt: 0, ...p }); toast.success(`Ssenariy qo‘llandi: ${n}`); }}>
              {n}
            </button>
          ))}
        </div>
        <div className="sx-h mt-5">
          <h3>Maqsadli foyda uchun kerakli o‘quvchilar</h3>
        </div>
        <p className="mb-2 text-xs text-au-muted">N = (Doimiy xarajat + Maqsadli foyda) / (1 o‘quvchi marjasi)</p>
        <label className="flex items-center gap-2 text-xs font-semibold text-au-muted">
          Maqsadli oylik sof foyda
          <input className="sx-inp !w-[160px] text-right" type="number" min={0} value={target} onChange={(e) => setTarget(Math.max(0, Number(e.target.value) || 0))} />
          so‘m
        </label>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            Kerakli o‘quvchi <b className="block text-lg tabular-nums">{need ?? '—'}</b>
          </div>
          <div>
            Hozir <b className="block text-lg tabular-nums">{c.N}</b>
          </div>
          <div>
            Farq{' '}
            <b className="block text-lg" style={{ color: need !== null && need <= c.N ? 'var(--au-ok)' : 'var(--au-bad)' }}>
              {need === null ? 'Marja manfiy' : need <= c.N ? 'maqsadga yetildi' : `+${need - c.N} kerak`}
            </b>
          </div>
        </div>
      </div>
      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Sezuvchanlik (tornado)</h3>
          <small>har bir drayver ±10 p.p. o‘zgarishining foydaga ta’siri</small>
        </div>
        <div className="flex flex-col gap-2">
          {tor.map((t) => (
            <div key={t.k} className="flex items-center gap-2 text-sm">
              <span className="w-[140px] truncate">{SIM_LABEL[t.k]}</span>
              <div className="relative h-3 flex-1 rounded bg-au-card-2">
                <i className="absolute inset-y-0 rounded-l" style={{ right: '50%', width: `${(Math.abs(Math.min(t.up, t.down, 0)) / mx) * 50}%`, background: 'var(--au-bad)' }} />
                <i className="absolute inset-y-0 rounded-r" style={{ left: '50%', width: `${(Math.max(t.up, t.down, 0) / mx) * 50}%`, background: 'var(--au-ok)' }} />
              </div>
              <b className="w-[80px] text-right tabular-nums">±{fmtMln(t.range)}</b>
            </div>
          ))}
        </div>
        <p className="sx-note">Qizil — foydani kamaytiradi, yashil — oshiradi.</p>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ MA · cash */
function MaCash({ books, today }: { books: Books; today: string }) {
  const W = cashWeeks(books.accounts, books.opening, books.entries, today, 13);
  const min = books.tax.minCash;
  const low = W.filter((w) => w.closing < min).length;
  const inflow = W.reduce((a, w) => a + w.inflow, 0);
  const outflow = W.reduce((a, w) => a + w.outflow, 0);
  const lbl = (s: string) => `${+s.slice(8, 10)}.${s.slice(5, 7)}`;
  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat dark s4">
        <div className="l">Hozirgi pul qoldig‘i</div>
        <div className="v">{fmtMln(W.at(-1)?.closing ?? 0)}</div>
        <div className="d">Kassa + bank (5010 + 5110)</div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">13 haftalik kirim / chiqim</div>
        <div className="v">{fmtMln(inflow - outflow)}</div>
        <div className="d">
          +{fmtMln(inflow)} / −{fmtMln(outflow)}
        </div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">Minimal zaxira ({fmtMln(min)})</div>
        <div className="v" style={{ color: low ? 'var(--au-bad)' : 'var(--au-ok)' }}>{low ? `${low} hafta past` : 'Xavfsiz'}</div>
        <div className="d">Chegarani «Soliq & ish haqi» sozlamalarida o‘zgartiring</div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>13 haftalik pul oqimi</h3>
          <small>haftalar dushanbadan · jurnaldagi kassa/bank harakati</small>
        </div>
        <Chart
          labels={W.map((w) => lbl(w.from))}
          fmt={fmtMln}
          series={[
            { n: 'Kirim', c: '#139a52', v: W.map((w) => w.inflow) },
            { n: 'Chiqim', c: '#e8567a', v: W.map((w) => -w.outflow) },
            { n: 'Qoldiq', c: '#17161a', v: W.map((w) => w.closing), kind: 'line' },
            { n: 'Minimal zaxira', c: '#c7322b', v: W.map(() => min), kind: 'line', dash: true },
          ]}
        />
        <div className="sx-tw mt-4">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Hafta</th>
                <th>Kirim</th>
                <th>Chiqim</th>
                <th>Sof</th>
                <th>Qoldiq</th>
              </tr>
            </thead>
            <tbody>
              {W.map((w, i) => (
                <tr key={w.from} style={{ animationDelay: `${i * 20}ms` }}>
                  <td className="l">
                    {lbl(w.from)} – {lbl(w.to)}
                  </td>
                  <td>{fmtNum(w.inflow)}</td>
                  <td>{fmtNum(w.outflow)}</td>
                  <td style={{ color: w.inflow - w.outflow < 0 ? 'var(--au-bad)' : undefined }}>{fmtNum(w.inflow - w.outflow)}</td>
                  <td style={{ color: w.closing < min ? 'var(--au-bad)' : undefined }}>{fmtNum(w.closing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <CashForecast books={books} today={today} min={min} />
    </div>
  );
}

/** Forward 13-week projection from the last 13 weeks' real averages. */
function CashForecast({ books, today, min }: { books: Books; today: string; min: number }) {
  const f = cashForecast(books.accounts, books.opening, books.entries, today, 13, 13);
  const lbl = (s: string) => `${+s.slice(8, 10)}.${s.slice(5, 7)}`;
  const low = f.weeks.find((w) => w.closing < min);
  const minBal = Math.min(...f.weeks.map((w) => w.closing));
  return (
    <>
      <div className="sx-card sx-stat s4">
        <div className="l">13 hafta oxirida (prognoz)</div>
        <div className="v" style={{ color: (f.weeks.at(-1)?.closing ?? 0) >= f.opening ? 'var(--au-ok)' : 'var(--au-bad)' }}>{fmtMln(f.weeks.at(-1)?.closing ?? 0)}</div>
        <div className="d">hozir {fmtMln(f.opening)}</div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">Eng past qoldiq (prognoz)</div>
        <div className="v" style={{ color: minBal < min ? 'var(--au-bad)' : undefined }}>{fmtMln(minBal)}</div>
      </div>
      <div className={cn('sx-card sx-stat s4', low && 'dark')}>
        <div className="l">Minimal zaxira chegarasi</div>
        <div className="v">{fmtMln(min)}</div>
        <div className="d">{low ? `${lbl(low.from)} haftasida chegaradan pastga tushadi` : 'Butun davrda xavfsiz'}</div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>13 haftalik pul oqimi prognozi</h3>
          <small>oxirgi 13 haftadagi haqiqiy kirim/chiqimning haftalik o‘rtachasi bo‘yicha</small>
        </div>
        {f.avgIn === 0 && f.outTotal === 0 ? (
          <div className="sx-empty">Prognoz uchun oxirgi 13 haftada kassa/bank harakati yo‘q.</div>
        ) : (
          <>
            <Chart
              labels={f.weeks.map((w) => lbl(w.from))}
              fmt={fmtMln}
              series={[
                { n: 'Kirim', c: '#139a52', v: f.weeks.map((w) => w.inflow) },
                { n: 'Chiqim', c: '#e8567a', v: f.weeks.map((w) => -w.outflow) },
                { n: 'Hafta oxiri qoldig‘i', c: '#17161a', v: f.weeks.map((w) => w.closing), kind: 'line' },
                { n: 'Minimal zaxira', c: '#ff9f1c', v: f.weeks.map(() => min), kind: 'line', dash: true },
              ]}
            />
            <div className="sx-tw mt-4">
              <table className="sx-tbl">
                <thead>
                  <tr>
                    <th className="l">Hafta</th>
                    <th>Kirim</th>
                    {CASH_BUCKETS.map(([k, n]) => (
                      <th key={k}>{n}</th>
                    ))}
                    <th>Sof oqim</th>
                    <th>Qoldiq</th>
                  </tr>
                </thead>
                <tbody>
                  {f.weeks.map((w) => (
                    <tr key={w.from}>
                      <td className="l">{lbl(w.from)}</td>
                      <td style={{ color: 'var(--au-ok)' }}>{fmtMln(w.inflow)}</td>
                      {CASH_BUCKETS.map(([k]) => (
                        <td key={k}>{w.out[k] ? fmtMln(w.out[k]) : '—'}</td>
                      ))}
                      <td style={{ color: w.inflow - w.outflow < 0 ? 'var(--au-bad)' : 'var(--au-ok)' }}>
                        <b>{fmtMln(w.inflow - w.outflow)}</b>
                      </td>
                      <td style={{ color: w.closing < min ? 'var(--au-bad)' : undefined }}>
                        <b>{fmtMln(w.closing)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- FA · journal */
function FaJournal({ books, ym, today }: { books: Books; ym: string; today: string }) {
  const { run, pending } = useRun();
  const [f, setF] = useState({ date: today.slice(0, 7) === ym ? today : monthStart(ym), doc: '', description: '', debit: '5110', credit: '4010', amount: '' });
  // Keep the default entry date inside the month picked above.
  const [fYm, setFYm] = useState(ym);
  if (fYm !== ym) {
    setFYm(ym);
    setF((x) => ({ ...x, date: today.slice(0, 7) === ym ? today : monthStart(ym) }));
  }
  const [q, setQ] = useState('');
  const [acc, setAcc] = useState('all');
  const [editId, setEditId] = useState<string | null>(null);
  const blank = { doc: '', description: '', amount: '' };
  const name = (c: string) => books.accounts.find((a) => a.code === c)?.name ?? c;
  const list = books.entries
    .filter((e) => e.entry_date >= monthStart(ym) && e.entry_date <= monthEnd(ym))
    .filter((e) => acc === 'all' || e.debit === acc || e.credit === acc)
    .filter((e) => !q || `${e.description} ${e.doc}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  const total = list.reduce((a, e) => a + e.amount, 0);
  const submit = () => {
    const amount = Number(f.amount);
    if (!f.description.trim() || !(amount > 0) || f.debit === f.credit) return toast.error("Yozuv to'liq emas: tavsif, summa va turli hisoblar kerak");
    run(() => addJournalEntryAction({ ...f, amount, id: editId ?? undefined }), editId ? 'Yozuv saqlandi' : 'Yozuv jurnalga qo‘shildi', () => {
      setF({ ...f, ...blank });
      setEditId(null);
    });
  };
  const accSel = (k: 'debit' | 'credit') => (
    <select className="sx-inp !w-[220px]" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
      {books.accounts.map((a) => (
        <option key={a.code} value={a.code}>
          {a.code} · {a.name}
        </option>
      ))}
    </select>
  );
  return (
    <div className="sx-grid">
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>{editId ? 'Provodkani tahrirlash' : 'Yangi provodka'}</h3>
          <small>Dt / Kt — ikki tomonlama yozuv</small>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {JOURNAL_TEMPLATES.map(([n, dt, kt]) => (
            <button key={n} className={cn('sx-chipb', f.debit === dt && f.credit === kt && 'on')} onClick={() => setF({ ...f, debit: dt, credit: kt, description: f.description || n })}>
              {n}
            </button>
          ))}
        </div>
        <div className="sx-form">
          <label>
            Sana
            <input type="date" className="sx-inp" value={f.date} onChange={(e) => e.target.value && setF({ ...f, date: e.target.value })} />
          </label>
          <label>
            Hujjat №
            <input className="sx-inp !w-[100px]" maxLength={40} value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })} />
          </label>
          <label className="min-w-[220px] flex-1">
            Tavsif
            <input className="sx-inp" maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </label>
          <label>
            Debet
            {accSel('debit')}
          </label>
          <label>
            Kredit
            {accSel('credit')}
          </label>
          <label>
            Summa, so‘m
            <input
              className="sx-inp !w-[150px] text-right"
              type="number"
              min={0}
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
          <button className="sx-btn primary" disabled={pending} onClick={submit}>
            {editId ? 'Saqlash' : <><Plus className="size-4" /> Provodka qilish</>}
          </button>
          {editId && (
            <button className="sx-btn" onClick={() => { setEditId(null); setF({ ...f, ...blank }); }}>
              Bekor qilish
            </button>
          )}
        </div>
        <JournalCheck debit={f.debit} credit={f.credit} amount={Number(f.amount) || 0} name={name} />
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Jurnal</h3>
          <small>
            {list.length} ta yozuv · {fmtNum(total)} so‘m
          </small>
          <span className="sp" />
          <input className="sx-inp !h-[32px] !w-[200px]" placeholder="Qidirish…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="sx-inp !h-[32px] !w-[200px]" value={acc} onChange={(e) => setAcc(e.target.value)}>
            <option value="all">Barcha hisoblar</option>
            {books.accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Sana</th>
                <th className="l">Hujjat</th>
                <th className="l">Tavsif</th>
                <th className="l">Debet</th>
                <th className="l">Kredit</th>
                <th>Summa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} className="l">
                    <div className="sx-empty">Bu oy uchun yozuv yo‘q</div>
                  </td>
                </tr>
              )}
              {list.map((e, i) => (
                <tr key={e.id} style={{ animationDelay: `${Math.min(i, 20) * 20}ms` }}>
                  <td className="l tabular-nums">{e.entry_date.split('-').reverse().join('.')}</td>
                  <td className="l">{e.source ? <span className="sx-pl info">AUTO</span> : e.doc}</td>
                  <td className="l">{e.description}</td>
                  <td className="l" title={name(e.debit)}>
                    <span className="code">{e.debit}</span>
                  </td>
                  <td className="l" title={name(e.credit)}>
                    <span className="code">{e.credit}</span>
                  </td>
                  <td>{fmtNum(e.amount)}</td>
                  <td>
                    {!e.source && (
                      <span className="inline-flex items-center gap-1">
                      <button
                        className="sx-btn sm"
                        aria-label="Tahrirlash"
                        onClick={() => {
                          setEditId(e.id);
                          setF({ date: e.entry_date, doc: e.doc ?? '', description: e.description, debit: e.debit, credit: e.credit, amount: String(e.amount) });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button className="sx-btn sm text-au-bad" onClick={() => window.confirm(`Yozuv o'chirilsinmi?
${e.debit}/${e.credit} · ${fmtNum(e.amount)} · ${e.description}`) && run(() => deleteJournalEntryAction(e.id), "Yozuv o'chirildi")} aria-label="O'chirish">
                        <Trash2 className="size-4" />
                      </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sx-note">AUTO yozuvlar (ish haqi, eskirish, soliq) tegishli bo‘limdan qayta o‘tkazilganda yangilanadi.</p>
      </div>
    </div>
  );
}

/** Live double-entry preview: the same amount lands on both sides. */
function JournalCheck({ debit, credit, amount, name }: { debit: string; credit: string; amount: number; name: (c: string) => string }) {
  const same = debit === credit;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-au-line bg-au-card-2 p-3 text-sm">
      <div className="min-w-[180px] flex-1">
        <div className="text-[11px] font-bold text-au-muted uppercase">Debet</div>
        <b>
          {debit} · {name(debit)}
        </b>
        <div className="tabular-nums text-au-ok">+ {fmtNum(amount)}</div>
      </div>
      <b className="text-xl">{same ? '≠' : '='}</b>
      <div className="min-w-[180px] flex-1">
        <div className="text-[11px] font-bold text-au-muted uppercase">Kredit</div>
        <b>
          {credit} · {name(credit)}
        </b>
        <div className="tabular-nums text-au-ok">+ {fmtNum(amount)}</div>
      </div>
      <span className={cn('sx-pl', same ? 'bad' : amount <= 0 ? 'warn' : 'ok')}>
        {same ? 'Debet va kredit bir xil bo‘lmasin' : amount <= 0 ? 'Summani kiriting' : 'Balans saqlanadi'}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------- FA · ledger */
function FaLedger({ books, ym }: { books: Books; ym: string }) {
  const { run, pending } = useRun();
  const L = ledger(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const lines = books.accounts.map((a) => L[a.code]);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [ob, setOb] = useState<Record<string, number>>(() => ({ ...books.opening }));
  const tD = lines.reduce((a, l) => a + l.debit, 0);
  const tK = lines.reduce((a, l) => a + l.credit, 0);
  const obD = books.accounts.filter((a) => debitNormal(a.type)).reduce((s, a) => s + (ob[a.code] ?? 0), 0);
  const obK = books.accounts.filter((a) => !debitNormal(a.type)).reduce((s, a) => s + (ob[a.code] ?? 0), 0);
  const sideAmt = (v: number, dn: boolean, want: 'd' | 'k') => {
    const d = dn ? v : -v;
    return want === 'd' ? (d > 0 ? fmtNum(d) : '') : d < 0 ? fmtNum(-d) : '';
  };
  const rows = open
    ? books.entries.filter((e) => (e.debit === open || e.credit === open) && e.entry_date >= monthStart(ym) && e.entry_date <= monthEnd(ym))
    : [];
  return (
    <div className="sx-grid">
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Aylanma-saldo vedomosti</h3>
          <small>{ym} · Qatorni bosing — hisob kartochkasi ochiladi</small>
          <span className={cn('sx-pl', Math.abs(tD - tK) < 0.01 ? 'ok' : 'bad')}>
            {Math.abs(tD - tK) < 0.01 ? 'Dt = Kt' : `Dt ≠ Kt (${fmtNum(tD - tK)})`}
          </span>
          <span className="sp" />
          <button className="sx-btn sm" onClick={() => setEdit((v) => !v)}>
            {edit ? 'Yopish' : 'Boshlang‘ich qoldiqlar'}
          </button>
        </div>
        {edit && (
          <div className="mb-4 rounded-xl border border-au-line bg-au-card-2 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-au-muted">
              Hisob yuritish boshlangan kundagi qoldiqlar (tabiiy tomonida).
              <span className={cn('sx-pl', Math.abs(obD - obK) < 0.01 ? 'ok' : 'bad')}>
                Dt {fmtNum(obD)} · Kt {fmtNum(obK)}{Math.abs(obD - obK) >= 0.01 ? ` · farq ${fmtNum(obD - obK)}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {books.accounts
                .filter((a) => a.type !== 'R' && a.type !== 'X')
                .map((a) => (
                  <label key={a.code} className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      <span className="code font-bold text-au-accent-text">{a.code}</span> {a.name}
                    </span>
                    <input
                      className="sx-plain-inp !w-[130px]"
                      type="number"
                      min={0}
                      value={ob[a.code] ?? 0}
                      onChange={(e) => setOb({ ...ob, [a.code]: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                ))}
            </div>
            <button
              className="sx-btn primary sm mt-3"
              disabled={pending}
              onClick={() =>
                (Math.abs(obD - obK) < 0.01 ||
                  window.confirm(`Qoldiqlar muvozanatda emas (Dt − Kt = ${fmtNum(obD - obK)}). Balans teng chiqmaydi. Baribir saqlansinmi?`)) &&
                run(() => setOpeningBalancesAction(ob), 'Boshlang‘ich qoldiqlar saqlandi', () => setEdit(false))
              }
            >
              Saqlash
            </button>
          </div>
        )}
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Hisob</th>
                <th>Boshi Dt</th>
                <th>Boshi Kt</th>
                <th>Aylanma Dt</th>
                <th>Aylanma Kt</th>
                <th>Oxirgi qoldiq Dt</th>
                <th>Oxirgi qoldiq Kt</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const dn = debitNormal(l.type);
                return (
                  <tr key={l.code} style={{ animationDelay: `${i * 15}ms`, cursor: 'pointer' }} onClick={() => setOpen(open === l.code ? null : l.code)}>
                    <td className="l">
                      <span className="code">{l.code}</span>
                      {l.name}
                    </td>
                    <td>{sideAmt(l.openingPeriod, dn, 'd')}</td>
                    <td>{sideAmt(l.openingPeriod, dn, 'k')}</td>
                    <td>{l.debit ? fmtNum(l.debit) : ''}</td>
                    <td>{l.credit ? fmtNum(l.credit) : ''}</td>
                    <td>{sideAmt(l.closing, dn, 'd')}</td>
                    <td>{sideAmt(l.closing, dn, 'k')}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="l">Jami aylanma</td>
                <td />
                <td />
                <td>{fmtNum(tD)}</td>
                <td>{fmtNum(tK)}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {open && L[open] && <TAccount line={L[open]} rows={rows} />}
    </div>
  );
}

/** Account card as a T-account (debit | credit) with the running balance. */
function TAccount({ line, rows }: { line: ReturnType<typeof ledger>[string]; rows: Books['entries'] }) {
  const dn = debitNormal(line.type);
  const code = line.code;
  const sorted = [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const run = sorted.reduce<number[]>((acc, e) => [...acc, (acc.at(-1) ?? line.openingPeriod) + (e.debit === code ? 1 : -1) * (dn ? 1 : -1) * e.amount], []);
  const side = (d: boolean) => sorted.filter((e) => (e.debit === code) === d);
  const openSide = line.openingPeriod === 0 ? null : (line.openingPeriod > 0) === dn ? 'd' : 'k';
  const col = (d: boolean) => (
    <div className="flex flex-col gap-1 p-2">
      {openSide === (d ? 'd' : 'k') && (
        <div className="flex justify-between gap-2 text-xs text-au-muted">
          <span>Boshlang‘ich qoldiq</span>
          <b className="tabular-nums">{fmtNum(Math.abs(line.openingPeriod))}</b>
        </div>
      )}
      {side(d).map((e) => (
        <div key={e.id} className="flex justify-between gap-2 text-xs">
          <span className="truncate">
            {e.entry_date.slice(8)}.{e.entry_date.slice(5, 7)} · {e.description} <em className="text-au-faint">({d ? e.credit : e.debit})</em>
          </span>
          <b className="tabular-nums">{fmtNum(e.amount)}</b>
        </div>
      ))}
    </div>
  );
  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>
          Hisob kartochkasi (T-hisob) · {code} {line.name}
        </h3>
        <small>shu oydagi harakatlar</small>
      </div>
      <div className="overflow-hidden rounded-xl border border-au-line">
        <div className="grid grid-cols-2 border-b border-au-line bg-au-card-2 text-center text-xs font-bold">
          <span className="p-1.5">Debet</span>
          <span className="border-l border-au-line p-1.5">Kredit</span>
        </div>
        <div className="grid grid-cols-2">
          {col(true)}
          <div className="border-l border-au-line">{col(false)}</div>
        </div>
        <div className="grid grid-cols-2 border-t border-au-line text-xs">
          <span className="p-1.5">
            Aylanma: <b>{fmtNum(line.debit)}</b>
          </span>
          <span className="border-l border-au-line p-1.5">
            Aylanma: <b>{fmtNum(line.credit)}</b>
          </span>
        </div>
        <div className="border-t border-au-line p-2 text-right text-sm">
          Oxirgi qoldiq: <b>{fmtNum(Math.abs(line.closing))}</b>{' '}
          {line.closing === 0 ? '' : (line.closing > 0) === dn ? '(debet)' : '(kredit)'}
        </div>
      </div>
      {sorted.length > 0 && (
        <div className="mt-4">
          <Chart
            labels={['Boshi', ...sorted.map((e) => `${e.entry_date.slice(8)}.${e.entry_date.slice(5, 7)}`)]}
            fmt={fmtMln}
            height={170}
            series={[{ n: 'Qoldiq', c: '#17161a', v: [line.openingPeriod, ...run], kind: 'line' }]}
          />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- FA · reports */
function FaReports({ books, ym }: { books: Books; ym: string }) {
  const s = statements(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const L = ledger(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const cf = cashFlowStatement(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const q = ratios(s);
  const rec = reconcile(books.courses, s);
  const accName = (c: string) => books.accounts.find((a) => a.code === c)?.name ?? c;
  const row = (n: string, v: number, cls = '') => (
    <tr className={cls}>
      <td className="l">{n}</td>
      <td style={{ color: v < 0 ? 'var(--au-bad)' : undefined }}>{fmtNum(v)}</td>
    </tr>
  );
  const grp = (n: string) => (
    <tr>
      <td className="l text-[11px] font-bold tracking-wide text-au-muted uppercase" colSpan={2}>
        {n}
      </td>
    </tr>
  );
  const R: [string, string, number | null, string, number, number | null][] = [
    ['Joriy likvidlik', 'Current ratio', q.current, '×', 2, 1.5],
    ['Tezkor likvidlik', 'Quick ratio', q.quick, '×', 2, 1],
    ['Sotuv rentabelligi', 'ROS', q.ros === null ? null : q.ros * 100, '%', 1, 10],
    ['Aktivlar rentabelligi', 'ROA (oylik)', q.roa === null ? null : q.roa * 100, '%', 1, 2],
    ['Kapital rentabelligi', 'ROE (oylik)', q.roe === null ? null : q.roe * 100, '%', 1, 3],
    ['Qarz / kapital', 'D/E', q.de, '×', 2, null],
  ];
  return (
    <div className="sx-grid">
      <div className="sx-card s6">
        <div className="sx-h">
          <h3>Buxgalteriya balansi</h3>
          <small>{monthEnd(ym).split('-').reverse().join('.')} holatiga · 1-shakl</small>
          <span className="sp" />
          <span className={cn('sx-pl', s.imbalance === 0 ? 'ok' : 'bad')}>
            {s.imbalance === 0 ? 'Aktiv = Passiv' : `Farq ${fmtNum(s.imbalance)}`}
          </span>
        </div>
        <table className="sx-tbl">
          <tbody>
            {grp('Aktivlar · I. Uzoq muddatli aktivlar')}
            {row('Asosiy vositalar (boshlang‘ich qiymat, 0100)', L['0100']?.closing ?? 0)}
            {row('Eskirish (0200)', -(L['0200']?.closing ?? 0))}
            {row('Asosiy vositalar (qoldiq qiymat)', s.fixedNet, 'sub')}
            {grp('II. Joriy aktivlar')}
            {row('Tovar-moddiy zaxiralar (2910)', s.inventory)}
            {row('Debitorlik qarzlari (4010)', s.receivables)}
            {row('Pul mablag‘lari (5010 + 5110)', s.cash)}
            {row('Jami joriy aktivlar', s.currentAssets, 'sub')}
            {row('BALANS AKTIVI', s.assets, 'big')}
            {grp('Passivlar · I. O‘z mablag‘lari manbalari')}
            {row('Ustav kapitali (8300)', s.capital)}
            {row('Taqsimlanmagan foyda (o‘tgan davrlar)', s.retained - s.net)}
            {row('Hisobot davri sof foydasi (zarari)', s.net)}
            {row('Jami o‘z mablag‘lari', s.equity, 'sub')}
            {grp('II. Majburiyatlar')}
            {row('Yetkazib beruvchilarga qarz (6010)', s.payables)}
            {row('Olingan bo‘naklar (6310)', s.advances)}
            {row('Budjetga qarz (6410)', s.taxPayable)}
            {row('Ijtimoiy soliq bo‘yicha qarz (6520)', s.socialPayable)}
            {row('Mehnat haqi bo‘yicha qarz (6710)', s.wagesPayable)}
            {row('Jami majburiyatlar', s.liabilities, 'sub')}
            {row('BALANS PASSIVI', s.liabilities + s.equity, 'big')}
          </tbody>
        </table>
        {s.imbalance !== 0 && (
          <p className="sx-note">
            Farq odatda boshlang‘ich qoldiqlar muvozanatsizligidan kelib chiqadi — Bosh daftar → «Boshlang‘ich qoldiqlar»da Aktiv = Passiv bo‘lishini
            tekshiring.
          </p>
        )}
      </div>
      <div className="s6 flex flex-col gap-4">
        <div className="sx-card">
          <div className="sx-h">
            <h3>Moliyaviy natijalar to‘g‘risida hisobot</h3>
            <small>{ym} · 2-shakl</small>
          </div>
          <table className="sx-tbl">
            <tbody>
              {row("Sof tushum — ta'lim xizmatlari (9030)", s.revenue)}
              {row('Sotilgan xizmatlar tannarxi (9130)', -s.cogs)}
              {row('Yalpi foyda', s.gross, 'sub')}
              {row('Sotish xarajatlari (9410)', -s.selling)}
              {row("Ma'muriy xarajatlar (9420)", -s.admin)}
              {row('Boshqa operatsion xarajatlar (9430)', -s.other)}
              {row('Operatsion foyda', s.operating, 'sub')}
              {row('Soliq xarajatlari (9810)', -s.tax)}
              {row('SOF FOYDA (ZARAR)', s.net, 'big')}
            </tbody>
          </table>
        </div>
        <div className="sx-card">
          <div className="sx-h">
            <h3>Pul oqimlari to‘g‘risida hisobot</h3>
            <small>to‘g‘ridan-to‘g‘ri usul · {ym}</small>
            <span className="sp" />
            <span className={cn('sx-pl', Math.abs(cf.closing - s.cash) < 0.01 ? 'ok' : 'bad')}>
              {Math.abs(cf.closing - s.cash) < 0.01 ? 'Balans bilan mos' : 'Mos emas'}
            </span>
          </div>
          <table className="sx-tbl">
            <tbody>
              {row('Davr boshidagi pul', cf.opening)}
              {(
                [
                  ['op', 'Operatsion faoliyat'],
                  ['inv', 'Investitsiya faoliyati'],
                  ['fin', 'Moliyaviy faoliyat'],
                ] as const
              ).map(([k, n]) => (
                <Fragment key={k}>
                  {grp(n)}
                  {cf.lines
                    .filter((l) => l.cat === k)
                    .map((l) => (
                      <Fragment key={`${l.code}${l.amount > 0}`}>{row(`${l.amount >= 0 ? 'Kirim' : 'Chiqim'}: ${l.code} ${accName(l.code)}`, l.amount)}</Fragment>
                    ))}
                  {row('Sof oqim', cf[k], 'sub')}
                </Fragment>
              ))}
              {row('Davr oxiridagi pul', cf.closing, 'big')}
            </tbody>
          </table>
        </div>
      </div>
      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Moliyaviy koeffitsientlar</h3>
          <small>Ratio analysis</small>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {R.map(([n, en, v, u, d, norm]) => (
            <div key={en} className="rounded-xl border border-au-line bg-au-card-2 p-3">
              <div className="text-[11px] text-au-faint">{en}</div>
              <div className="text-xs font-semibold text-au-muted">{n}</div>
              <div className="text-xl font-bold tabular-nums" style={{ color: v === null || norm === null ? undefined : v >= norm ? 'var(--au-ok)' : 'var(--au-bad)' }}>
                {v === null ? '—' : `${v.toFixed(d)}${u}`}
              </div>
              <div className="text-[11px] text-au-faint">{norm === null ? 'past = xavfsiz' : `me'yor ≥ ${norm}${u}`}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>MA → FA solishtirish</h3>
          <small>Reconciliation</small>
        </div>
        <p className="mb-2 text-xs text-au-muted">Nega boshqaruv foydasi va buxgalteriya foydasi farq qiladi:</p>
        <table className="sx-tbl">
          <tbody>
            {row('Boshqaruv hisobi sof foydasi', rec.ma, 'sub')}
            {rec.rows.map((r) => (
              <Fragment key={r.n}>{row(r.n, r.v)}</Fragment>
            ))}
            {row('Moliyaviy hisob sof foydasi', rec.fa, 'big')}
          </tbody>
        </table>
        <p className="sx-note">
          Boshqaruv foydasi = kurslar modeli qoplamasi (Tannarx va marja) − jurnaldagi doimiy xarajatlar (9410 + 9420 + 9430). Qolgan farq — model
          bilan jurnal o‘rtasidagi tushum/tannarx tafovuti va soliq.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- FA · tax/pay */
function FaTax({ books, ym }: { books: Books; ym: string }) {
  const { run, pending } = useRun();
  const [t, setT] = useState<TaxSettings>(books.tax);
  const [rows, setRows] = useState<PayrollLine[] | null>(null);
  // Read-only fetch keyed on the month string (stable) — re-runs only when
  // the month changes, never on its own result.
  useEffect(() => {
    let live = true;
    getPayrollForMonthAction(ym).then((res) => {
      if (!live) return;
      if (res.error) toast.error(err(res.error));
      setRows(res.rows ?? []);
    });
    return () => {
      live = false;
      setRows(null);
    };
  }, [ym]);
  // Accountant's corrections to the accrued gross, per month (staffId → so'm).
  const [ovs, setOvs] = useState<Record<string, Record<string, number>>>({});
  const ov = ovs[ym] ?? {};
  const p = payrollTaxes((rows ?? []).map((r) => (r.staffId in ov ? { ...r, gross: ov[r.staffId] } : r)), t);
  const s = statements(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym));
  const cmp = taxCompare(s.revenue, s.net + s.tax, t);
  const posted = books.entries.some((e) => e.source?.startsWith(`payroll:${ym}:`));
  const rate = (k: 'turnover' | 'pit' | 'social' | 'profit' | 'vat', n: string) => (
    <label>
      {n}
      <input className="sx-inp !w-[80px] text-right" type="number" min={0} max={100} step={0.5} value={t[k]} onChange={(e) => setT({ ...t, [k]: Number(e.target.value) })} />
    </label>
  );
  return (
    <div className="sx-grid">
      <div className={cn('sx-card sx-stat s4', t.regime === 'turn' && 'dark')}>
        <div className="l">Aylanmadan olinadigan soliq · {t.turnover}%</div>
        <div className="v">{fmtMln(cmp.turnover)}</div>
        <div className="d">{cmp.better === 'turn' ? 'Hozir arzonroq' : 'Qimmatroq'}</div>
      </div>
      <div className={cn('sx-card sx-stat s4', t.regime === 'gen' && 'dark')}>
        <div className="l">Umumiy rejim · foyda {t.profit}% + QQS {t.vat}%</div>
        <div className="v">{fmtMln(cmp.general)}</div>
        <div className="d">
          Foyda solig‘i {fmtMln(cmp.profit)} · QQS {t.vatExempt ? 'ozod' : fmtMln(cmp.vat)}
        </div>
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Tanlangan rejim</h3>
          {cmp.better === t.regime ? <span className="sx-pl ok">Optimal</span> : <span className="sx-pl warn">{fmtMln(Math.abs(cmp.turnover - cmp.general))} tejash mumkin</span>}
        </div>
        <button
          className="sx-btn sm"
          disabled={pending || t.regime !== 'turn'}
          onClick={() => run(() => postTurnoverTaxAction(ym), `Aylanma soliq ${ym} jurnalga o‘tkazildi`)}
        >
          Aylanma soliqni jurnalga o‘tkazish
        </button>
        <p className="sx-note">Shu oy tushumidan hisoblanadi: Dt 9810 / Kt 6410. Qayta bossangiz yangilanadi.</p>
      </div>

      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Soliq stavkalari va sozlamalar</h3>
          <small>buxgalter tasdiqlasin</small>
        </div>
        <div className="sx-form">
          {rate('turnover', 'Aylanma %')}
          {rate('pit', 'JShDS %')}
          {rate('social', 'Ijtimoiy %')}
          {rate('profit', 'Foyda %')}
          {rate('vat', 'QQS %')}
          <label>
            Rejim
            <select className="sx-inp !w-[140px]" value={t.regime} onChange={(e) => setT({ ...t, regime: e.target.value as 'turn' | 'gen' })}>
              <option value="turn">Aylanma</option>
              <option value="gen">Umumiy</option>
            </select>
          </label>
          <label>
            Minimal pul zaxirasi
            <input className="sx-inp !w-[150px] text-right" type="number" min={0} value={t.minCash} onChange={(e) => setT({ ...t, minCash: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label className="!flex-row items-center gap-2 pb-2">
            <input type="checkbox" checked={t.vatExempt} onChange={(e) => setT({ ...t, vatExempt: e.target.checked })} />
            Ta’lim QQSdan ozod
          </label>
          <button className="sx-btn primary" disabled={pending} onClick={() => run(() => saveTaxSettingsAction(t), 'Sozlamalar saqlandi')}>
            Saqlash
          </button>
        </div>
      </div>

      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Ish haqi vedomosti</h3>
          <small>{ym} · Moliya bo‘limidagi haqiqiy ish haqi · Hisoblangan summani tahrirlang — jami va soliqlar qayta hisoblanadi</small>
          <span className="sp" />
          {posted && <span className="sx-pl ok">Jurnalga o‘tkazilgan</span>}
          <button
            className="sx-btn primary sm"
            disabled={pending || !rows || rows.length === 0}
            onClick={() => run(() => postPayrollAction(ym, ov), `Ish haqi ${ym} jurnalga o‘tkazildi`)}
          >
            {posted ? 'Qayta o‘tkazish' : 'Jurnalga o‘tkazish'}
          </button>
        </div>
        {rows === null ? (
          <div className="sx-empty">Yuklanmoqda…</div>
        ) : rows.length === 0 ? (
          <div className="sx-empty">Bu oy uchun Moliya bo‘limida ish haqi belgilanmagan.</div>
        ) : (
          <div className="sx-tw">
            <table className="sx-tbl">
              <thead>
                <tr>
                  <th className="l">Xodim</th>
                  <th className="l">Hisob</th>
                  <th>Hisoblangan</th>
                  <th>JShDS {t.pit}%</th>
                  <th>Qo‘lga</th>
                  <th>Ijtimoiy {t.social}%</th>
                  <th>Ish beruvchiga jami</th>
                  <th>To‘langan</th>
                </tr>
              </thead>
              <tbody>
                {p.list.map((r, i) => (
                  <tr key={r.staffId} style={{ animationDelay: `${Math.min(i, 20) * 20}ms` }}>
                    <td className="l">
                      <b>{r.name}</b>
                    </td>
                    <td className="l">
                      <span className="code">{r.teaching ? '9130' : '9420'}</span>
                    </td>
                    <td>
                      <input
                        className={cn('sx-plain-inp !w-[120px]', r.staffId in ov && 'font-bold text-au-accent-text')}
                        type="number"
                        min={0}
                        value={r.gross}
                        onChange={(e) => setOvs({ ...ovs, [ym]: { ...ov, [r.staffId]: Math.max(0, Number(e.target.value) || 0) } })}
                      />
                    </td>
                    <td>{fmtNum(r.pit)}</td>
                    <td>
                      <b>{fmtNum(r.net)}</b>
                    </td>
                    <td>{fmtNum(r.social)}</td>
                    <td>{fmtNum(r.gross + r.social)}</td>
                    <td>{fmtNum(r.paid)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="l">Jami</td>
                  <td />
                  <td>{fmtNum(p.gross)}</td>
                  <td>{fmtNum(p.pit)}</td>
                  <td>{fmtNum(p.net)}</td>
                  <td>{fmtNum(p.social)}</td>
                  <td>{fmtNum(p.gross + p.social)}</td>
                  <td>{fmtNum(p.paid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="sx-note">
          Jurnalga: hisoblash (Dt 9130/9420 — Kt 6710), JShDS (Dt 6710 — Kt 6410), ijtimoiy soliq (Dt 9130/9420 — Kt 6520), to‘lov (Dt 6710 — Kt
          5110). O‘qituvchi, bosh o‘qituvchi va assistent — tannarx (9130), qolganlar — ma’muriy (9420). Tahrirlangan summalar faqat jurnalga
          o‘tkazishda ishlatiladi (Moliya bo‘limidagi ish haqi o‘zgarmaydi).
        </p>
      </div>
      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Soliq yuklamasi tarkibi</h3>
          <small>oylik · {t.regime === 'turn' ? 'aylanma rejim' : 'umumiy rejim'}</small>
        </div>
        <Chart
          labels={['Aylanma soliq', 'JShDS', 'Ijtimoiy soliq', 'Foyda solig‘i', 'QQS']}
          fmt={fmtMln}
          height={200}
          series={[
            {
              n: 'Summa',
              c: '#ff9f1c',
              v: [t.regime === 'turn' ? cmp.turnover : 0, p.pit, p.social, t.regime === 'gen' ? cmp.profit : 0, t.regime === 'gen' ? cmp.vat : 0],
            },
          ]}
        />
      </div>
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Soliq kalendari</h3>
          <small>buxgalter tasdiqlasin</small>
        </div>
        <div className="flex flex-col gap-2">
          {taxCalendar(ym, { pit: p.pit, social: p.social, turnover: t.regime === 'turn' ? cmp.turnover : 0 }).map((c) => (
            <div key={c.n} className="flex items-center gap-3 text-sm">
              <span className="sx-pl info tabular-nums">{c.date.split('-').reverse().join('.')}</span>
              <span className="flex-1">{c.n}</span>
              <b className="tabular-nums">{c.amount === null ? 'hisobot' : c.amount ? fmtMln(c.amount) : '—'}</b>
            </div>
          ))}
        </div>
        <p className="sx-note">Muddat va stavkalarni buxgalter hamda soliq.uz bilan tasdiqlang.</p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- FA · assets */
function FaAssets({ books, ym, today }: { books: Books; ym: string; today: string }) {
  const { run, pending } = useRun();
  const [f, setF] = useState({ name: '', category: '', cost: '', acquired: today, lifeYears: '3', journal: true });
  const rows = books.assets.map((a) => ({ a, d: depreciation(a, ym) }));
  // Balance-sheet totals only for assets still on the books at month end; the
  // month's charge also counts an asset disposed during that month.
  const tot = {
    ...rows.filter((r) => assetOnBooks(r.a, ym)).reduce((s, r) => ({ cost: s.cost + r.a.cost, acc: s.acc + r.d.accumulated, net: s.net + r.d.net }), { cost: 0, acc: 0, net: 0 }),
    ch: rows.reduce((s, r) => s + r.d.charge, 0),
  };
  const posted = books.entries.find((e) => e.source === `depr:${ym}`);
  const submit = () => {
    const cost = Number(f.cost);
    const life = Number(f.lifeYears);
    if (!f.name.trim() || !(cost > 0) || !(life >= 1)) return toast.error("Nomi, qiymati va muddatini kiriting");
    run(() => addAssetAction({ name: f.name, category: f.category, cost, acquired: f.acquired, lifeYears: life, journal: f.journal }), "Asosiy vosita qo'shildi", () =>
      setF({ ...f, name: '', category: '', cost: '' }),
    );
  };
  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat s3">
        <div className="l">Boshlang‘ich qiymat</div>
        <div className="v">{fmtMln(tot.cost)}</div>
        <div className="d">{rows.filter((r) => assetOnBooks(r.a, ym)).length} ta obyekt</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Jamg‘arilgan eskirish</div>
        <div className="v">{fmtMln(tot.acc)}</div>
        <div className="d">{tot.cost ? pct(tot.acc / tot.cost) : '—'} eskirgan</div>
      </div>
      <div className="sx-card sx-stat dark s3">
        <div className="l">Qoldiq qiymat · NBV</div>
        <div className="v">{fmtMln(tot.net)}</div>
        <div className="d">balansdagi qiymat</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Oylik amortizatsiya · {ym}</div>
        <div className="v">{fmtMln(tot.ch)}</div>
        <div className="d">
          <button
            className="sx-btn sm mt-1"
            disabled={pending}
            onClick={() => run(() => postDepreciationAction(ym), `Eskirish ${ym} jurnalga o‘tkazildi`)}
          >
            {posted ? 'Qayta o‘tkazish' : 'Jurnalga o‘tkazish'}
          </button>
        </div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Yangi obyekt</h3>
          <small>to‘g‘ri chiziqli usul · keyingi oydan boshlanadi</small>
        </div>
        <div className="sx-form">
          <label className="min-w-[200px] flex-1">
            Nomi
            <input className="sx-inp" maxLength={200} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </label>
          <label>
            Toifa
            <input className="sx-inp !w-[140px]" maxLength={80} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          </label>
          <label>
            Qiymat, so‘m
            <input className="sx-inp !w-[150px] text-right" type="number" min={0} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />
          </label>
          <label>
            Sana
            <input type="date" className="sx-inp" value={f.acquired} onChange={(e) => e.target.value && setF({ ...f, acquired: e.target.value })} />
          </label>
          <label>
            Muddat, yil
            <input className="sx-inp !w-[80px] text-right" type="number" min={1} max={50} value={f.lifeYears} onChange={(e) => setF({ ...f, lifeYears: e.target.value })} />
          </label>
          <label className="!flex-row items-center gap-2 pb-2">
            <input type="checkbox" checked={f.journal} onChange={(e) => setF({ ...f, journal: e.target.checked })} />
            Xaridni jurnalga yozish (Dt 0100 / Kt 5110)
          </label>
          <button className="sx-btn primary" disabled={pending} onClick={submit}>
            <Plus className="size-4" /> Qo‘shish
          </button>
        </div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Asosiy vositalar reyestri</h3>
          <small>inventar kartochkalari</small>
        </div>
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Vosita</th>
                <th className="l">Toifa</th>
                <th className="l">Kirim sanasi</th>
                <th>Qiymat</th>
                <th>Muddat</th>
                <th>Oylik eskirish</th>
                <th>Jamg‘arilgan</th>
                <th>Qoldiq</th>
                <th>Eskirish darajasi</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="l">
                    <div className="sx-empty">Asosiy vositalar kiritilmagan — yuqoridagi formadan nomi, qiymati va muddatini kiriting.</div>
                  </td>
                </tr>
              )}
              {rows.map(({ a, d }, i) => (
                <tr key={a.id} style={{ animationDelay: `${i * 25}ms` }}>
                  <td className="l">
                    <b>{a.name}</b>
                  </td>
                  <td className="l">{a.category}</td>
                  <td className="l">{a.acquired.split('-').reverse().join('.')}</td>
                  <td>{fmtNum(a.cost)}</td>
                  <td>{a.life_years} yil</td>
                  <td>{fmtNum(d.monthly)}</td>
                  <td>{fmtNum(d.accumulated)}</td>
                  <td>{fmtNum(d.net)}</td>
                  <td>
                    <div className="sx-hbar !h-[6px] w-[90px]">
                      <i
                        title={`${Math.round((d.monthsUsed / (a.life_years * 12)) * 100)}%`}
                        style={{
                          width: `${(d.monthsUsed / (a.life_years * 12)) * 100}%`,
                          background: d.monthsUsed / (a.life_years * 12) > 0.8 ? 'var(--au-bad)' : d.monthsUsed / (a.life_years * 12) > 0.5 ? '#ff9f1c' : 'var(--au-ink)',
                        }}
                      />
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {a.disposed ? (
                        <>
                          <span className="sx-pl mute whitespace-nowrap">Chiqarilgan {a.disposed.split('-').reverse().join('.')}</span>
                          <button
                            className="sx-btn sm"
                            disabled={pending}
                            onClick={() => run(() => disposeAssetAction({ id: a.id, date: null }), `«${a.name}» qayta tiklandi`)}
                          >
                            Qaytarish
                          </button>
                        </>
                      ) : (
                        <button
                          className="sx-btn sm whitespace-nowrap"
                          disabled={pending}
                          title="Sotilgan / yaroqsiz — eskirish to‘xtaydi, qoldiq 9430 ga hisobdan chiqariladi"
                          onClick={() => {
                            const d = window.prompt(`«${a.name}» qaysi sanada hisobdan chiqarilsin? (YYYY-MM-DD)`, today);
                            if (d == null) return;
                            if (!/^\d{4}-\d{2}-\d{2}$/.test(d.trim()) || d.trim() < a.acquired) return toast.error("Sana noto'g'ri (xarid sanasidan oldin bo'lmasin)");
                            run(() => disposeAssetAction({ id: a.id, date: d.trim() }), `«${a.name}» hisobdan chiqarildi`);
                          }}
                        >
                          Chiqarish
                        </button>
                      )}
                      <button
                        className="sx-btn sm text-au-bad"
                        disabled={pending}
                        onClick={() => window.confirm(`«${a.name}» butunlay o'chirilsinmi? Xarid va eskirish yozuvlari ham qayta hisoblanadi.`) && run(() => deleteAssetAction(a.id), "Vosita o'chirildi")}
                        aria-label="O'chirish"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {books.assets.length > 0 && <NbvForecast books={books} ym={ym} />}
    </div>
  );
}

/** Net book value by category, 12 months back to 24 ahead (quarterly). */
function NbvForecast({ books, ym }: { books: Books; ym: string }) {
  const months = Array.from({ length: 13 }, (_, i) => addMonths(ym, -12 + i * 3));
  const series = nbvByCategory(books.assets, months);
  const pal = ['#2477c9', '#ff9f1c', '#0ea5a4', '#7a5af8', '#e8567a', '#139a52'];
  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Qoldiq qiymat prognozi</h3>
        <small>NBV · toifalar bo‘yicha · har chorak</small>
      </div>
      <Chart
        labels={months.map((m) => `${m.slice(5)}.${m.slice(2, 4)}`)}
        fmt={fmtMln}
        height={230}
        series={series.map((x, i) => ({ n: x.category, c: pal[i % pal.length], v: x.values, kind: 'line' as const }))}
      />
    </div>
  );
}
