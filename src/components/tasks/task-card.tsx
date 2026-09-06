'use client';

import { memo } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, GripVertical, Minus, Plus, Star } from 'lucide-react';
import { TaskStatusControl, type TaskStatus } from './task-status-control';
import { EditTaskDialog } from './edit-task-dialog';
import { DeleteTaskButton } from './delete-task-button';
import { TaskCommentsDrawer } from './task-comments-drawer';
import type { Assignee } from './assign-task-dialog';
import { Badge } from '@/components/ui/badge';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type Task = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  deadline: string;
  status: TaskStatus;
  is_overdue: boolean;
  assignee: { first_name: string; last_name: string } | null;
  /** The CEO who assigned this task. Optional only because the board's
   * snapshot mapping predates task comments — when it is absent the card
   * falls back to "assignee or CEO", and createTaskCommentAction re-checks
   * the assigner server-side either way. */
  assigned_by?: string | null;
  /** Server-rendered comment count for the closed drawer trigger. */
  comment_count?: number;
  /** Optional star bounty attached by the CEO. */
  star_reward?: number | null;
  /** Manual position inside this card's status column (ascending). The
   * board list already arrives sorted by it — see reorderTaskAction. */
  sort_order?: number;
};

function TaskCardImpl({
  task,
  isAdmin,
  assignees,
  currentUserId,
  onRequestDelete,
  onMove,
  dismissed = false,
  onToggleDismiss,
}: {
  task: Task;
  isAdmin: boolean;
  assignees: Assignee[];
  currentUserId: string;
  onRequestDelete: (task: Task) => void;
  /** Move this card one place up/down inside its own status column. */
  onMove: (task: Task, direction: 'up' | 'down') => void;
  /** Viewer-local "minimised" flag, from useDismissedTasks. */
  dismissed?: boolean;
  onToggleDismiss: (task: Task) => void;
}) {
  const t = useTranslations('tasks');
  const format = useFormatter();
  // Status is the assignee's own progress report — not even the admin who
  // assigned the task can drag it, mirroring protect_task_fields' DB-level
  // `auth.uid() <> new.assigned_to` check.
  const canDrag = task.assigned_to === currentUserId;
  // Spec #1: a task's thread belongs to the person who received it, the
  // person who assigned it, and the CEO (isAdmin here is exactly
  // `role === 'ceo'` — see tasks/page.tsx). This only decides whether the
  // composer is shown; createTaskCommentAction re-checks it server-side.
  const canComment =
    isAdmin || task.assigned_to === currentUserId || task.assigned_by === currentUserId;
  // Reordering is a board-arrangement action, not a progress report, so it
  // is open to both sides of the task — mirrors reorderTaskAction's
  // `assigned_by === user.id || assigned_to === user.id` check exactly (a
  // CEO who didn't assign the task can't see it on this board at all).
  const canReorder = task.assigned_to === currentUserId || task.assigned_by === currentUserId;
  // Conditional reset (spec 3d): a completed card is always shown in full,
  // never offers the minus button, and has its stored flag cleared by the
  // board — finishing a task undoes the viewer's "hide this for now".
  const isDone = task.status === 'done';
  const collapsed = dismissed && !isDone;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !canDrag,
  });

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
    >
      <motion.div
        layout={!isDragging}
        initial={{ opacity: 0, y: 14, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileHover={isDragging ? undefined : { scale: 1.015 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          GLASS_CARD,
          'flex flex-col gap-3',
          collapsed ? 'gap-2 p-4 opacity-60' : 'p-6',
          isDragging && 'opacity-40',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium">{task.title}</span>
          <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-1">
            {!collapsed && canReorder && (
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => onMove(task, 'up')}
                  aria-label={t('moveUp')}
                  className="rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(task, 'down')}
                  aria-label={t('moveDown')}
                  className="rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
            )}
            {/* No minus on a completed card — the whole point of the reset is
             * that finishing a task brings it back to its default look. */}
            {!isDone && (
              <button
                type="button"
                onClick={() => onToggleDismiss(task)}
                aria-pressed={collapsed}
                aria-label={collapsed ? t('restoreCard') : t('dismissCard')}
                className="rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
              >
                {collapsed ? <Plus className="size-4" /> : <Minus className="size-4" />}
              </button>
            )}
            {!collapsed && isAdmin && (
              <div className="flex gap-1">
                <EditTaskDialog
                  task={{
                    id: task.id,
                    title: task.title,
                    description: task.description,
                    assigned_to: task.assigned_to,
                    deadline: task.deadline,
                    star_reward: task.star_reward,
                  }}
                  assignees={assignees}
                />
                <DeleteTaskButton onConfirm={() => onRequestDelete(task)} />
              </div>
            )}
            {/* The drag handle survives collapsing: hiding it would take the
             * assignee's only way to change status away with it. */}
            {canDrag && (
              <button
                type="button"
                {...listeners}
                {...attributes}
                aria-label={t('dragHandle')}
                className="cursor-grab touch-none rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80 active:cursor-grabbing"
              >
                <GripVertical className="size-4" />
              </button>
            )}
          </div>
        </div>
        {!collapsed && task.description && (
          <p className="text-sm text-white/70">{task.description}</p>
        )}
        {!collapsed && (
          <div className="flex flex-col gap-1 text-xs text-white/60">
            {isAdmin && task.assignee && (
              <span>
                {task.assignee.first_name} {task.assignee.last_name}
              </span>
            )}
            <span
              className={cn(
                'flex items-center gap-1.5',
                task.is_overdue && 'font-semibold text-red-400',
              )}
            >
              {format.dateTime(new Date(task.deadline), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              {task.is_overdue && (
                <Badge variant="tint" tint="red" className="text-[10px] tracking-wide uppercase">
                  {t('overdue')}
                </Badge>
              )}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TaskStatusControl status={task.status} />
            {!collapsed && !!task.star_reward && task.star_reward > 0 && (
              <Badge variant="tint" tint="amber" className="text-xs font-semibold gap-1">
                <Star className="size-3 fill-amber-400 text-amber-400" />
                +{task.star_reward}
              </Badge>
            )}
          </div>
          {!collapsed && (
            <TaskCommentsDrawer
              taskId={task.id}
              taskTitle={task.title}
              currentUserId={currentUserId}
              canComment={canComment}
              commentCount={task.comment_count ?? 0}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}

export const TaskCard = memo(TaskCardImpl);
