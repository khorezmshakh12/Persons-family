'use client';

import { useEffect, useRef, useState } from 'react';
import { BarChart3, Users } from 'lucide-react';
import { SectionHead, SuiteShell, SuiteTabs, playSound, type PaletteItem } from './suite-shell';
import type { StudentsData } from '@/lib/ops-students';
import type { OpsStatsData } from '@/lib/ops-stats';
import { OpsStudents } from './ops-students';
import { OpsStats } from './ops-stats';
import './strategy.css';
import './suite.css';

export type OpsData = {
  meId: string;
  canEdit: boolean;
  today: { day: string };
  /** O'quvchilar: every CRM student with billing, grade, log, templates and stats. */
  students: StudentsData;
  /** Statistika: kunlik, haftalik, oylik. */
  stats: OpsStatsData;
};

// Operation HQ (2026-10-23): Statistika (kunlik · haftalik · oylik) and O'quvchilar.
type Tab = 'ov' | 'stu';
const TABS: { v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { v: 'ov', n: 'Statistika', Icon: BarChart3 },
  { v: 'stu', n: 'O‘quvchilar', Icon: Users },
];
const KEY = 'persons-ops-tab';

export function OperationsWorkspace({ data }: { data: OpsData }) {
  const [tab, setTab] = useState<Tab>('ov');
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
  // 1–2 switch tabs.
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
  const items: PaletteItem[] = [
    ...data.students.rows.map((s) => ({ g: 'O‘quvchilar', t: s.name, sub: s.phone, run: () => go('stu') })),
  ];
  return (
    <SuiteShell section="ops" tabs={TABS} onTab={go} items={items}>
      <div className="px-4 sm:px-7">
        <SectionHead
          crumb="Operatsiya HQ · o‘quvchilar, to‘lovlar, statistika"
          title="Operatsiya"
          em="HQ"
          pill={`${data.students.rows.filter((s) => s.active).length} faol o‘quvchi`}
        />
        <SuiteTabs tabs={TABS} value={tab} onChange={(v) => { playSound('nav'); go(v); }} />
      </div>
      <section className="px-4 pb-10 sm:px-7">
        <div key={tab} className="sx-fade">
          {tab === 'ov' && <OpsStats data={data} />}
          {tab === 'stu' && <OpsStudents data={data} />}
        </div>
      </section>
    </SuiteShell>
  );
}
