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
import { cascadeShift, criticalPath, depViolations, type Dep } from '@/lib/strategy-plan';
import { ask } from './suite-shell';

const DW = 22;
const ROW = 40;

type Row = { grp: Workstream } | { t: StrategyTask } | { ms: true };
type Drag = { id: string; resize: boolean; x0: number; dd: number; moved: boolean };

export function GanttView({
  api,
  space,
  tasks,
  milestones,
  deps = [],
  onMilestones,
}: {
  api: WorkspaceApi;
  space: StrategySpace;
  tasks: StrategyTask[];
  milestones: StrategyMilestone[];
  deps?: Dep[];
  onMilestones: () => void;
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
    let next: { id: string; start_date: string; end_date: string };
    if (d.resize) {
      let ne = addDays(t.end_date, d.dd);
      if (ne < t.start_date) ne = t.start_date;
      next = { id: t.id, start_date: t.start_date, end_date: ne };
      api.patchTask(t.id, { end_date: ne });
    } else {
      next = { id: t.id, start_date: addDays(t.start_date, d.dd), end_date: addDays(t.end_date, d.dd) };
      api.patchTask(t.id, { start_date: next.start_date, end_date: next.end_date });
    }
    // Pushed past a dependant's start: offer to cascade the chain.
    const moves = cascadeShift(api.tasks, api.deps, next);
    if (moves.length)
      void ask(`${moves.length} ta bog‘liq vazifa endi bu vazifa tugashidan oldin boshlanadi. Ularni ham surilsinmi?`, { ok: 'Ha, surilsin' }).then(
        (yes) => {
          if (yes) void api.shiftTasks(moves);
        },
      );
  }

  // Dependency arrows: from the end of the prerequisite to the start of the
  // dependant; red when the dependant starts too early. The critical chain is
  // outlined on the bars.
  const rowOf = new Map<string, number>();
  rows.forEach((r, i) => 't' in r && rowOf.set(r.t.id, i));
  const visibleDeps = deps.filter((x) => rowOf.has(x.task_id) && rowOf.has(x.depends_on));
  const bad = new Set(depViolations(tasks, visibleDeps).map((x) => `${x.task_id}|${x.depends_on}`));
  const critical = criticalPath(tasks, visibleDeps);
  const byId = new Map(tasks.map((x) => [x.id, x]));

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
            <button key="ms" className="g-row g-grp" onClick={onMilestones} title="Muhim sanalarni qo‘shish / o‘chirish">
              <i style={{ background: 'var(--au-ink)', transform: 'rotate(45deg)' }} />
              Muhim sanalar · {milestones.length}
              <span className="ml-auto text-[11px] font-semibold text-au-accent-text">+ Tahrirlash</span>
            </button>
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
            {visibleDeps.length > 0 && (
              <svg className="pointer-events-none absolute inset-0 z-[1] overflow-visible" width={W} height={rows.length * ROW} aria-hidden>
                <defs>
                  <marker id="g-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0 0 8 4 0 8z" fill="var(--au-muted)" />
                  </marker>
                  <marker id="g-arrow-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0 0 8 4 0 8z" fill="var(--au-bad)" />
                  </marker>
                </defs>
                {visibleDeps.map((x) => {
                  const p = byId.get(x.depends_on)!;
                  const s = byId.get(x.task_id)!;
                  const x1 = (daysBetween(R0, p.end_date) + 1) * DW;
                  const y1 = rowOf.get(p.id)! * ROW + ROW / 2;
                  const x2 = daysBetween(R0, s.start_date) * DW;
                  const y2 = rowOf.get(s.id)! * ROW + ROW / 2;
                  const isBad = bad.has(`${x.task_id}|${x.depends_on}`);
                  const mid = Math.max(x1 + 10, Math.min(x2 - 10, x1 + 10));
                  return (
                    <path
                      key={`${x.task_id}|${x.depends_on}`}
                      d={`M${x1} ${y1} H${mid} V${y2} H${x2 - 2}`}
                      fill="none"
                      stroke={isBad ? 'var(--au-bad)' : 'var(--au-muted)'}
                      strokeWidth={isBad ? 2 : 1.5}
                      strokeDasharray={isBad ? '4 3' : undefined}
                      markerEnd={`url(#${isBad ? 'g-arrow-bad' : 'g-arrow'})`}
                      pathLength={1}
                      className="ms-draw"
                    />
                  );
                })}
              </svg>
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
              const w = Math.max(DW, (daysBetween(t.start_date, t.end_date) + 1) * DW + (d?.resize ? d.dd * DW : 0));
              const col = isLate(t, today) ? 'var(--au-bad)' : t.status === 'todo' ? '#a8a093' : STATUSES[t.status].c;
              return (
                <div
                  key={t.id}
                  className={`g-bar ${d ? 'dragging' : ''}`}
                  title={critical.has(t.id) ? 'Kritik yo‘l — kechiksa, butun loyiha kechikadi' : undefined}
                  style={{
                    left: l,
                    top: i * ROW + 8,
                    width: w,
                    background: col,
                    animationDelay: `${Math.min(i, 20) * 25}ms`,
                    ...(critical.has(t.id) ? { boxShadow: '0 0 0 2px var(--au-card), 0 0 0 4px var(--au-bad)' } : {}),
                  }}
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
