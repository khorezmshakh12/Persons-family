'use client';

import { useEffect, useRef, useState } from 'react';
import { KanbanSquare, LayoutDashboard, Users } from 'lucide-react';
import { SectionHead, SuiteShell, SuiteTabs, playSound, type PaletteItem } from './suite-shell';
import type { StudentsData } from '@/lib/ops-students';
import type { SalesData } from '@/lib/ops-sales';
import { OpsStudents } from './ops-students';
import { OpsSales } from './ops-sales';
import { TodayWork } from './ops-today-work';
import './strategy.css';
import './suite.css';

export type OpsData = {
  meId: string;
  canEdit: boolean;
  today: { day: string };
  /** O'quvchilar: every CRM student with billing, grade, log, templates and stats. */
  students: StudentsData;
  /** Sales: the CRM leads as a kanban. */
  sales: SalesData;
};

// Operation HQ (2026-10-22): Bugun (today's work), O'quvchilar, Sales.
type Tab = 'ov' | 'stu' | 'sales';
const TABS: { v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { v: 'ov', n: 'Bugun', Icon: LayoutDashboard },
  { v: 'stu', n: 'O‘quvchilar', Icon: Users },
  { v: 'sales', n: 'Sales', Icon: KanbanSquare },
];
const KEY = 'persons-ops-tab';

export function OperationsWorkspace({ data }: { data: OpsData }) {
  const [tab, setTab] = useState<Tab>('ov');
  const [openLead, setOpenLead] = useState<string | null>(null);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const v = localStorage.getItem(KEY) as Tab | null;
      if (v && TABS.some((t) => t.v === v)) setTab(v);
    } catch {}
  }, []);
  const go = (v: string) => {
    setTab(v as Tab);
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  };
  // 1–3 switch tabs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < TABS.length) {
        playSound('nav');
        go(TABS[i].v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const lead = (id: string) => {
    setOpenLead(id);
    go('sales');
  };
  const items: PaletteItem[] = [
    ...data.sales.leads.map((l) => ({ g: 'Lidlar', t: l.name || l.phone, sub: l.phone, run: () => lead(l.id) })),
    ...data.students.rows.map((s) => ({ g: 'O‘quvchilar', t: s.name, sub: s.phone, run: () => go('stu') })),
  ];
  const openLeads = data.sales.leads.filter((l) => !l.studentId && !l.lostReason).length;
  return (
    <SuiteShell section="ops" tabs={TABS} onTab={go} items={items}>
      <div className="px-4 sm:px-7">
        <SectionHead
          crumb="Operatsiya HQ · o‘quvchilar, to‘lovlar, sotuv"
          title="Operatsiya"
          em="HQ"
          pill={`${data.students.rows.filter((s) => s.status !== 'archived').length} o‘quvchi · ${openLeads} ochiq lid`}
        />
        <SuiteTabs tabs={TABS} value={tab} onChange={(v) => { playSound('nav'); go(v); }} />
      </div>
      <section className="px-4 pb-10 sm:px-7">
        <div key={tab} className="sx-fade">
          {tab === 'ov' && <TodayWork data={data} onTab={go} onLead={lead} />}
          {tab === 'stu' && <OpsStudents data={data} />}
          {tab === 'sales' && <OpsSales data={data} openId={openLead} onOpenChange={setOpenLead} />}
        </div>
      </section>
    </SuiteShell>
  );
}
