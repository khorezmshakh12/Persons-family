'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { updateTaskStatusAction, deleteTaskAction } from '@/lib/actions/tasks';
import { TaskKanbanColumn } from './task-kanban-column';
import type { Task } from './task-card';
import type { Assignee } from './assign-task-dialog';
import type { TaskStatus } from './task-status-control';

const COLUMNS: TaskStatus[] = ['pending', 'in_progress', 'done'];

export function TaskBoard({
  tasks: initialTasks,
  isAdmin,
  assignees,
}: {
  tasks: Task[];
  isAdmin: boolean;
  assignees: Assignee[];
}) {
  const t = useTranslations('tasks');
  const [tasks, setTasks] = useState(initialTasks);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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
