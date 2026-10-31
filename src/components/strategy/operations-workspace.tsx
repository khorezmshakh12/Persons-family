'use client';

import { useEffect, useRef, useState } from 'react';
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
  /** May take a wrong minus off a student's balance (CEO, COO, Office Manager). */
  canFixBalance: boolean;
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
  { v: 'ov', n: 'Statistika', Icon: BarChart3 },
  { v: 'stu', n: 'O‘quvchilar', Icon: Users },
  { v: 'pay', n: 'To‘lovlar', Icon: Wallet },
  { v: 'sales', n: 'Sales', Icon: KanbanSquare },
];
const KEY = 'persons-ops-tab';
// Sales manager: no Statistika / To'lovlar (owner, 2026-10-31). Module-level so the reference is stable.
const SALES_TABS = TABS.filter((t) => t.v !== 'ov' && t.v !== 'pay');

export function OperationsWorkspace({ data }: { data: OpsData }) {
  const tabs = data.money ? TABS : SALES_TABS;
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
    ...data.sales.leads.map((l) => ({ g: 'Lidlar', t: l.name || l.phone, sub: l.phone, run: () => lead(l.id) })),
    ...data.students.rows.map((s) => ({ g: 'O‘quvchilar', t: s.name, sub: s.phone, run: () => go('stu') })),
  ];
  return (
    <SuiteShell section="ops" tabs={tabs} onTab={go} items={items}>
      <div className="px-4 sm:px-7">
        <SectionHead
          crumb="Operatsiya HQ · o‘quvchilar, to‘lovlar, sotuv, statistika"
          title="Operatsiya"
          em="HQ"
          pill={`${data.money ? `${data.students.rows.filter((s) => s.active).length} faol o‘quvchi · ` : ''}${data.sales.leads.filter((l) => !l.studentId && !l.lostReason).length} ochiq lid`}
        />
        <SuiteTabs tabs={tabs} value={tab} onChange={(v) => { playSound('nav'); go(v); }} />
      </div>
      <section className="px-4 pb-10 sm:px-7">
        <div key={tab} className="sx-fade">
          {tab === 'ov' && data.money && <OpsStats data={data} />}
          {tab === 'stu' && <OpsStudents data={data} />}
          {tab === 'pay' && data.money && <OpsPayments data={data} />}
          {tab === 'sales' && <OpsSales data={data} openId={openLead} onOpenChange={setOpenLead} />}
        </div>
      </section>
    </SuiteShell>
  );
}
