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
  collapsible?: boolean;
  defaultExpanded?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [expanded, setExpanded] = useState(defaultExpanded);
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
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/15 hover:border-white/30"
          >
            <span className="font-semibold">
              {label} · {tasks.length}
            </span>
            <ChevronDown
              className={cn('size-4 shrink-0 text-white/70 transition-transform duration-200', expanded && 'rotate-180')}
            />
          </button>
        </h2>
      ) : (
        <h2 className="text-sm font-semibold text-white px-1">
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
            className="flex flex-col gap-3 overflow-hidden"
          >
            {tasks.length === 0 ? (
              <p className="text-sm text-white/60 px-1 py-1">{emptyLabel}</p>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const TaskKanbanColumn = memo(TaskKanbanColumnImpl);

