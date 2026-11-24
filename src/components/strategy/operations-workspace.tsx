'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3, KanbanSquare, Users, Wallet } from 'lucide-react';
import { SectionHead, SuiteShell, SuiteTabs, playSound, type PaletteItem } from './suite-shell';
import type { StudentsData } from '@/lib/ops-students';
import type { OpsStatsData } from '@/lib/ops-stats';
import type { SalesData } from '@/lib/ops-sales';
import { OpsStudents } from './ops-students';
import { OpsStats } from './ops-stats';
import { OpsPayments } from './ops-payments';
import { OpsSales } from './ops-sales';
import './strategy.css';
import './suite.css';

export type OpsData = {
  meId: string;
  canEdit: boolean;
  /** Sees money figures (Statistika, To'lovlar, kassa). False for the Sales manager. */
  money: boolean;
  /** Statistika: student and lead figures (operations.stats). */
  statsPeople: boolean;
  /** Statistika: money figures (operations.statsMoney, CEO by default). */
  statsMoney: boolean;
  /** May take a wrong minus off a student's balance (CEO, COO, Office Manager). */
  canFixBalance: boolean;
  /** May cancel a charge older than 60 days (CEO). */
  canCancelOldCharge: boolean;
  today: { day: string };
  /** O'quvchilar: every CRM student with billing, grade, log, templates and stats. */
  students: StudentsData;
  /** Statistika: kunlik, haftalik, oylik. */
  stats: OpsStatsData;
  /** Sales: the CRM leads as a kanban. */
  sales: SalesData;
};

// Operation HQ (2026-10-23): Statistika (kunlik · haftalik · oylik), O'quvchilar, To'lovlar (2026-10-28), Sales.
type Tab = 'ov' | 'stu' | 'pay' | 'sales';
const TABS: { v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { v: 'ov', n: 'tOv', Icon: BarChart3 },
  { v: 'stu', n: 'tStu', Icon: Users },
  { v: 'pay', n: 'tPay', Icon: Wallet },
  { v: 'sales', n: 'tSales', Icon: KanbanSquare },
];
const KEY = 'persons-ops-tab';
// Module-level so each reference is stable: Statistika follows the two
// Section access functions, To'lovlar the money gate (Sales manager has neither).
const TAB_SETS = new Map<string, typeof TABS>();
const tabsFor = (stats: boolean, pay: boolean) => {
  const k = `${stats}:${pay}`;
  if (!TAB_SETS.has(k)) TAB_SETS.set(k, TABS.filter((t) => (t.v !== 'ov' || stats) && (t.v !== 'pay' || pay)));
  return TAB_SETS.get(k)!;
};

export function OperationsWorkspace({ data }: { data: OpsData }) {
  const tw = useTranslations('ops.ws');
  const keyTabs = tabsFor(data.statsPeople || data.statsMoney, data.money);
  const tabs = useMemo(() => keyTabs.map((x) => ({ ...x, n: tw(x.n) })), [keyTabs, tw]);
  const [tab, setTab] = useState<Tab>(tabs[0].v);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const v = localStorage.getItem(KEY) as Tab | null;
      if (v && tabs.some((t) => t.v === v)) setTab(v);
    } catch {}
  }, [tabs]);
  const go = (v: string) => {
    setTab(v as Tab);
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  };
  // 1–4 switch tabs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < tabs.length) {
        playSound('nav');
        go(tabs[i].v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabs]);
  const lead = (id: string) => {
    setOpenLead(id);
    go('sales');
  };
  const items: PaletteItem[] = [
    ...data.sales.leads.map((l) => ({ g: tw('gLeads'), t: l.name || l.phone, sub: l.phone, run: () => lead(l.id) })),
    ...data.students.rows.map((s) => ({ g: tw('gStudents'), t: s.name, sub: s.phone, run: () => go('stu') })),
  ];
  return (
    <SuiteShell section="ops" tabs={tabs} onTab={go} items={items}>
      <div className="px-4 sm:px-7">
        <SectionHead
          crumb={tw('crumb')}
          title={tw('title')}
          em="HQ"
          pill={`${data.money ? tw('activeStu', { n: data.students.rows.filter((s) => s.active || s.status === 'frozen').length }) : ''}${tw('openLeads', { n: data.sales.leads.filter((l) => !l.studentId && !l.lostReason).length })}`}
        />
        <SuiteTabs tabs={tabs} value={tab} onChange={(v) => { playSound('nav'); go(v); }} />
      </div>
      <section className="px-4 pb-10 sm:px-7">
        <div key={tab} className="sx-fade">
          {tab === 'ov' && (data.statsPeople || data.statsMoney) && <OpsStats data={data} />}
          {tab === 'stu' && <OpsStudents data={data} />}
          {tab === 'pay' && data.money && <OpsPayments data={data} />}
          {tab === 'sales' && <OpsSales data={data} openId={openLead} onOpenChange={setOpenLead} />}
        </div>
      </section>
    </SuiteShell>
  );
}
