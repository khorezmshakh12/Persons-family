'use client';

import type { Books } from '@/lib/accounting-data';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Building2, ChartColumn, Coins, FileText, Percent, Rows3, SlidersHorizontal, Wallet, Lock } from 'lucide-react';
import { AccountingClose } from './accounting-close';
import { fmtNum, monthEnd, monthStart, statements } from '@/lib/accounting';
import { SectionHead, SuiteShell, SuiteTabs, playSound, type PaletteItem } from './suite-shell';
import { MonthPicker } from './view-finance';
import { MaBudget, MaCost, MaSim } from './accounting-analysis';
import { MaCash } from './accounting-cash';
import { FaAssets, FaJournal, FaLedger, FaReports, FaTax } from './accounting-books';
import './strategy.css';
import './suite.css';

type Tab = 'ma_cost' | 'ma_bud' | 'ma_sim' | 'ma_cash' | 'fa_jr' | 'fa_gl' | 'fa_rep' | 'fa_tax' | 'fa_fa' | 'fa_close';
const TABS: ({ v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> } | { g: string })[] = [
  // Owner, 2026-10-05: tailored to an education centre — the everyday
  // money in/out and the reports first, analysis next, bookkeeping last.
  { g: 'Kundalik' },
  { v: 'ma_cash', n: 'Kirim-chiqim', Icon: Coins },
  { v: 'fa_rep', n: 'Hisobotlar', Icon: FileText },
  { g: 'Tahlil' },
  { v: 'ma_cost', n: 'Kurslar va marja', Icon: ChartColumn },
  { v: 'ma_bud', n: 'Reja vs fakt', Icon: Rows3 },
  { v: 'ma_sim', n: 'Ssenariy', Icon: SlidersHorizontal },
  { g: 'Buxgalteriya' },
  { v: 'fa_tax', n: 'Soliq & ish haqi', Icon: Percent },
  { v: 'fa_fa', n: 'Jihozlar (asosiy vositalar)', Icon: Building2 },
  { v: 'fa_jr', n: 'Jurnal', Icon: BookOpen },
  { v: 'fa_gl', n: 'Aylanma va qoldiqlar', Icon: Wallet },
  { v: 'fa_close', n: 'Oy yopish', Icon: Lock },
];
const FLAT = TABS.filter((t): t is { v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> } => 'v' in t);
const KEY = 'persons-acct-tab';

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
  const [tab, setTab] = useState<Tab>('ma_cash');
  const [ym, setYm] = useState(today.slice(0, 7));
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      // ?tab=… (Ctrl+K action / a link) wins over the remembered tab.
      const v = (new URLSearchParams(window.location.search).get('tab') ?? localStorage.getItem(KEY)) as Tab | null;
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
    { g: 'Amallar', t: 'Kirim / chiqim qo‘shish', run: () => go('ma_cash') },
    { g: 'Amallar', t: "Jurnalga yozuv qo'shish", run: () => go('fa_jr') },
    { g: 'Amallar', t: "Ish haqini jurnalga o'tkazish", run: () => go('fa_tax') },
    { g: 'Amallar', t: 'Eskirishni hisoblash', run: () => go('fa_fa') },
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
      </div>
      <section className="px-4 pb-10 sm:px-7">
        <div key={tab} className="sx-fade">
          {tab === 'ma_cost' && <MaCost books={books} ym={ym} courseGroups={courseGroups} />}
          {tab === 'ma_bud' && <MaBudget books={books} ym={ym} />}
          {tab === 'ma_sim' && <MaSim books={books} ym={ym} seatCap={seatCap} />}
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
