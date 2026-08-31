'use client';

import { memo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown } from 'lucide-react';
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
  currentUserId,
  emptyLabel,
  onRequestDelete,
  collapsible = false,
}: {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  isAdmin: boolean;
  assignees: Assignee[];
  currentUserId: string;
  emptyLabel: string;
  onRequestDelete: (task: Task) => void;
  /** Done column only: every card folds into the one "label · N" header
   * (spec #5) so a month of completed work can't bury the active columns.
   * The column stays a drop target while collapsed — dropping a card in
   * just bumps the count. */
  collapsible?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [expanded, setExpanded] = useState(false);
  const showCards = !collapsible || expanded;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-3 rounded-2xl p-2 transition-colors',
        isOver && 'bg-white/10 ring-2 ring-white/40',
      )}
    >
      {collapsible ? (
        <h2>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
          >
            <span>
              {label} · {tasks.length}
            </span>
            <ChevronDown
              className={cn('size-4 shrink-0 transition-transform', expanded && 'rotate-180')}
            />
          </button>
        </h2>
      ) : (
        <h2 className="text-sm font-medium text-white">
          {label} ({tasks.length})
        </h2>
      )}
      {showCards && (
        <div className="flex flex-col gap-3">
          {tasks.length === 0 ? (
            <p className="text-sm text-white/60">{emptyLabel}</p>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isAdmin={isAdmin}
                assignees={assignees}
                currentUserId={currentUserId}
                onRequestDelete={onRequestDelete}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export const TaskKanbanColumn = memo(TaskKanbanColumnImpl);
