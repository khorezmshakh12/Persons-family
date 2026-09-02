'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  updateTaskStatusAction,
  deleteTaskAction,
  getVisibleTasksAction,
  type MonthlyTaskArchiveEntry,
  type VisibleTaskRow,
} from '@/lib/actions/tasks';
import { ensureRealtimeSignedIn, getRealtimeDb } from '@/lib/firebase/client';
import { TaskKanbanColumn } from './task-kanban-column';
import { MonthlyArchive } from './monthly-archive';
import type { Task } from './task-card';
import type { Assignee } from './assign-task-dialog';
import type { TaskStatus } from './task-status-control';

const COLUMNS: TaskStatus[] = ['pending', 'in_progress', 'done'];

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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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
        star_reward: row.star_reward ?? 0,
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const nextStatus = over.id as TaskStatus;
    const current = tasks.find((task) => task.id === taskId);
    if (!current || current.status === nextStatus) return;

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
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
          {COLUMNS.map((status) => (
            <TaskKanbanColumn
              key={status}
              status={status}
              label={t(`columns.${status}`)}
              tasks={tasks.filter((task) => task.status === status)}
              isAdmin={isAdmin}
              assignees={assignees}
              currentUserId={currentUserId}
              emptyLabel={t('noTasks')}
              onRequestDelete={handleRequestDelete}
              collapsible={true}
              defaultExpanded={status !== 'done'}
            />
          ))}
        </div>
      </DndContext>
      <MonthlyArchive months={archive} isAdmin={isAdmin} />
    </div>
  );
}
