'use client';

import { memo } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { TaskStatusControl, type TaskStatus } from './task-status-control';
import { EditTaskDialog } from './edit-task-dialog';
import { DeleteTaskButton } from './delete-task-button';
import type { Assignee } from './assign-task-dialog';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type Task = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  due_date: string | null;
  status: TaskStatus;
  assignee: { first_name: string; last_name: string } | null;
};

function TaskCardImpl({
  task,
  isAdmin,
  assignees,
  onRequestDelete,
}: {
  task: Task;
  isAdmin: boolean;
  assignees: Assignee[];
  onRequestDelete: (task: Task) => void;
}) {
  const t = useTranslations('tasks');
  const format = useFormatter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });

  return (
    <div ref={setNodeRef} style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}>
      <motion.div
        whileHover={isDragging ? undefined : { scale: 1.015 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(GLASS_CARD, 'flex flex-col gap-3 p-6', isDragging && 'opacity-40')}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium">{task.title}</span>
          <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-1">
            {isAdmin && (
              <div className="flex gap-1">
                <EditTaskDialog
                  task={{
                    id: task.id,
                    title: task.title,
                    description: task.description,
                    assigned_to: task.assigned_to,
                    due_date: task.due_date,
                  }}
                  assignees={assignees}
                />
                <DeleteTaskButton onConfirm={() => onRequestDelete(task)} />
              </div>
            )}
            <button
              type="button"
              {...listeners}
              {...attributes}
              aria-label={t('dragHandle')}
              className="cursor-grab touch-none rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80 active:cursor-grabbing"
            >
              <GripVertical className="size-4" />
            </button>
          </div>
        </div>
        {task.description && <p className="text-sm text-white/70">{task.description}</p>}
        <div className="flex flex-col gap-1 text-xs text-white/60">
          {isAdmin && task.assignee && (
            <span>
              {task.assignee.first_name} {task.assignee.last_name}
            </span>
          )}
          <span>
            {task.due_date
              ? format.dateTime(new Date(`${task.due_date}T00:00:00Z`), {
                  dateStyle: 'medium',
                  timeZone: 'UTC',
                })
              : t('noDueDate')}
          </span>
        </div>
        <TaskStatusControl status={task.status} />
      </motion.div>
    </div>
  );
}

export const TaskCard = memo(TaskCardImpl);
