'use client';

import { useEffect, useMemo, useState } from 'react';
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
  reorderTaskAction,
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
import { TaskCard, type Task } from './task-card';
import type { Assignee } from './assign-task-dialog';
import type { TaskStatus } from './task-status-control';

const COLUMNS: TaskStatus[] = ['pending', 'in_progress', 'done'];

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
function boardColumnFor(status: TaskStatus): TaskStatus {
  return status === 'submitted' || status === 'awaiting_upload' ? 'done' : status;
}

/**
 * The date the done column sorts by, newest first: when a task actually
 * finished (`completed_at`), or — for a card sitting in `submitted`/
 * `awaiting_upload`, which lands here too via `boardColumnFor` but has no
 * `completed_at` yet — when it was handed in. Mirrors
 * getMonthlyTaskArchiveAction's own reasoning (see its "Ordering stays
 * completed_at desc on purpose" comment): `sort_order` is a manual *live
 * board* position for the two open columns, and once a task is done,
 * mixing it in with whatever position it happened to hold before is what
 * made the column read as an unsorted pile once a team had more than a
 * handful of finished tasks in the month.
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
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const visibleTasks = useMemo(() => applyTaskFilters(tasks, filters), [tasks, filters]);

  const activeTask = activeId ? (visibleTasks.find((task) => task.id === activeId) ?? null) : null;

  // Split once per visible-list change so a drag-over below only has to
  // rebuild the two columns it actually affects — the other column keeps its
  // array identity and stays skipped by TaskKanbanColumn's memo.
  const baseColumns = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const status of COLUMNS) map.set(status, []);
    for (const task of visibleTasks) map.get(boardColumnFor(task.status))?.push(task);
    // Newest-finished-first, independent of sort_order (see doneSortKey) —
    // the two open columns keep the server's sort_order-then-created_at
    // order untouched, so manual reordering there is unaffected.
    map.get('done')?.sort((a, b) => (doneSortKey(a) < doneSortKey(b) ? 1 : -1));
    return map;
  }, [visibleTasks]);

  // Provisional placement: while the pointer is over a column the card
  // doesn't belong to yet, render it there (and out of its home column).
  const { columns, previewStatus } = useMemo(() => {
    if (!activeTask || !overStatus || activeTask.status === overStatus) {
      return { columns: baseColumns, previewStatus: null };
    }
    const next = new Map(baseColumns);
    next.set(
      activeTask.status,
      (baseColumns.get(activeTask.status) ?? []).filter((task) => task.id !== activeTask.id),
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
        rejection_reason: row.rejection_reason,
        completed_at: row.completed_at,
        submitted_at: row.submitted_at,
        star_reward: row.star_reward ?? 0,
        // Deducted from the assignee when the task is completed after its
        // deadline (see updateTaskStatusAction).
        star_penalty: row.star_penalty ?? 0,
        // Rows already arrive ordered by (sort_order, created_at desc); the
        // value rides along so a reorder has something to reconcile.
        sort_order: row.sort_order ?? 0,
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
  function resolveStatus(overId: string | number | undefined | null): TaskStatus | null {
    if (overId == null) return null;
    const id = String(overId);
    if ((COLUMNS as string[]).includes(id)) return id as TaskStatus;
    return tasks.find((task) => task.id === id)?.status ?? null;
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
    const nextStatus = resolveStatus(over.id);
    const current = tasks.find((task) => task.id === taskId);
    if (!nextStatus || !current || current.status === nextStatus) return;

    const previousTasks = tasks;
    setTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, status: nextStatus } : task)),
    );

    (async () => {
      const formData = new FormData();
      formData.set('id', taskId);
      formData.set('status', nextStatus);
      const result = await updateTaskStatusAction(formData);
      if (result?.error) {
        setTasks(previousTasks);
        toast.error(t(`errors.${result.error}`));
      }
    })();
  }

  /**
   * Move one card up/down inside its own status column, optimistically.
   *
   * The swap is computed over the *unfiltered* same-status siblings on
   * purpose: that list is exactly what reorderTaskAction renumbers
   * server-side (same visibility scope, same `sort_order asc, created_at
   * desc` order), so the optimistic result and the row that comes back from
   * the follow-up realtime refresh can't disagree. With a filter active the
   * neighbour being passed may therefore be a hidden card.
   */
  function handleMove(task: Task, direction: 'up' | 'down') {
    const siblingIds = tasks.filter((row) => row.status === task.status).map((row) => row.id);
    const index = siblingIds.indexOf(task.id);
    const neighbour = direction === 'up' ? index - 1 : index + 1;
    // Already at the edge of its column — don't spend a round trip on a
    // no-op the server would only confirm.
    if (index === -1 || neighbour < 0 || neighbour >= siblingIds.length) return;

    const previousTasks = tasks;
    const from = tasks.findIndex((row) => row.id === task.id);
    const to = tasks.findIndex((row) => row.id === siblingIds[neighbour]);
    const next = tasks.slice();
    [next[from], next[to]] = [next[to], next[from]];
    setTasks(next);

    (async () => {
      const formData = new FormData();
      formData.set('id', task.id);
      formData.set('direction', direction);
      const result = await reorderTaskAction(formData);
      if (result?.error) {
        setTasks(previousTasks);
        toast.error(t(`errors.${result.error}`));
      }
    })();
  }

  // Strict optimistic UI: the card is filtered out of local state instantly
  // — before the delete Server Action is even awaited — which is what
  // makes the click feel instant instead of freezing the board until the
  // round trip resolves. Only a failure puts the card back and surfaces a
  // toast; the common (successful) case never waits on the network at all.
  function handleRequestDelete(task: Task) {
    const previousTasks = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== task.id));

    (async () => {
      const formData = new FormData();
      formData.set('id', task.id);
      const result = await deleteTaskAction(formData);
      if (result?.error) {
        setTasks(previousTasks);
        toast.error(t(`errors.${result.error}`));
      }
    })();
  }

  return (
    <div className="flex flex-col gap-8">
      <TaskFilterBar
        filters={filters}
        onChange={setFilters}
        isAdmin={isAdmin}
        assignees={assignees}
      />
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
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
          {COLUMNS.map((status) => (
            <TaskKanbanColumn
              key={status}
              status={status}
              label={t(`columns.${status}`)}
              tasks={columns.get(status) ?? []}
              isAdmin={isAdmin}
              assignees={assignees}
              currentUserId={currentUserId}
              emptyLabel={t('noTasks')}
              onRequestDelete={handleRequestDelete}
              onMove={handleMove}
              previewTaskId={previewStatus === status ? activeId : null}
              collapsible={true}
              defaultExpanded={status !== 'done'}
            />
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
              onMove={handleMove}
              variant="overlay"
            />
          ) : null}
        </KanbanDragOverlay>
      </DndContext>
      <MonthlyArchive months={archive} isAdmin={isAdmin} />
    </div>
  );
}
