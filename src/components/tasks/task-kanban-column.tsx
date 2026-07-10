'use client';

import { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { TaskCard, type Task } from './task-card';
import type { Assignee } from './assign-task-dialog';
import type { TaskStatus } from './task-status-control';

function TaskKanbanColumnImpl({
  status,
  label,
  tasks,
  isAdmin,
  assignees,
  emptyLabel,
}: {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  isAdmin: boolean;
  assignees: Assignee[];
  emptyLabel: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-3 rounded-2xl p-2 transition-colors',
        isOver && 'bg-teal-400/10 ring-2 ring-teal-300/40',
      )}
    >
      <h2 className="text-sm font-medium text-white">
        {label} ({tasks.length})
      </h2>
      <div className="flex flex-col gap-3">
        {tasks.length === 0 ? (
          <p className="text-sm text-white/60">{emptyLabel}</p>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} isAdmin={isAdmin} assignees={assignees} />
          ))
        )}
      </div>
    </div>
  );
}

export const TaskKanbanColumn = memo(TaskKanbanColumnImpl);
