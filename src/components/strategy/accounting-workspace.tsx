'use client';

import type { Books } from '@/lib/accounting-data';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Building2, ChartColumn, Coins, FileText, LayoutDashboard, Percent, Wallet, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AccountingClose } from './accounting-close';
import { fmtNum, monthEnd, monthStart, statements } from '@/lib/accounting';
import { SectionHead, SuiteShell, SuiteTabs, playSound, type PaletteItem } from './suite-shell';
import { MonthPicker } from './view-finance';
import { MaBudget, MaCost, MaSim } from './accounting-analysis';
import { MaCash } from './accounting-cash';
import { FaAssets, FaJournal, FaLedger, FaReports, FaTax } from './accounting-books';
import { AccountingOverview } from './accounting-overview';
import './strategy.css';
import './suite.css';

/* Hisob-kitob (v8-B, 2026-10-10): Umumiy first, the everyday cash book and
 * reports next, the three analysis views folded into one "Tahlil" tab, and
 * the bookkeeping tools grouped last as the advanced part. */
type Tab = 'ov' | 'ma_cash' | 'fa_rep' | 'an' | 'fa_tax' | 'fa_fa' | 'fa_jr' | 'fa_gl' | 'fa_close';
type Sub = 'ma_cost' | 'ma_bud' | 'ma_sim';
const TABS: ({ v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> } | { g: string })[] = [
  { g: 'Kundalik' },
  { v: 'ov', n: 'Umumiy', Icon: LayoutDashboard },
  { v: 'ma_cash', n: 'Kirim-chiqim', Icon: Coins },
  { v: 'fa_rep', n: 'Hisobotlar', Icon: FileText },
  { v: 'an', n: 'Tahlil', Icon: ChartColumn },
  { g: 'Buxgalteriya · kengaytirilgan' },
  { v: 'fa_tax', n: 'Soliq & ish haqi', Icon: Percent },
  { v: 'fa_fa', n: 'Jihozlar (asosiy vositalar)', Icon: Building2 },
  { v: 'fa_jr', n: 'Jurnal', Icon: BookOpen },
  { v: 'fa_gl', n: 'Aylanma va qoldiqlar', Icon: Wallet },
  { v: 'fa_close', n: 'Oy yopish', Icon: Lock },
];
const FLAT = TABS.filter((t): t is { v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> } => 'v' in t);
const SUBS: { v: Sub; n: string; hint: string }[] = [
  { v: 'ma_cost', n: 'Kurslar va marja', hint: 'qaysi kurs qancha foyda keltiradi' },
  { v: 'ma_bud', n: 'Reja vs fakt', hint: 'oy rejasi va haqiqiy xarajat' },
  { v: 'ma_sim', n: 'Ssenariy', hint: '«agar narx / o‘quvchi o‘zgarsa…»' },
];
const KEY = 'persons-acct-tab';
const SUB_KEY = 'persons-acct-sub';

export function AccountingWorkspace({
  books,
  today,
  courseGroups,
  seatCap = 0,
}: {
  books: Books;
  today: string;
  /** Real groups per course_name — suggests the course list. */
  courseGroups: { course: string; groups: number }[];
  /** Timetable seat capacity (rooms × slots × cohorts), 0 = unknown. */
  seatCap?: number;
}) {
  const [tab, setTab] = useState<Tab>('ov');
  const [sub, setSub] = useState<Sub>('ma_cost');
  const [ym, setYm] = useState(today.slice(0, 7));
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      // ?tab=… (Ctrl+K action / a link) wins over the remembered tab. The
      // old analysis tab ids still work and open the matching Tahlil view.
      const v = new URLSearchParams(window.location.search).get('tab') ?? localStorage.getItem(KEY);
      const s = localStorage.getItem(SUB_KEY);
      if (v && SUBS.some((x) => x.v === v)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of per-device preferences
        setTab('an');
        setSub(v as Sub);
      } else if (v && FLAT.some((t) => t.v === v)) setTab(v as Tab);
      if (s && SUBS.some((x) => x.v === s) && !(v && SUBS.some((x) => x.v === v))) setSub(s as Sub);
    } catch {}
  }, []);
  const go = (v: string) => {
    if (SUBS.some((x) => x.v === v)) {
      setSub(v as Sub);
      v = 'an';
    }
    setTab(v as Tab);
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  };
  const pickSub = (v: Sub) => {
    setSub(v);
    try {
      localStorage.setItem(SUB_KEY, v);
    } catch {}
  };
  const st = useMemo(() => statements(books.accounts, books.opening, books.entries, monthStart(ym), monthEnd(ym)), [books, ym]);
  const items: PaletteItem[] = [
    { g: 'Amallar', t: 'Kirim / chiqim qo‘shish', run: () => go('ma_cash') },
    { g: 'Amallar', t: "Jurnalga yozuv qo'shish", run: () => go('fa_jr') },
    { g: 'Amallar', t: "Ish haqini jurnalga o'tkazish", run: () => go('fa_tax') },
    { g: 'Amallar', t: 'Eskirishni hisoblash', run: () => go('fa_fa') },
    { g: 'Amallar', t: 'Oyni yopish', run: () => go('fa_close') },
    ...SUBS.map((x) => ({ g: 'Tahlil', t: x.n, run: () => go(x.v) })),
    ...books.accounts.map((a) => ({ g: 'Hisoblar', t: a.name, run: () => go('fa_gl') })),
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
        {tab === 'an' && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-au-line bg-au-card-2 p-1">
              {SUBS.map((x) => (
                <button key={x.v} className={cn('sx-chipb !border-0', sub === x.v && 'on')} onClick={() => pickSub(x.v)}>
                  {x.n}
                </button>
              ))}
            </div>
            <span className="text-xs text-au-muted">{SUBS.find((x) => x.v === sub)?.hint}</span>
          </div>
        )}
      </div>
      <section className="px-4 pb-10 sm:px-7">
        <div key={tab === 'an' ? sub : tab} className="sx-fade">
          {tab === 'ov' && <AccountingOverview books={books} ym={ym} today={today} go={go} />}
          {tab === 'an' && sub === 'ma_cost' && <MaCost books={books} ym={ym} courseGroups={courseGroups} />}
          {tab === 'an' && sub === 'ma_bud' && <MaBudget books={books} ym={ym} />}
          {tab === 'an' && sub === 'ma_sim' && <MaSim books={books} ym={ym} seatCap={seatCap} />}
          {tab === 'ma_cash' && <MaCash books={books} today={today} ym={ym} />}
          {tab === 'fa_jr' && <FaJournal books={books} ym={ym} today={today} />}
          {tab === 'fa_gl' && <FaLedger books={books} ym={ym} />}
          {tab === 'fa_rep' && <FaReports books={books} ym={ym} />}
          {tab === 'fa_tax' && <FaTax books={books} ym={ym} />}
          {tab === 'fa_fa' && <FaAssets books={books} ym={ym} today={today} />}
          {tab === 'fa_close' && <AccountingClose ym={ym} />}
        </div>
      </section>
    </SuiteShell>
  );
}
