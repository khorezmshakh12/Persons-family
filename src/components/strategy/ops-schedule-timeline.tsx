'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, PencilRuler, Undo2, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { applyScheduleDraftAction, moveGroupAction, undoMoveAction } from '@/lib/actions/operations';
import { fmtMin, isBlocking, issuesFor, scheduleIssues, toMin, type Cohort, type Placement, type SchedGroup } from '@/lib/ops-schedule';
import { ask, playSound, toast } from './suite-shell';
import type { OpsData } from './operations-workspace';
import { ExportButtons } from '@/components/export/export-buttons';

export type TimelineMode = 'room' | 'teacher' | 'course';

const PALETTE = ['var(--au-info)', 'var(--au-accent)', 'var(--au-ok)', '#7a5af8', '#e8567a', 'var(--au-chart-2)', '#0f9fb5', 'var(--au-chart-3)'];
export const courseColor = (course: string) => {
  let h = 0;
  for (const ch of course.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

export const toSched = (groups: OpsData['groups']): SchedGroup[] =>
  groups.map((g) => ({
    id: g.id,
    name: g.name,
    course: g.course,
    cohort: g.schedule_type,
    time: g.time,
    room: g.room,
    teacher_id: g.teacher_id,
    teacher: g.teacher,
    duration: g.duration || 90,
    enrolled: g.enrolled,
  }));

const SNAP = 15;
const LANE_H = 46;

type Drag = {
  id: string;
  fromTray: boolean;
  offsetMin: number;
  pointerId: number;
  cand: { row: string; time: string } | null;
};

/** Greedy lanes so overlapping blocks in one row stack instead of hiding. */
function lanes(list: SchedGroup[]): Map<string, number> {
  const out = new Map<string, number>();
  const ends: number[] = [];
  for (const g of [...list].sort((a, b) => toMin(a.time) - toMin(b.time))) {
    const s = toMin(g.time);
    let lane = ends.findIndex((e) => e <= s);
    if (lane < 0) lane = ends.length;
    ends[lane] = s + g.duration;
    out.set(g.id, lane);
  }
  return out;
}

/**
 * Resource timeline (rows = rooms / teachers / courses, x = time). Blocks
 * are sized by lesson length and show seats filled. Drag a block (or an
 * unscheduled chip) to move it: the ghost turns green or red live from the
 * same rules the server enforces; drop snaps to 15 min. Draft mode collects
 * moves and applies them in one validated batch; every live move is
 * undoable.
 */
export function ScheduleTimeline({
  data,
  capOf,
  cohort,
  mode,
  focusId,
  readOnlyRows = false,
}: {
  data: OpsData;
  capOf: (room: string) => number;
  cohort: Cohort;
  mode: TimelineMode;
  focusId?: string | null;
  /** Teacher/course views: a drag changes time only. */
  readOnlyRows?: boolean;
}) {
  const router = useRouter();
  const base = useMemo(() => toSched(data.groups), [data.groups]);
  const [draftOn, setDraftOn] = useState(false);
  const [draft, setDraft] = useState<Record<string, Placement>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const [busy, setBusy] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [teacherF, setTeacherF] = useState('all');
  const [courseF, setCourseF] = useState('all');
  const trackRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const canEdit = data.canEdit;

  // The schedule as it would be with the draft applied.
  const groups = useMemo(
    () => base.map((g) => (draft[g.id] ? { ...g, ...draft[g.id], cohort: draft[g.id].cohort } : g)),
    [base, draft],
  );
  const inCohort = groups.filter((g) => g.cohort === cohort && g.time && g.room);
  const unscheduled = groups.filter((g) => !(g.cohort && g.time && g.room));
  const visible = inCohort.filter((g) => (teacherF === 'all' || g.teacher_id === teacherF) && (courseF === 'all' || g.course === courseF));

  const issues = scheduleIssues(groups, capOf, data.availability);
  const clashIds = new Set(issues.filter(isBlocking).flatMap((i) => [i.groupId, i.other ?? '']));
  const warnIds = new Set(issues.filter((i) => !isBlocking(i)).map((i) => i.groupId));

  // Opening hours: 08:00–21:00, widened to fit any lesson.
  const open = Math.min(8 * 60, ...inCohort.map((g) => Math.floor(toMin(g.time) / 60) * 60));
  const close = Math.max(21 * 60, ...inCohort.map((g) => Math.ceil((toMin(g.time) + g.duration) / 60) * 60));
  const span = close - open;
  const pct = (min: number) => ((min - open) / span) * 100;

  const rows: { key: string; label: string; sub?: string }[] = (() => {
    if (mode === 'room') {
      const codes = [...new Set([...data.rooms.map((r) => r.code), ...inCohort.map((g) => g.room)])];
      return codes.map((c) => {
        const r = data.rooms.find((x) => x.code === c);
        return { key: c, label: r?.title || c, sub: `${c} · ${capOf(c) || '—'} o‘rin${r?.features?.length ? ` · ${r.features.join(', ')}` : ''}` };
      });
    }
    if (mode === 'teacher') {
      const ts = new Map<string, string>();
      for (const g of groups) if (g.teacher_id) ts.set(g.teacher_id, g.teacher);
      return [...ts.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => ({ key: k, label: v }));
    }
    const cs = [...new Set(groups.map((g) => g.course || '—'))].sort();
    return cs.map((c) => ({ key: c, label: c }));
  })();
  const rowOf = (g: SchedGroup) => (mode === 'room' ? g.room : mode === 'teacher' ? (g.teacher_id ?? '') : g.course || '—');

  /* ---------------- drag ---------------- */

  const locate = useCallback(
    (clientX: number, clientY: number, offsetMin: number): { row: string; time: string } | null => {
      const track = trackRef.current?.getBoundingClientRect();
      if (!track) return null;
      let row: string | null = null;
      for (const [key, el] of rowRefs.current) {
        const r = el.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) row = key;
      }
      if (!row) return null;
      const raw = open + ((clientX - track.left) / track.width) * span - offsetMin;
      const snapped = Math.round(raw / SNAP) * SNAP;
      return { row, time: fmtMin(Math.max(open, Math.min(close - SNAP, snapped))) };
    },
    [open, close, span],
  );

  const placementFor = (g: SchedGroup, cand: { row: string; time: string }): Placement => ({
    room: mode === 'room' && !readOnlyRows ? cand.row : g.room,
    time: cand.time,
    cohort,
    duration: g.duration,
  });

  const startDrag = (e: React.PointerEvent, g: SchedGroup, fromTray: boolean) => {
    if (!canEdit || busy) {
      if (!fromTray) setSelected(g.id);
      return;
    }
    if (fromTray && mode !== 'room') {
      toast.error('Yangi guruhni joylash uchun «Xonalar» ko‘rinishiga o‘ting');
      return;
    }
    const track = trackRef.current?.getBoundingClientRect();
    const pointerMin = track ? open + ((e.clientX - track.left) / track.width) * span : 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: g.id, fromTray, offsetMin: fromTray ? 0 : Math.max(0, pointerMin - toMin(g.time)), pointerId: e.pointerId, cand: null });
    playSound('tick');
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const cand = locate(e.clientX, e.clientY, drag.offsetMin);
    if (cand?.row !== drag.cand?.row || cand?.time !== drag.cand?.time) setDrag({ ...drag, cand });
  };
  const endDrag = async (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    setDrag(null);
    const g = groups.find((x) => x.id === d.id);
    if (!g) return;
    // A press without movement is a click: open the group card.
    if (!d.cand) {
      if (!d.fromTray) setSelected(g.id);
      return;
    }
    const p = placementFor(g, d.cand);
    if (p.room === g.room && p.time === g.time && g.cohort === cohort) {
      if (!d.fromTray) setSelected(g.id);
      return;
    }
    const iss = issuesFor(g, p, groups, capOf, data.availability);
    if (iss.some(isBlocking)) {
      playSound('err');
      toast.error(iss.filter(isBlocking)[0].text);
      return;
    }
    if (draftOn) {
      setDraft((dr) => ({ ...dr, [g.id]: p }));
      playSound('ok');
      return;
    }
    await commit(g, p, false);
  };

  const commit = async (g: SchedGroup, p: Placement, force: boolean): Promise<void> => {
    setBusy(true);
    const r = await moveGroupAction({ groupId: g.id, ...p, force });
    setBusy(false);
    if (r.error === 'warning' && r.warnings?.length) {
      if (await ask(`${r.warnings.join('\n')}\n\nBaribir ko‘chirilsinmi?`, { ok: 'Ko‘chirish' })) return commit(g, p, true);
      return;
    }
    if (r.error) {
      playSound('err');
      toast.error(r.issues?.[0] ?? (r.error === 'forbidden' ? "Ruxsat yo'q" : "Saqlab bo'lmadi"));
      return;
    }
    playSound('ok');
    if (r.logId) setUndoStack((s) => [...s, r.logId!]);
    toast.success(`${g.name} → ${p.room} · ${p.time}`);
    router.refresh();
  };

  const undoLast = useCallback(async () => {
    const id = undoStack[undoStack.length - 1];
    if (!id) return;
    const r = await undoMoveAction(id);
    if (r.error) return void toast.error("Bekor qilib bo'lmadi");
    setUndoStack((s) => s.slice(0, -1));
    toast.success('Bekor qilindi');
    router.refresh();
  }, [undoStack, router]);

  const applyDraft = async () => {
    const moves = Object.entries(draft).map(([groupId, p]) => ({ groupId, ...p }));
    if (!moves.length) return;
    setBusy(true);
    const r = await applyScheduleDraftAction(moves);
    setBusy(false);
    if (r.error) return void toast.error(r.issues?.[0] ?? "Qo'llab bo'lmadi");
    playSound('ok');
    toast.success(`${moves.length} ta o‘zgarish qo‘llandi`);
    setDraft({});
    setDraftOn(false);
    router.refresh();
  };

  // Keyboard: D draft mode, Ctrl/⌘+Z undo the last live move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void undoLast();
      } else if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'd' && canEdit) {
        setDraftOn((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoLast, canEdit]);

  // Bring a focused group into view (from the overview's "needs attention").
  useEffect(() => {
    if (!focusId) return;
    const el = document.querySelector<HTMLElement>(`[data-block="${focusId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [focusId]);

  const dragGroup = drag ? groups.find((g) => g.id === drag.id) : null;
  const ghost = drag?.cand && dragGroup ? { g: dragGroup, p: placementFor(dragGroup, drag.cand) } : null;
  const ghostIssues = ghost ? issuesFor(ghost.g, ghost.p, groups, capOf, data.availability) : [];
  const ghostBad = ghostIssues.some(isBlocking);
  const draftCount = Object.keys(draft).length;
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => open + i * 60);
  const teachers = [...new Map(groups.filter((g) => g.teacher_id).map((g) => [g.teacher_id!, g.teacher])).entries()];
  const courses = [...new Set(groups.map((g) => g.course).filter(Boolean))].sort();

  return (
    <div className="flex flex-col gap-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="sx-inp !h-[32px] !w-[170px]" value={teacherF} onChange={(e) => setTeacherF(e.target.value)} aria-label="O‘qituvchi">
          <option value="all">Barcha o‘qituvchilar</option>
          {teachers.map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </select>
        <select className="sx-inp !h-[32px] !w-[150px]" value={courseF} onChange={(e) => setCourseF(e.target.value)} aria-label="Kurs">
          <option value="all">Barcha kurslar</option>
          {courses.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        {canEdit && (
          <>
            <button className={cn('sx-btn', draftOn && 'primary')} onClick={() => setDraftOn((v) => !v)} title="Qoralama rejimi (D)">
              <PencilRuler className="size-4" /> Qoralama{draftCount ? ` · ${draftCount}` : ''}
            </button>
            {draftOn && draftCount > 0 && (
              <>
                <button className="sx-btn primary" disabled={busy} onClick={applyDraft}>
                  Qo‘llash
                </button>
                <button className="sx-btn" onClick={() => setDraft({})}>
                  Bekor
                </button>
              </>
            )}
            <button className="sx-btn" disabled={!undoStack.length || busy} onClick={undoLast} title="Bekor qilish (Ctrl+Z)">
              <Undo2 className="size-4" />
            </button>
          </>
        )}
        <ExportButtons
          filename={`jadval-${cohort === 'odd' ? 'toq' : 'juft'}`}
          columns={[
            { header: 'Guruh', key: 'name' },
            { header: 'Kurs', key: 'course' },
            { header: 'O‘qituvchi', key: 'teacher' },
            { header: 'Xona', key: 'room' },
            { header: 'Boshlanish', key: 'time' },
            { header: 'Tugash', key: 'end' },
            { header: 'O‘quvchilar', key: 'enrolled' },
          ]}
          rows={[...visible]
            .sort((a, b) => a.room.localeCompare(b.room) || toMin(a.time) - toMin(b.time))
            .map((g) => ({ name: g.name, course: g.course, teacher: g.teacher, room: g.room, time: g.time, end: fmtMin(toMin(g.time) + g.duration), enrolled: g.enrolled ?? '' }))}
        />
        <button className="sx-btn" onClick={() => setLogOpen(true)} title="O‘zgarishlar jurnali">
          <History className="size-4" /> Jurnal
        </button>
      </div>

      {draftOn && (
        <p className="rounded-lg border border-dashed border-au-accent bg-au-accent-soft/50 px-3 py-2 text-xs font-semibold text-au-accent-text">
          Qoralama rejimi: ko‘chirishlar hali saqlanmaydi. Hammasini tekshirib, «Qo‘llash» bilan bir martada kuchga kiriting.
        </p>
      )}

      {/* unscheduled tray */}
      {unscheduled.length > 0 && canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-au-card-2 px-3 py-2">
          <span className="text-xs font-bold text-au-muted">Jadvalsiz · {unscheduled.length}</span>
          {unscheduled.map((g) => (
            <button
              key={g.id}
              type="button"
              onPointerDown={(e) => startDrag(e, g, true)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              className={cn('inline-flex touch-none cursor-grab items-center gap-1.5 rounded-full border border-au-line bg-au-card px-2.5 py-1 text-xs font-semibold text-au-ink active:cursor-grabbing', drag?.id === g.id && 'opacity-50')}
            >
              <i className="size-2 rounded-full" style={{ background: courseColor(g.course) }} />
              {g.name}
              <span className="font-normal text-au-muted">{g.teacher}</span>
            </button>
          ))}
        </div>
      )}

      {/* timeline */}
      <div className="sx-card !p-0 overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="sticky top-0 z-10 grid grid-cols-[170px_1fr] border-b border-au-line bg-au-card">
            <div className="px-3 py-2 text-[11px] font-semibold tracking-wide text-au-faint uppercase">
              {mode === 'room' ? 'Xona' : mode === 'teacher' ? 'O‘qituvchi' : 'Kurs'}
            </div>
            <div className="relative h-8">
              {hours.map((h) => (
                <span key={h} className="absolute top-2 -translate-x-1/2 text-[11px] font-semibold text-au-muted tabular-nums" style={{ left: `${pct(h)}%` }}>
                  {fmtMin(h)}
                </span>
              ))}
            </div>
          </div>
          <div className="relative grid grid-cols-[170px_1fr]">
            <div />
            <div ref={trackRef} className="pointer-events-none absolute inset-y-0 right-0 left-[170px]" aria-hidden>
              {hours.map((h) => (
                <i key={h} className="absolute inset-y-0 w-px bg-au-line/70" style={{ left: `${pct(h)}%` }} />
              ))}
            </div>
            {rows.map((row, ri) => {
              const list = visible.filter((g) => rowOf(g) === row.key);
              const ln = lanes(list);
              const laneCount = Math.max(1, ...[...ln.values()].map((v) => v + 1));
              const isTarget = ghost && (mode !== 'room' || readOnlyRows ? rowOf(ghost.g) === row.key : ghost.p.room === row.key);
              return (
                <div key={row.key} className="contents">
                  <div className="border-b border-au-line/70 px-3 py-2">
                    <div className="truncate text-sm font-semibold text-au-ink">{row.label}</div>
                    {row.sub && <div className="truncate text-[10.5px] text-au-faint">{row.sub}</div>}
                  </div>
                  <div
                    ref={(el) => {
                      if (el) rowRefs.current.set(row.key, el);
                      else rowRefs.current.delete(row.key);
                    }}
                    className={cn('relative border-b border-au-line/70 transition-colors', isTarget && (ghostBad ? 'bg-au-bad-soft/40' : 'bg-au-ok-soft/40'))}
                    style={{ height: laneCount * LANE_H + 8 }}
                  >
                    {list.map((g) => {
                      const lane = ln.get(g.id) ?? 0;
                      const cap = capOf(g.room);
                      const fill = g.enrolled != null && cap ? Math.min(1, g.enrolled / cap) : null;
                      const clash = clashIds.has(g.id);
                      const warn = warnIds.has(g.id);
                      const inDraft = !!draft[g.id];
                      return (
                        <button
                          key={g.id}
                          type="button"
                          data-block={g.id}
                          onPointerDown={(e) => startDrag(e, g, false)}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          title={`${g.name} · ${g.course} · ${g.teacher} · ${g.room} · ${g.time}–${fmtMin(toMin(g.time) + g.duration)}`}
                          className={cn(
                            'ms-rise absolute flex touch-none flex-col justify-center overflow-hidden rounded-[9px] border bg-au-card px-2 text-left shadow-au-card transition-[box-shadow,opacity] select-none',
                            canEdit && 'cursor-grab active:cursor-grabbing hover:shadow-au-card-hover',
                            clash ? 'ms-alarm border-au-bad' : warn ? 'border-au-accent' : 'border-au-line',
                            inDraft && 'border-dashed border-au-accent',
                            drag?.id === g.id && 'opacity-35',
                            focusId === g.id && 'ms-glow ring-2 ring-au-accent',
                          )}
                          style={{
                            left: `${pct(toMin(g.time))}%`,
                            width: `${(g.duration / span) * 100}%`,
                            top: 4 + lane * LANE_H,
                            height: LANE_H - 4,
                            borderLeft: `4px solid ${courseColor(g.course)}`,
                            ['--i' as string]: Math.min(ri, 10),
                          }}
                        >
                          <span className="truncate text-[12px] leading-tight font-bold text-au-ink">{g.name}</span>
                          <span className="truncate text-[10.5px] leading-tight text-au-muted">
                            {mode === 'room' ? g.teacher : g.room} · {g.time}
                          </span>
                          {fill !== null && (
                            <span className="absolute inset-x-2 bottom-1 h-[3px] overflow-hidden rounded-full bg-au-card-2" aria-hidden>
                              <span className={cn('block h-full rounded-full', fill >= 1 ? 'bg-au-bad' : fill >= 0.8 ? 'bg-au-accent' : 'bg-au-ok')} style={{ width: `${fill * 100}%` }} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {ghost && isTarget && (
                      <span
                        className={cn('pointer-events-none absolute z-20 flex items-center rounded-[9px] border-2 px-2 text-[11px] font-bold shadow-lg', ghostBad ? 'm-shake border-au-bad bg-au-bad-soft text-au-bad' : 'border-au-ok bg-au-ok-soft text-au-ok')}
                        style={{ left: `${pct(toMin(ghost.p.time))}%`, width: `${(ghost.p.duration / span) * 100}%`, top: 4, height: LANE_H - 4 }}
                      >
                        {ghost.p.time} · {ghostBad ? ghostIssues.find(isBlocking)?.text : ghost.g.name}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && <div className="col-span-2 sx-empty">Ma’lumot yo‘q</div>}
          </div>
        </div>
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-au-muted">
        {courses.slice(0, 8).map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-1 rounded-full" style={{ background: courseColor(c) }} />
            {c}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <i className="size-2.5 rounded-[3px] border-2 border-au-bad" /> to‘qnashuv
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="size-2.5 rounded-[3px] border-2 border-au-accent" /> ogohlantirish
        </span>
      </div>

      {selected &&
        (() => {
          const g = groups.find((x) => x.id === selected);
          if (!g) return null;
          const cap = capOf(g.room);
          const own = issues.filter((i) => i.groupId === g.id || i.other === g.id);
          return (
            <div className="sx-modal-bg" onClick={() => setSelected(null)}>
              <div className="sx-modal max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="sx-h">
                  <i className="h-6 w-1.5 rounded-full" style={{ background: courseColor(g.course) }} />
                  <h3>{g.name}</h3>
                  <span className="sp" />
                  <button className="sx-btn sm" onClick={() => setSelected(null)} aria-label="Yopish">
                    <X className="size-4" />
                  </button>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    ['Kurs', g.course || '—'],
                    ['O‘qituvchi', g.teacher || '—'],
                    ['Xona', `${g.room} · ${cap || '—'} o‘rin`],
                    ['Vaqt', `${g.time}–${fmtMin(toMin(g.time) + g.duration)} · ${g.cohort === 'odd' ? 'toq' : 'juft'}`],
                    ['O‘quvchilar', g.enrolled == null ? 'kiritilmagan' : `${g.enrolled}${cap ? ` / ${cap}` : ''}`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-au-card-2 px-3 py-2">
                      <dt className="text-[11px] font-semibold text-au-muted">{k}</dt>
                      <dd className="font-semibold text-au-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                {own.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1">
                    {own.map((i, k) => (
                      <li key={k} className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold', isBlocking(i) ? 'bg-au-bad-soft text-au-bad' : 'bg-au-accent-soft text-au-accent-text')}>
                        {i.text}
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit && (
                  <div className="mt-3">
                    <div className="mb-1.5 text-xs font-semibold text-au-muted">Dars davomiyligi</div>
                    <div className="sx-seg">
                      {[60, 75, 90, 120].map((d) => (
                        <button
                          key={d}
                          className={cn(g.duration === d && 'on')}
                          disabled={busy}
                          onClick={async () => {
                            if (g.duration === d || !g.cohort) return;
                            await commit(g, { room: g.room, time: g.time, cohort: g.cohort, duration: d }, false);
                            setSelected(null);
                          }}
                        >
                          {d} daq
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-au-faint">Boshqa vaqt yoki xonaga o‘tkazish uchun blokni jadvalda sudrang.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {logOpen && (
        <div className="sx-modal-bg" onClick={() => setLogOpen(false)}>
          <div className="sx-modal max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="sx-h">
              <h3>O‘zgarishlar jurnali</h3>
              <span className="sp" />
              <button className="sx-btn sm" onClick={() => setLogOpen(false)} aria-label="Yopish">
                <X className="size-4" />
              </button>
            </div>
            {data.log.length === 0 ? (
              <div className="sx-empty">Hali o‘zgarish yo‘q</div>
            ) : (
              <ol className="flex max-h-[60vh] flex-col gap-1.5 overflow-auto">
                {data.log.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 rounded-lg bg-au-card-2 px-3 py-2 text-xs">
                    <span className="min-w-0 flex-1">
                      <b className="text-au-ink">{l.group_name}</b>{' '}
                      <span className="text-au-muted">
                        {l.before.room ?? '—'} {l.before.time ?? ''} → {l.after.room} {l.after.time} ({l.after.cohort === 'odd' ? 'toq' : 'juft'})
                      </span>
                      <span className="block text-[10.5px] text-au-faint">
                        {l.actor} · {new Date(l.at).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </span>
                    {canEdit && (
                      <button
                        className="sx-btn sm"
                        onClick={async () => {
                          const r = await undoMoveAction(l.id);
                          if (r.error) return void toast.error("Bekor qilib bo'lmadi");
                          toast.success('Qaytarildi');
                          setLogOpen(false);
                          router.refresh();
                        }}
                      >
                        <Undo2 className="size-3.5" /> Qaytarish
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
