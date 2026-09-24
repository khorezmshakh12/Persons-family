'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import {
  MONF,
  STATUSES,
  WORKSTREAMS,
  addDays,
  daysBetween,
  fmtDay,
  isLate,
  weekday,
  type StrategyMilestone,
  type StrategySpace,
  type StrategyTask,
  type Workstream,
} from '@/lib/strategy';
import { PersonAvatar } from './bits';
import type { WorkspaceApi } from './strategy-workspace';

const DW = 22;
const ROW = 40;

type Row = { grp: Workstream } | { t: StrategyTask } | { ms: true };
type Drag = { id: string; resize: boolean; x0: number; dd: number; moved: boolean };

export function GanttView({
  api,
  space,
  tasks,
  milestones,
}: {
  api: WorkspaceApi;
  space: StrategySpace;
  tasks: StrategyTask[];
  milestones: StrategyMilestone[];
}) {
  const { today } = api;
  const rightRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Range = the space's window, stretched to cover every task and milestone.
  const starts = [space.start_date, ...tasks.map((t) => t.start_date), ...milestones.map((m) => m.date)].sort();
  const ends = [space.end_date, ...tasks.map((t) => t.end_date), ...milestones.map((m) => m.date)].sort();
  const R0 = addDays(starts[0], -3);
  const R1 = addDays(ends[ends.length - 1], 7);
  const N = daysBetween(R0, R1) + 1;
  const W = N * DW;

  const rows: Row[] = [];
  (Object.keys(WORKSTREAMS) as Workstream[]).forEach((w) => {
    const L = tasks.filter((t) => t.workstream === w).sort((a, b) => a.start_date.localeCompare(b.start_date));
    if (!L.length) return;
    rows.push({ grp: w });
    L.forEach((t) => rows.push({ t }));
  });
  rows.push({ ms: true });

  const months: { n: string; w: number }[] = [];
  for (let i = 0; i < N; ) {
    const d = addDays(R0, i);
    const y = +d.slice(0, 4);
    const m = +d.slice(5, 7);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const len = Math.min(daysBetween(d, last) + 1, N - i);
    months.push({ n: `${MONF[m - 1]} ${y}`, w: len * DW });
    i += len;
  }

  useLayoutEffect(() => {
    const el = rightRef.current;
    if (el) el.scrollLeft = Math.max(0, daysBetween(R0, today) * DW - 300);
    // Only on mount — later renders keep the user's scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onDown(e: React.PointerEvent<HTMLDivElement>, t: StrategyTask) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: t.id, resize: (e.target as HTMLElement).classList.contains('hdl'), x0: e.clientX, dd: 0, moved: false });
  }
  function onMove(e: React.PointerEvent, t: StrategyTask) {
    if (!drag || drag.id !== t.id) return;
    const dd = Math.round((e.clientX - drag.x0) / DW);
    const moved = drag.moved || Math.abs(e.clientX - drag.x0) > 3;
    setDrag({ ...drag, dd, moved });
    const ns = drag.resize ? t.start_date : addDays(t.start_date, dd);
    let ne = addDays(t.end_date, dd);
    if (ne < ns) ne = ns;
    setTip({ x: e.clientX + 14, y: e.clientY - 34, text: `${fmtDay(ns)} → ${fmtDay(ne)}` });
  }
  function onUp(t: StrategyTask) {
    const d = drag;
    setDrag(null);
    setTip(null);
    if (!d || d.id !== t.id) return;
    if (!d.moved) return api.openTask(t.id);
    if (d.dd === 0) return;
    if (d.resize) {
      let ne = addDays(t.end_date, d.dd);
      if (ne < t.start_date) ne = t.start_date;
      api.patchTask(t.id, { end_date: ne });
    } else {
      api.patchTask(t.id, { start_date: addDays(t.start_date, d.dd), end_date: addDays(t.end_date, d.dd) });
    }
  }

  return (
    <div className="sx-gantt">
      <div className="g-left" ref={leftRef}>
        <div className="g-hd">Vazifa · {tasks.length}</div>
        {rows.map((r, i) =>
          'grp' in r ? (
            <div key={`g${r.grp}`} className="g-row g-grp">
              <i style={{ background: WORKSTREAMS[r.grp].c }} />
              {WORKSTREAMS[r.grp].n}
            </div>
          ) : 'ms' in r ? (
            <div key="ms" className="g-row g-grp">
              <i style={{ background: 'var(--au-ink)', transform: 'rotate(45deg)' }} />
              Muhim sanalar
            </div>
          ) : (
            <button key={r.t.id} className="g-row" onClick={() => api.openTask(r.t.id)} style={{ animationDelay: `${i * 20}ms` }}>
              <PersonAvatar person={r.t.assignee_id ? api.personById.get(r.t.assignee_id) : undefined} size={22} />
              <span className="nm">{r.t.title}</span>
              {isLate(r.t, today) && <span className="text-[11px] text-au-bad">⚠</span>}
            </button>
          ),
        )}
      </div>
      <div
        className="g-right"
        ref={rightRef}
        onScroll={(e) => {
          if (leftRef.current) leftRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
      >
        <div style={{ width: W }}>
          <div className="g-hd">
            <div className="g-months">
              {months.map((m) => (
                <div key={m.n} style={{ width: m.w }}>
                  {m.n}
                </div>
              ))}
            </div>
            <div className="g-days">
              {Array.from({ length: N }, (_, i) => {
                const d = addDays(R0, i);
                const wd = weekday(d);
                return (
                  <div key={d} className={`${wd === 0 || wd === 6 ? 'we' : ''} ${d === today ? 'today' : ''}`} style={{ width: DW }}>
                    {+d.slice(8, 10)}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="g-body" style={{ height: rows.length * ROW }}>
            <div className="g-grid">
              {Array.from({ length: N }, (_, i) => {
                const wd = weekday(addDays(R0, i));
                return (
                  <span key={i} className="contents">
                    {(wd === 0 || wd === 6) && <div className="we" style={{ left: i * DW, width: DW }} />}
                    {wd === 1 && <div className="wk" style={{ left: i * DW }} />}
                  </span>
                );
              })}
            </div>
            {today >= R0 && today <= R1 && (
              <div className="g-todayline" style={{ left: daysBetween(R0, today) * DW + DW / 2 }} />
            )}
            {rows.map((r, i) => {
              if ('ms' in r)
                return milestones.map((m) => (
                  <span key={m.id} className="contents">
                    <div
                      className="g-ms"
                      title={`${m.title} · ${fmtDay(m.date)}`}
                      style={{ left: daysBetween(R0, m.date) * DW + 2, top: i * ROW + 11 }}
                    />
                    <div className="g-ms-l" style={{ left: daysBetween(R0, m.date) * DW + 26, top: i * ROW + 11 }}>
                      {m.title}
                    </div>
                  </span>
                ));
              if (!('t' in r)) return null;
              const t = r.t;
              const d = drag?.id === t.id ? drag : null;
              const l = daysBetween(R0, t.start_date) * DW + (d && !d.resize ? d.dd * DW : 0);
              const w = Math.max(DW, (daysBetween(t.start_date, t.end_date) + 1) * DW + (d ? d.dd * DW : 0));
              const col = isLate(t, today) ? 'var(--au-bad)' : t.status === 'todo' ? '#a8a093' : STATUSES[t.status].c;
              return (
                <div
                  key={t.id}
                  className={`g-bar ${d ? 'dragging' : ''}`}
                  style={{ left: l, top: i * ROW + 8, width: w, background: col, animationDelay: `${Math.min(i, 20) * 25}ms` }}
                  onPointerDown={(e) => onDown(e, t)}
                  onPointerMove={(e) => onMove(e, t)}
                  onPointerUp={() => onUp(t)}
                  onPointerCancel={() => {
                    setDrag(null);
                    setTip(null);
                  }}
                >
                  <div className="fill" style={{ width: `${t.progress}%` }} />
                  <span className={`lb ${w < 150 ? 'out' : ''}`}>{t.title}</span>
                  <span className="hdl" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {tip && (
        <div className="sx-gtip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
