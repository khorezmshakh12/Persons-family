'use client';

import { memo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  onMove,
  previewTaskId = null,
  collapsible = true,
  defaultExpanded = true,
}: {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  isAdmin: boolean;
  assignees: Assignee[];
  currentUserId: string;
  emptyLabel: string;
  onRequestDelete: (task: Task) => void;
  /** Move a card one place up/down within this column (see TaskBoard). */
  onMove: (task: Task, direction: 'up' | 'down') => void;
  /** Id of the card this column is only *provisionally* holding, because a
   * drag is hovering here and hasn't been dropped yet. Non-null on exactly
   * one column at a time — and it's the prop that lets `memo` know the
   * hovered column has to re-render mid-drag. */
  previewTaskId?: string | null;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [expanded, setExpanded] = useState(defaultExpanded);

  // A collapsed column still accepts a drop, but the drop would land out of
  // sight — so a card hovering here opens it, and it stays open so the card
  // is still visible once the drop lands. This is React's "adjust state
  // while rendering" pattern rather than an effect: it converges in one
  // extra render (the guard is false as soon as `expanded` is true) instead
  // of painting the collapsed column first and cascading a second commit.
  // The header toggle keeps working exactly as before — `isOver` is only
  // ever true mid-drag, when the button can't be clicked anyway.
  if (isOver && !expanded) setExpanded(true);

  const showCards = !collapsible || expanded;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-3 rounded-2xl p-1.5 sm:p-2 transition-colors min-w-0 w-full overflow-hidden',
        isOver && 'bg-white/10 ring-2 ring-white/40',
      )}
    >
      {collapsible ? (
        <h2>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/15 hover:border-white/30 min-w-0"
          >
            <span className="font-semibold truncate">
              {label} · {tasks.length}
            </span>
            <ChevronDown
              className={cn('size-4 shrink-0 text-white/70 transition-transform duration-200', expanded && 'rotate-180')}
            />
          </button>
        </h2>
      ) : (
        <h2 className="text-sm font-semibold text-white px-1 truncate">
          {label} ({tasks.length})
        </h2>
      )}

      <AnimatePresence initial={false}>
        {showCards && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="flex flex-col gap-3 min-w-0 w-full overflow-hidden"
          >
            {tasks.length === 0 ? (
              <p className="text-sm text-white/60 px-2 py-2">{emptyLabel}</p>
            ) : (
              tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isAdmin={isAdmin}
                  assignees={assignees}
                  currentUserId={currentUserId}
                  onRequestDelete={onRequestDelete}
                  onMove={onMove}
                  variant={task.id === previewTaskId ? 'preview' : 'default'}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const TaskKanbanColumn = memo(TaskKanbanColumnImpl);
