'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, Gauge, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHead, SuiteShell, SuiteTabs, playSound, type PaletteItem } from './suite-shell';
import type { OpsPlan } from '@/lib/ops-plan';
import { RoomRegister, SlotModal, buildModel, type Cell, type Cohort, type OpsModel } from './operations-plan';
import { SlotFinderBar, UnscheduledGroups, usePlaceGroup, type Finder } from './operations-extras';
import { ScheduleTimeline, type TimelineMode } from './ops-schedule-timeline';
import { CapacityDemand, OpsOverview, TeachersOps } from './ops-hq';
import { TodayOps } from './ops-today';
import { OpsCalendar } from './ops-calendar';
import { GroupProfit, SeatShowcase } from './ops-money';
import './strategy.css';
import './suite.css';

export type OpsData = {
  groups: { id: string; name: string; course: string; schedule_type: 'odd' | 'even' | null; time: string; room: string; teacher: string; enrolled: number | null; teacher_id: string | null; duration: number }[];
  /** CRM leads (crm_leads) — only what demand needs: when, and for which course. */
  leads: { id: string; course: string; created_at: string }[];
  staff: { id: string; name: string; role: string }[];
  rooms: { code: string; title: string; capacity: number; note: string; features?: string[] }[];
  holds: { id: string; room: string; time: string; cohort: 'odd' | 'even'; kind: 'trial' | 'buffer'; title: string }[];
  plan: OpsPlan;
  availability: { teacher_id: string; cohort: 'odd' | 'even'; start: string; end: string }[];
  log: { id: string; group_id: string; group_name: string; before: LogPlace; after: LogPlace; at: string; actor: string }[];
  meId: string;
  canEdit: boolean;
  /** CRM money per schedule group matched by name (this month). */
  money: { groupId: string; students: number; expected: number; paid: number }[];
  /** Teacher monthly salaries — only for viewers allowed to see pay. */
  salaries: Record<string, number> | null;
  calendar: { id: string; day: string; kind: 'holiday' | 'exam' | 'makeup' | 'event'; title: string; group_id: string | null; time: string | null; room: string | null }[];
  /** Bugun: today's cohort, HR › Davomat marks and substitutes. */
  today: {
    day: string;
    cohort: 'odd' | 'even' | null;
    attendance: { profile_id: string; status: 'office' | 'late' | 'remote' | 'left' | 'absent'; check_in: string }[];
    subs: { group_id: string; teacher_id: string }[];
    teacherIds: string[];
  };
};
export type LogPlace = { room: string | null; time: string | null; cohort: 'odd' | 'even' | null; duration: number };

// Operation HQ v3 (2026-10-22): three tabs, Bugun first. Leads live in CRM, the growth plan
// in the Strategy forecast; teacher load sits under Jadval › O'qituvchilar.
type Tab = 'ov' | 'sched' | 'cap';
const TABS: { v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { v: 'ov', n: 'Bugun', Icon: LayoutDashboard },
  { v: 'sched', n: 'Jadval', Icon: CalendarRange },
  { v: 'cap', n: 'Xonalar va quvvat', Icon: Gauge },
];
const KEY = 'persons-ops-tab';

export function OperationsWorkspace({ data, crm }: { data: OpsData; crm?: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>('ov');
  const [cohort, setCohort] = useState<Cohort>('odd');
  const [mode, setMode] = useState<TimelineMode>('room');
  const [focus, setFocus] = useState<string | null>(null);
  const m = useMemo(() => buildModel(data), [data]);
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
  // From the overview: open the schedule on the right cohort, focused on a group.
  const goGroup = (v: string, groupId?: string) => {
    const g = groupId ? data.groups.find((x) => x.id === groupId) : null;
    if (g?.schedule_type) setCohort(g.schedule_type);
    setFocus(groupId ?? null);
    setMode('room');
    go(v);
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
  const scheduled = data.groups.filter((g) => g.room && g.time && g.schedule_type);
  const items: PaletteItem[] = [
    { g: 'Amallar', t: 'O‘qituvchilar yuklamasi', run: () => { setMode('teacher'); go('sched'); } },
    ...data.groups.map((g) => ({ g: 'Guruhlar', t: g.name, sub: [g.room, g.time].filter(Boolean).join(' · '), run: () => go('cap') })),
  ];
  return (
    <SuiteShell section="ops" tabs={TABS} onTab={go} items={items}>
      <div className="px-4 sm:px-7">
        <SectionHead
          crumb="Operatsiya HQ · jadval, xonalar, o‘qituvchilar"
          title="Operatsiya"
          em="HQ"
          pill={`${data.groups.length} guruh · ${scheduled.length} tasi jadvalda`}
        />
        <SuiteTabs tabs={TABS} value={tab} onChange={(v) => { playSound('nav'); go(v); }} />
      </div>
      <section className="px-4 pb-10 sm:px-7">
        <div key={tab} className="sx-fade">
          {tab === 'ov' && (
            <div className="flex flex-col gap-[18px]">
              <TodayOps data={data} capOf={m.cap} rooms={m.rooms} />
              {crm}
              <OpsOverview data={data} capOf={m.cap} rooms={m.rooms} onGo={goGroup} />
              <div className="sx-grid">
                <OpsCalendar data={data} />
              </div>
            </div>
          )}
          {tab === 'sched' && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="sx-seg">
                {(['odd', 'even'] as Cohort[]).map((c) => (
                  <button key={c} className={cn(cohort === c && 'on')} onClick={() => setCohort(c)}>
                    {c === 'odd' ? 'Toq kunlar · Du-Chor-Ju' : 'Juft kunlar · Se-Pay-Sha'}
                  </button>
                ))}
              </div>
              <div className="sx-seg">
                {(
                  [
                    ['room', 'Xonalar'],
                    ['teacher', 'O‘qituvchilar'],
                    ['course', 'Kurslar'],
                  ] as [TimelineMode, string][]
                ).map(([k, n]) => (
                  <button key={k} className={cn(mode === k && 'on')} onClick={() => setMode(k)}>
                    {n}
                  </button>
                ))}
              </div>
              <small className="text-xs text-au-faint">Sudrang · 15 daqiqaga yopishadi · D — qoralama · Ctrl+Z — bekor qilish</small>
            </div>
          )}
          {tab === 'sched' && (
            <div className="flex flex-col gap-[18px]">
              <ScheduleTimeline data={data} capOf={m.cap} cohort={cohort} mode={mode} focusId={focus} readOnlyRows={mode !== 'room'} />
              {mode === 'teacher' && <TeachersOps data={data} cohort={cohort} />}
            </div>
          )}
          {tab === 'cap' && (
            <div className="flex flex-col gap-[18px]">
              <CapacityDemand data={data} capOf={m.cap} rooms={m.rooms} />
              <div className="sx-grid">
                <SeatShowcase data={data} capOf={m.cap} />
                <GroupProfit data={data} capOf={m.cap} />
              </div>
              <Rooms data={data} m={m} />
            </div>
          )}
        </div>
      </section>
    </SuiteShell>
  );
}

/* ------------------------------------------------------------------- rooms */
const isIelts = (g: OpsData['groups'][number]) => /ielts/i.test(`${g.course} ${g.name}`);
function Rooms({ data, m }: { data: OpsData; m: OpsModel }) {
  const { groups, holds } = data;
  const [coh, setCoh] = useState<Cohort>('odd');
  const [roomF, setRoomF] = useState('all');
  const [open, setOpen] = useState<{ room: string; time: string } | null>(null);
  const [finder, setFinder] = useState<Finder | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const { place, busy: placing } = usePlaceGroup();
  const ok = groups.filter((g) => g.room && g.time && g.schedule_type);
  const { rooms, times } = m;
  const shown = roomF === 'all' ? rooms : rooms.filter((r) => r === roomF);
  const info = (r: string) => data.rooms.find((x) => x.code === r);
  const cellOf = (room: string, time: string): Cell => {
    const gs = ok.filter((g) => g.room === room && g.time === time && g.schedule_type === coh);
    if (gs.length) return { kind: 'group', g: gs[0], clash: gs.length };
    const h = holds.find((x) => x.room === room && x.time === time && x.cohort === coh);
    return h ? { kind: 'hold', h } : { kind: 'free' };
  };
  const cells = rooms.flatMap((r) => times.map((t) => cellOf(r, t)));
  const gCells = cells.filter((c) => c.kind === 'group');
  const cohGroups = ok.filter((g) => g.schedule_type === coh);
  const trials = holds.filter((h) => h.cohort === coh && h.kind === 'trial').length;
  const buffers = holds.filter((h) => h.cohort === coh && h.kind === 'buffer').length;
  const free = cells.filter((c) => c.kind === 'free').length;
  const util = cells.length ? (gCells.length / cells.length) * 100 : 0;
  const counted = cohGroups.filter((g) => g.enrolled != null);
  const seats = counted.reduce((a, g) => a + (g.enrolled ?? 0), 0);
  const clashes = cells.filter((c) => c.kind === 'group' && c.clash > 1).length;
  const missing = groups.filter((g) => !(g.room && g.time && g.schedule_type));
  const load = (t: string) => rooms.filter((r) => cellOf(r, t).kind === 'group').length;
  const peakN = Math.max(0, ...times.map(load));
  const C = 2 * Math.PI * 42;
  const cohName = coh === 'odd' ? 'Toq kunlar' : 'Juft kunlar';
  const cls = (c: Cell) => (c.kind === 'group' ? (isIelts(c.g) ? 'ie' : 'gr') : c.kind === 'hold' ? (c.h.kind === 'trial' ? 'tr' : 'bf') : '');
  const sel = open ? cellOf(open.room, open.time) : null;
  // Free-slot finder: free cells at the chosen time with enough seats.
  const isMatch = (r: string, t: string) =>
    !!finder && cellOf(r, t).kind === 'free' && (!finder.time || finder.time === t) && m.cap(r) >= finder.minCap;
  const matchCount = finder ? shown.reduce((a, r) => a + times.filter((t) => isMatch(r, t)).length, 0) : 0;
  return (
    <div className="sx-grid">
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Quvvat bandligi</h3>
          <small>{cohName} · guruh slotlari / jami slotlar</small>
        </div>
        <div className="sx-gauge">
          <svg viewBox="0 0 100 100" width={150} height={150}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--au-card-2)" strokeWidth="9" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--au-ink)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(util / 100) * C} ${C}`} />
          </svg>
          <div className="c">
            <b>{cells.length ? `${util.toFixed(1)}%` : '—'}</b>
            <small>bandlik</small>
          </div>
        </div>
        <div className="text-center">
          <span className={cn('sx-pl', util <= 85 ? 'ok' : 'warn')}>{util <= 85 ? 'Lean optimal · Kingman xavfsiz zonasi' : 'Yuqori yuklama · navbat xavfi (>85%)'}</span>
          <p className="mt-2 text-xs text-au-muted">
            {buffers} bufer slot zaxirada · {free} katak bo‘sh{clashes ? ` · ${clashes} to‘qnashuv` : ''}
          </p>
        </div>
      </div>
      <div className="s8 grid grid-cols-2 gap-[18px] lg:grid-cols-4">
        <div className="sx-card sx-stat dark">
          <div className="l">Faol guruhlar</div>
          <div className="v">{cohGroups.length}</div>
          <div className="d">{counted.length ? `${seats} o‘rin band · o‘rtacha ${(seats / counted.length).toFixed(1)} o‘q.` : 'o‘quvchi soni kiritilmagan'}</div>
        </div>
        <div className="sx-card sx-stat">
          <div className="l">Nazariy maksimum</div>
          <div className="v">{m.maxSeats}</div>
          <div className="d">{rooms.length * times.length * 2} guruh sloti × sig‘im (2 kohorta)</div>
        </div>
        <div className="sx-card sx-stat">
          <div className="l">Sinov darslari</div>
          <div className="v">{trials}</div>
          <div className="d">trial slotlar · sotuv bilan</div>
        </div>
        <div className="sx-card sx-stat">
          <div className="l">Lean bufer</div>
          <div className="v">{buffers}</div>
          <div className="d">makeup, klub, audit, zaxira</div>
        </div>
        <div className="sx-card col-span-2 lg:col-span-4">
          <div className="sx-h">
            <h3>Xonalar kesimida bandlik</h3>
            <small>{cohName}</small>
          </div>
          {rooms.length === 0 ? (
            <div className="sx-empty">—</div>
          ) : (
            rooms.map((r) => {
              const g = times.filter((t) => cellOf(r, t).kind === 'group').length;
              const p = times.length ? (g / times.length) * 100 : 0;
              return (
                <div key={r} className="sx-rmr">
                  <span className="truncate">{info(r)?.title || r}</span>
                  <div className="sx-hb">
                    <i style={{ width: `${p}%`, background: p >= 85 ? 'var(--au-accent)' : 'var(--au-ink)' }} />
                  </div>
                  <b>
                    {g}/{times.length}
                  </b>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Darslar matritsasi</h3>
          <small>
            {rooms.length} auditoriya × {times.length} slot{times.length ? ` · ${times[0]}–${times[times.length - 1]}` : ''}
          </small>
          <span className="sp" />
          <div className="sx-seg">
            <button className={cn(coh === 'odd' && 'on')} onClick={() => setCoh('odd')}>
              Toq kunlar · Du-Chor-Ju
            </button>
            <button className={cn(coh === 'even' && 'on')} onClick={() => setCoh('even')}>
              Juft kunlar · Se-Pay-Sha
            </button>
          </div>
          <select className="sx-inp !h-[32px] !w-[200px]" value={roomF} onChange={(e) => setRoomF(e.target.value)} aria-label="Xona filtri">
            <option value="all">Barcha xonalar ({rooms.length})</option>
            {rooms.map((r) => (
              <option key={r} value={r}>
                {info(r)?.title ? `${info(r)?.title} (${r})` : r}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-3">
          <SlotFinderBar times={times} value={finder} onChange={setFinder} matches={matchCount} />
        </div>
        {picked && (
          <p className="mb-3 rounded-lg bg-au-accent-soft px-3 py-2 text-sm font-semibold text-au-accent-text">
            «{missing.find((g) => g.id === picked)?.name}» guruhini joylash: {cohName.toLowerCase()} matritsasida bo‘sh slotni bosing yoki sudrab tashlang.
          </p>
        )}
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-au-muted">
          {[
            ['Faol guruh', 'var(--au-primary)'],
            ['IELTS guruh', 'var(--au-info)'],
            ['Sinov darsi', 'var(--au-accent)'],
            ['Lean bufer', 'var(--au-chart-4)'],
          ].map(([n, c]) => (
            <span key={n}>
              <i className="sx-sw" style={{ background: c }} />
              {n}
            </span>
          ))}
        </div>
        {rooms.length === 0 ? (
          <div className="sx-empty">
            Guruhlarda xona va vaqt ko‘rsatilmagan. Dars reja taxtasida guruhni tahrirlab «Xona», «Vaqt» va jadval turini kiriting — matritsa avtomatik to‘ladi.
          </div>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="sx-matrix" style={{ gridTemplateColumns: `110px repeat(${shown.length}, minmax(150px, 1fr))` }}>
              <div className="h">Vaqt sloti</div>
              {shown.map((r) => (
                <div key={r} className="h">
                  {info(r)?.title || r}
                  <div className="font-normal">
                    {r} · {m.cap(r)} o‘rin{info(r)?.note ? ` · ${info(r)?.note}` : ''}
                  </div>
                </div>
              ))}
              {times.map((t, ti) => {
                const pk = peakN > 0 && load(t) === peakN;
                return (
                  <div key={t} className="contents">
                    <div className={cn('sx-tslot', pk && 'pk')}>
                      <span>
                        {ti + 1}-slot{pk ? ' · pik' : ''}
                      </span>
                      <b>{t}</b>
                    </div>
                    {shown.map((r, ri) => {
                      const c = cellOf(r, t);
                      const freeCell = c.kind === 'free';
                      const target = !!picked && freeCell;
                      return (
                        <button
                          key={r}
                          className={cn(
                            'sx-slot',
                            cls(c),
                            c.kind === 'group' && c.clash > 1 && 'clash',
                            isMatch(r, t) && 'ms-pulse !border-au-ok !bg-au-ok-soft !text-au-ok',
                            target && '!border-dashed !border-au-accent !bg-au-accent-soft/50',
                          )}
                          style={{ animationDelay: `${Math.min(ti * shown.length + ri, 40) * 12}ms` }}
                          disabled={placing && target}
                          onDragOver={(e) => {
                            if (freeCell) e.preventDefault();
                          }}
                          onDrop={(e) => {
                            const id = e.dataTransfer.getData('text/group');
                            if (freeCell && id) place(id, r, t, coh, () => setPicked(null));
                          }}
                          onClick={() => (target ? place(picked!, r, t, coh, () => setPicked(null)) : setOpen({ room: r, time: t }))}
                        >
                          {c.kind === 'group' ? (
                            <>
                              <span className="t">
                                <span className="truncate">{c.g.course || '—'}</span>
                                <em>{c.g.enrolled == null ? '—' : `${c.g.enrolled}/${m.cap(r)}`}</em>
                              </span>
                              <b>
                                {c.g.name}
                                {c.clash > 1 ? ` +${c.clash - 1}` : ''}
                              </b>
                              <small>{c.g.teacher}</small>
                            </>
                          ) : c.kind === 'hold' ? (
                            <>
                              <span className="t">{c.h.kind === 'trial' ? 'Sinov darsi' : 'Lean bufer'}</span>
                              <b>{c.h.title || '—'}</b>
                            </>
                          ) : target ? (
                            'shu yerga joylash'
                          ) : isMatch(r, t) ? (
                            `bo‘sh · ${m.cap(r)} o‘rin`
                          ) : (
                            'bo‘sh'
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <RoomRegister rooms={data.rooms} known={rooms} seats={data.plan.seats} />
      <UnscheduledGroups groups={missing} picked={picked} onPick={setPicked} />
      {open && sel && (
        <SlotModal
          key={`${open.room}|${open.time}|${coh}`}
          cell={sel}
          room={open.room}
          roomInfo={info(open.room)}
          time={open.time}
          cohort={coh}
          peak={peakN > 0 && load(open.time) === peakN}
          cap={m.cap(open.room)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
