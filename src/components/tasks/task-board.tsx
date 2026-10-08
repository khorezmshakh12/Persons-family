'use client';

import { startTransition, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  DndContext,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  updateTaskStatusAction,
  deleteTaskAction,
  getVisibleTasksAction,
  type MonthlyTaskArchiveEntry,
  type VisibleTaskRow,
} from '@/lib/actions/tasks';
import { ensureRealtimeSignedIn, getRealtimeDb } from '@/lib/firebase/client';
import { KanbanDragOverlay } from '@/components/kanban-drag-overlay';
import { TaskKanbanColumn } from './task-kanban-column';
import {
  TaskFilterBar,
  applyTaskFilters,
  EMPTY_TASK_FILTERS,
  type TaskFilters,
} from './task-filter-bar';
import { MonthlyArchive } from './monthly-archive';
import { TaskMoveBurst } from './task-move-burst';
import { celebrate } from '@/components/motion/events';
import { TaskCard, type Task } from './task-card';
import type { Assignee } from './assign-task-dialog';
import { BOARD_LANES, boardLaneFor, laneDropStatus, type BoardLane } from '@/lib/task-status';
import { useNowTicker } from '@/lib/use-now-ticker';
import { TaskCalendarView, TaskListView, TaskStatStrip, TaskViewSwitch, TaskWorkload, type TaskView } from './task-views';

const COLUMNS = BOARD_LANES;
/** The done lane shows the last week; older work is one click away. */
const DONE_WINDOW_MS = 7 * 24 * 3600_000;

/**
 * The board only has droppable columns for the three drag targets — the
 * two review states (`submitted` / `awaiting_upload`) are reached by the
 * workflow actions, not a drop, and TaskCard already freezes their drag
 * handle (see `underReview` there). But a card in one of those states still
 * has to be *rendered* somewhere, or it silently vanishes off the board the
 * moment it's handed in: `baseColumns` used to key its Map by `COLUMNS`
 * alone and push each task under its own raw `status`, so `map.get('submitted')`
 * came back `undefined` and the optional-chained `.push` was a no-op. It
 * lands here in the done column — visually the closest thing to "in the
 * done pipeline, waiting on a human" — where TaskCard's own stage progress
 * bar and approve/reject/upload controls carry the real status.
 */
// boardColumnFor lives in lib/task-status.ts (unit-tested there).

/**
 * The date the done column sorts by, newest first: when a task actually
 * finished (`completed_at`), or — for a card sitting in `submitted`/
 * `awaiting_upload`, which lands here too via `boardColumnFor` but has no
 * `completed_at` yet — when it was handed in. Mirrors
 * getMonthlyTaskArchiveAction's own "Ordering stays completed_at desc on
 * purpose" reasoning — the done column is a chronological record.
 */
function doneSortKey(task: Task): string {
  return task.completed_at ?? task.submitted_at ?? '';
}

export function TaskBoard({
  tasks: initialTasks,
  isAdmin,
  assignees,
  currentUserId,
  archive,
  report,
}: {
  tasks: Task[];
  isAdmin: boolean;
  assignees: Assignee[];
  currentUserId: string;
  /** Past Tashkent months of completed work, rendered under the columns.
   * Server-prepared (see getMonthlyTaskArchiveAction) and static for the
   * life of the page — a task completed now stays on the board until its
   * month rolls over, so a live refresh can never move a row into it. */
  archive: MonthlyTaskArchiveEntry[];
  /** Server-rendered statistics, shown in the "Hisobot" view. */
  report?: ReactNode;
}) {
  const t = useTranslations('tasks');
  const [tasks, setTasks] = useState(initialTasks);
  // Pure view state: narrowing what's already loaded, never a re-fetch — so
  // it survives (and re-applies to) every realtime refresh below untouched.
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  // Live-drag state. Neither of these touches `tasks` — the real move still
  // only happens in handleDragEnd — they just drive where the card is
  // *rendered* while the pointer is still down.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<BoardLane | null>(null);
  const [view, setView] = useState<TaskView>('board');
  const [showAllDone, setShowAllDone] = useState(false);
  const now = useNowTicker();
  // One-shot salute fired at a card's landing spot on a column change; the
  // burst component clears it via onDone once its own timer elapses.
  const [burst, setBurst] = useState<{ id: number; x: number; y: number } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const visibleTasks = useMemo(() => applyTaskFilters(tasks, filters), [tasks, filters]);

  const activeTask = activeId ? (visibleTasks.find((task) => task.id === activeId) ?? null) : null;

  // Split once per visible-list change so a drag-over below only has to
  // rebuild the two columns it actually affects — the other column keeps its
  // array identity and stays skipped by TaskKanbanColumn's memo.
  const baseColumns = useMemo(() => {
    const map = new Map<BoardLane, Task[]>();
    for (const status of COLUMNS) map.set(status, []);
    for (const task of visibleTasks) map.get(boardLaneFor(task.status))?.push(task);
    // Every column: newest at the top, so the oldest work sinks to the
    // bottom. The two open columns order by when the task was created; the
    // done column by when it actually finished / was handed in (doneSortKey).
    // There is no manual reorder any more — the order is purely the date.
    map.get('pending')?.sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1));
    map.get('in_progress')?.sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1));
    map.get('done')?.sort((a, b) => (doneSortKey(a) < doneSortKey(b) ? 1 : -1));
    // Oldest wait first: the card that has sat longest on the CEO's desk.
    map.get('review')?.sort((a, b) => ((a.submitted_at ?? '') > (b.submitted_at ?? '') ? 1 : -1));
    return map;
  }, [visibleTasks]);

  // Done lane: this week's finishes unless "show all" is on.
  const doneRecent = useMemo(() => {
    const all = baseColumns.get('done') ?? [];
    return now === null ? all : all.filter((task) => now - new Date(doneSortKey(task) || 0).getTime() < DONE_WINDOW_MS);
  }, [baseColumns, now]);
  const doneHidden = showAllDone ? 0 : (baseColumns.get('done')?.length ?? 0) - doneRecent.length;

  // Lane header bar: share of open cards still on time.
  const onTimePct = (lane: BoardLane): number | null => {
    if (lane !== 'pending' && lane !== 'in_progress') return null;
    const list = baseColumns.get(lane) ?? [];
    if (list.length === 0) return null;
    return (list.filter((task) => !task.is_overdue).length / list.length) * 100;
  };

  // Provisional placement: while the pointer is over a column the card
  // doesn't belong to yet, render it there (and out of its home column).
  const { columns, previewStatus } = useMemo(() => {
    const home = activeTask ? boardLaneFor(activeTask.status) : null;
    if (!activeTask || !home || !overStatus || home === overStatus) {
      return { columns: baseColumns, previewStatus: null };
    }
    const next = new Map(baseColumns);
    next.set(
      home,
      (baseColumns.get(home) ?? []).filter((task) => task.id !== activeTask.id),
    );
    next.set(overStatus, [...(baseColumns.get(overStatus) ?? []), activeTask]);
    return { columns: next, previewStatus: overStatus };
  }, [baseColumns, activeTask, overStatus]);

  // Board used to only reflect the viewer's own drag/delete actions — a task
  // someone else assigned (or reassigned/updated) while this page was open
  // never appeared until a manual refresh. board_signals/tasks (bumped by
  // every mutating tasks.ts action, see lib/gcp/firestoreAdmin.ts) carries
  // no row payload — just "something changed" — so every fire re-fetches
  // the caller's whole visible list via getVisibleTasksAction, which
  // re-applies the same creator-or-assignee scoping tasks/page.tsx's
  // initial load used (task board authorization now lives entirely in that
  // Server Action, not in a realtime filter).
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    function toTask(row: VisibleTaskRow): Task {
      const assignee = assignees.find((a) => a.id === row.assigned_to);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        assigned_to: row.assigned_to,
        // Fed through for TaskCard's comment gate (assignee / assigner / CEO).
        assigned_by: row.assigned_by,
        deadline: row.deadline,
        status: row.status,
        is_overdue: row.is_overdue,
        comment_count: row.comment_count ?? 0,
        // Fed through for TaskStageActions/TaskAttachmentsDrawer — the review
        // workflow's controls, same as the two fields below.
        attachment_count: row.attachment_count ?? 0,
        requires_proof: row.requires_proof,
        from_strategy: row.from_strategy ?? false,
        rejection_reason: row.rejection_reason,
        completed_at: row.completed_at,
        submitted_at: row.submitted_at,
        created_at: row.created_at,
        star_reward: row.star_reward ?? 0,
        // Deducted from the assignee when the task is completed after its
        // deadline (see updateTaskStatusAction).
        star_penalty: row.star_penalty ?? 0,
        assignee: assignee ? { first_name: assignee.first_name, last_name: assignee.last_name } : null,
      };
    }

    const refresh = async () => {
      const rows = await getVisibleTasksAction();
      if (!cancelled) setTasks(rows.map(toTask));
    };

    ensureRealtimeSignedIn()
      .then(() => {
        if (cancelled) return;
        unsubscribe = onSnapshot(doc(getRealtimeDb(), 'board_signals', 'tasks'), () => refresh());
      })
      .catch((error) => console.error('task board realtime sign-in failed', error));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [currentUserId, assignees]);

  // `over.id` is a column droppable id, but resolve through the cards too so
  // a stray id can never be written to the database as a status.
  function resolveStatus(overId: string | number | undefined | null): BoardLane | null {
    if (overId == null) return null;
    const id = String(overId);
    if ((COLUMNS as readonly string[]).includes(id)) return id as BoardLane;
    // Dropped onto a card: resolve to the *column* that card renders in, not
    // its raw status — a `submitted`/`awaiting_upload` card sits in the done
    // column, and sending that raw status to updateTaskStatusAction failed
    // validation (`invalidInput`) and bounced the drop.
    const overTask = tasks.find((task) => task.id === id);
    return overTask ? boardLaneFor(overTask.status) : null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setOverStatus(null);
  }

  function handleDragOver(event: DragOverEvent) {
    setOverStatus(resolveStatus(event.over?.id));
  }

  function handleDragCancel() {
    setActiveId(null);
    setOverStatus(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    // Drop the provisional placement first: from here on the card's position
    // comes from `tasks` itself (optimistically below), so the two never both
    // claim the move.
    setActiveId(null);
    setOverStatus(null);
    if (!over) return;

    const taskId = String(active.id);
    const lane = resolveStatus(over.id);
    const current = tasks.find((task) => task.id === taskId);
    if (!lane || !current || boardLaneFor(current.status) === lane) return;
    // The review and done lanes both mean "hand it in".
    const nextStatus = laneDropStatus(lane);

    // A little salute at the card's landing spot. `translated` is the
    // dragged node's final rect in viewport coords; fall back to the
    // pointer if dnd-kit didn't measure one.
    const rect = active.rect.current.translated;
    if (rect) {
      setBurst({ id: Date.now(), x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }

    const previousTasks = tasks;
    setTasks((prev) =>
      // A drop on done is a hand-in: the server parks it at `submitted`, so
      // show that optimistically rather than a `done` it never becomes.
      prev.map((task) =>
        task.id === taskId
          ? { ...task, status: nextStatus === 'done' ? 'submitted' : nextStatus }
          : task,
      ),
    );

    (async () => {
      const formData = new FormData();
      formData.set('id', taskId);
      formData.set('status', nextStatus);
      const result = await updateTaskStatusAction(formData);
      if (result?.error) {
        setTasks(previousTasks);
        toast.error(t(`errors.${result.error}`));
      } else if (nextStatus === 'done') {
        // Handed in — a genuine success beat; the reward floats up (#18).
        const reward = previousTasks.find((x) => x.id === taskId)?.star_reward ?? 0;
        celebrate(reward > 0 ? `+${reward} ★` : undefined);
      }
    })();
  }

  // Optimistic, with a 5-second undo: the card leaves the board at once, but
  // the delete Server Action only runs once the "Undo" window closes. Undo
  // puts the card back and nothing reaches the server; a failed delete also
  // puts it back with an error toast. Leaving the page inside the window
  // simply cancels the delete (the safe direction).
  function handleRequestDelete(task: Task) {
    const previousTasks = tasks;
    // In a transition so the card's <ViewTransition> exit plays (#7).
    startTransition(() => setTasks((prev) => prev.filter((t) => t.id !== task.id)));

    let undone = false;
    const timer = setTimeout(async () => {
      if (undone) return;
      const formData = new FormData();
      formData.set('id', task.id);
      const result = await deleteTaskAction(formData);
      if (result?.error) {
        setTasks(previousTasks);
        toast.error(t(`errors.${result.error}`));
      }
    }, 5000);
    toast(t('deletedToast'), {
      duration: 5000,
      action: {
        label: t('undo'),
        onClick: () => {
          undone = true;
          clearTimeout(timer);
          startTransition(() => setTasks(previousTasks));
        },
      },
    });
  }

  // From the list / calendar: jump to the card on the board and flash it.
  function openTask(id: string) {
    setView('board');
    if (boardLaneFor(tasks.find((task) => task.id === id)?.status ?? 'pending') === 'done') setShowAllDone(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-task-card="${id}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus({ preventScroll: true });
        el.classList.remove('ms-glow');
        void el.offsetWidth;
        el.classList.add('ms-glow');
      }),
    );
  }

  // Keyboard: C new task · / search · J/K move between cards · Enter comments
  // · A approve · R return (the last two on a card under review, CEO only).
  // Mount-only listener; it reads the DOM, never React state.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      const cards = [...document.querySelectorAll<HTMLElement>('[data-task-card]')];
      const focused = target?.closest<HTMLElement>('[data-task-card]') ?? null;
      const key = e.key.toLowerCase();
      if (key === 'c') {
        e.preventDefault();
        window.dispatchEvent(new Event('tasks:new'));
      } else if (key === '/') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[data-task-search]')?.focus();
      } else if ((key === 'j' || key === 'k') && cards.length) {
        e.preventDefault();
        const i = focused ? cards.indexOf(focused) : -1;
        const next = cards[Math.max(0, Math.min(cards.length - 1, key === 'j' ? i + 1 : i < 0 ? 0 : i - 1))];
        next.focus();
        next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (focused && (key === 'enter' || key === 'a' || key === 'r')) {
        const action = key === 'enter' ? 'comments' : key === 'a' ? 'approve' : 'reject';
        const btn = focused.querySelector<HTMLElement>(`[data-task-action="${action}"]`);
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {burst && (
        <TaskMoveBurst key={burst.id} x={burst.x} y={burst.y} onDone={() => setBurst(null)} />
      )}
      <TaskStatStrip tasks={tasks} now={now} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <TaskViewSwitch view={view} onChange={setView} showReport={!!report} />
        <p className="hidden text-xs text-au-faint lg:block">{t('shortcuts')}</p>
      </div>
      <TaskFilterBar
        filters={filters}
        onChange={setFilters}
        isAdmin={isAdmin}
        assignees={assignees}
      />
      {isAdmin && view === 'board' && (
        <TaskWorkload
          tasks={tasks}
          picked={filters.assignee}
          onPick={(id) => setFilters((f) => ({ ...f, assignee: f.assignee === id ? 'all' : id }))}
        />
      )}
      {view === 'list' && <TaskListView tasks={visibleTasks} isAdmin={isAdmin} onOpen={openTask} />}
      {view === 'calendar' && <TaskCalendarView tasks={visibleTasks} onOpen={openTask} />}
      {view === 'report' && report}
      {view === 'board' && (
      <DndContext
        sensors={sensors}
        // The provisional placement reflows both columns mid-drag, so the
        // droppable rects captured at drag start go stale immediately.
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* Phones: lanes scroll sideways with snap; md+: a grid. */}
        <div className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-4">
          {COLUMNS.map((status) => (
            <div key={status} className="w-[86vw] max-w-[360px] shrink-0 snap-start md:w-auto md:max-w-none">
            <TaskKanbanColumn
              status={status}
              label={t(`columns.${status}`)}
              tasks={status === 'done' && !showAllDone && previewStatus !== 'done' ? doneRecent : (columns.get(status) ?? [])}
              onTimePct={onTimePct(status)}
              footer={
                status === 'done' && doneHidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllDone(true)}
                    className="rounded-au-ctl border border-dashed border-au-line py-2 text-xs font-semibold text-au-muted hover:border-au-faint hover:text-au-ink"
                  >
                    {t('showOlderDone', { count: doneHidden })}
                  </button>
                ) : undefined
              }
              isAdmin={isAdmin}
              assignees={assignees}
              currentUserId={currentUserId}
              emptyLabel={t('noTasks')}
              onRequestDelete={handleRequestDelete}
              previewTaskId={previewStatus === status ? activeId : null}
              collapsible={true}
              defaultExpanded
            />
            </div>
          ))}
        </div>
        {/* Portalled out of the app shell's transformed <main> so the fixed
         * overlay is positioned against the viewport and tracks the pointer
         * 1:1 — see KanbanDragOverlay. */}
        <KanbanDragOverlay>
          {activeTask ? (
            <TaskCard
              task={activeTask}
              isAdmin={isAdmin}
              assignees={assignees}
              currentUserId={currentUserId}
              onRequestDelete={handleRequestDelete}
              variant="overlay"
            />
          ) : null}
        </KanbanDragOverlay>
      </DndContext>
      )}
      {view === 'board' && <MonthlyArchive months={archive} isAdmin={isAdmin} />}
    </div>
  );
}
