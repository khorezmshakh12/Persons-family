'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { updateTaskStatusAction, deleteTaskAction } from '@/lib/actions/tasks';
import { createClient } from '@/lib/supabase/client';
import { TaskKanbanColumn } from './task-kanban-column';
import type { Task } from './task-card';
import type { Assignee } from './assign-task-dialog';
import type { TaskStatus } from './task-status-control';

const COLUMNS: TaskStatus[] = ['pending', 'in_progress', 'done'];

type RawTaskRow = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  deadline: string;
  status: TaskStatus;
};

export function TaskBoard({
  tasks: initialTasks,
  isAdmin,
  assignees,
  currentUserId,
}: {
  tasks: Task[];
  isAdmin: boolean;
  assignees: Assignee[];
  currentUserId: string;
}) {
  const t = useTranslations('tasks');
  const [tasks, setTasks] = useState(initialTasks);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Board used to only reflect the viewer's own drag/delete actions — a task
  // someone else assigned (or reassigned/updated) while this page was open
  // never appeared until a manual refresh. RLS's tasks_select already scopes
  // Realtime delivery to rows this user may see (creator or assignee, same
  // as the server query above), so subscribing with no extra filter and
  // trusting that — mirrors chat-hub-client.tsx's own realtime pattern —
  // is enough; the sender_id/receiver_id-style guard below is just belt and
  // suspenders in case a row for someone else's task ever slips through.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    function toTask(row: RawTaskRow): Task {
      const assignee = assignees.find((a) => a.id === row.assigned_to);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        assigned_to: row.assigned_to,
        deadline: row.deadline,
        status: row.status,
        is_overdue: row.status !== 'done' && new Date(row.deadline).getTime() < Date.now(),
        assignee: assignee ? { first_name: assignee.first_name, last_name: assignee.last_name } : null,
      };
    }

    function isVisible(row: RawTaskRow) {
      return row.assigned_to === currentUserId || row.assigned_by === currentUserId;
    }

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel('task_board')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, (payload) => {
          const row = payload.new as RawTaskRow;
          if (!isVisible(row)) return;
          setTasks((prev) => (prev.some((task) => task.id === row.id) ? prev : [toTask(row), ...prev]));
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, (payload) => {
          const row = payload.new as RawTaskRow;
          setTasks((prev) => {
            if (!isVisible(row)) return prev.filter((task) => task.id !== row.id);
            const next = toTask(row);
            return prev.some((task) => task.id === row.id)
              ? prev.map((task) => (task.id === row.id ? next : task))
              : [next, ...prev];
          });
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setTasks((prev) => prev.filter((task) => task.id !== deletedId));
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
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
  // — before the Supabase delete() mutation is even awaited — which is what
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
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((status) => (
          <TaskKanbanColumn
            key={status}
            status={status}
            label={t(`columns.${status}`)}
            tasks={tasks.filter((task) => task.status === status)}
            isAdmin={isAdmin}
            assignees={assignees}
            emptyLabel={t('noTasks')}
            onRequestDelete={handleRequestDelete}
          />
        ))}
      </div>
    </DndContext>
  );
}
