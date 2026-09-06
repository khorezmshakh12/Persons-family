'use client';

import { memo, useState } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, GripVertical, Minus, Star, ExternalLink } from 'lucide-react';
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
  /** Optional star bounty attached by the CEO, paid out when the task is
   * completed on time. */
  star_reward?: number | null;
  /** Optional star fine attached by the CEO, deducted instead of the reward
   * when the task is completed after its deadline. */
  star_penalty?: number | null;
  /** Manual position inside this card's status column (ascending). The
   * board list already arrives sorted by it — see reorderTaskAction. */
  sort_order?: number;
};

/** Render text with auto-detected URLs as clickable, breakable external links. */
function FormattedDescription({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return (
    <>
      {parts.map((part, i) => {
        if (urlRegex.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 font-medium text-sky-300 underline underline-offset-2 transition-colors hover:text-sky-200 break-all"
            >
              <span>{part}</span>
              <ExternalLink className="size-3 shrink-0 inline opacity-70" />
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function TaskCardImpl({
  task,
  isAdmin,
  assignees,
  currentUserId,
  onRequestDelete,
  onMove,
}: {
  task: Task;
  isAdmin: boolean;
  assignees: Assignee[];
  currentUserId: string;
  onRequestDelete: (task: Task) => void;
  /** Move this card one place up/down inside its own status column. */
  onMove: (task: Task, direction: 'up' | 'down') => void;
}) {
  const t = useTranslations('tasks');
  const format = useFormatter();
  const [isExpanded, setIsExpanded] = useState(false);

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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !canDrag,
  });

  const isLongDescription =
    !!task.description && (task.description.length > 90 || task.description.includes('\n'));

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      className="w-full min-w-0 max-w-full"
    >
      <motion.div
        layout={!isDragging}
        initial={{ opacity: 0, y: 14, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileHover={isDragging ? undefined : { scale: 1.01 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          GLASS_CARD,
          'flex flex-col gap-3 p-4 sm:p-5 w-full min-w-0 max-w-full overflow-hidden break-words rounded-2xl shadow-lg border border-white/15',
          isDragging && 'opacity-40',
        )}
      >
        {/* Card Header: Title + Action Buttons */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <span className="min-w-0 flex-1 font-semibold text-white leading-snug break-words [overflow-wrap:anywhere] text-sm sm:text-base">
            {task.title}
          </span>
          <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-1">
            {canReorder && (
              <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
                <button
                  type="button"
                  onClick={() => onMove(task, 'up')}
                  aria-label={t('moveUp')}
                  className="rounded p-1 text-white/50 transition-colors hover:bg-white/15 hover:text-white"
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(task, 'down')}
                  aria-label={t('moveDown')}
                  className="rounded p-1 text-white/50 transition-colors hover:bg-white/15 hover:text-white"
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </div>
            )}
            {isAdmin && (
              <div className="flex items-center gap-1">
                <EditTaskDialog
                  task={{
                    id: task.id,
                    title: task.title,
                    description: task.description,
                    assigned_to: task.assigned_to,
                    deadline: task.deadline,
                    star_reward: task.star_reward,
                    star_penalty: task.star_penalty,
                  }}
                  assignees={assignees}
                />
                <DeleteTaskButton onConfirm={() => onRequestDelete(task)} />
              </div>
            )}
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

        {/* Card Description: Collapsible with formatted links and strict overflow wrap */}
        {task.description && (
          <div className="flex flex-col min-w-0 w-full">
            <div
              className={cn(
                'text-sm text-white/80 whitespace-pre-wrap break-words break-all [overflow-wrap:anywhere] leading-relaxed select-text',
                isLongDescription && !isExpanded && 'line-clamp-2 sm:line-clamp-3',
              )}
            >
              <FormattedDescription text={task.description} />
            </div>
            {isLongDescription && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="mt-1.5 self-start inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <span>{isExpanded ? t('showLess') : t('showMore')}</span>
                <ChevronDown
                  className={cn('size-3.5 transition-transform duration-200', isExpanded && 'rotate-180')}
                />
              </button>
            )}
          </div>
        )}

        {/* Assignee & Deadline */}
        <div className="flex flex-col gap-1 text-xs text-white/60 min-w-0">
          {isAdmin && task.assignee && (
            <span className="truncate font-medium text-white/75">
              {task.assignee.first_name} {task.assignee.last_name}
            </span>
          )}
          <span
            className={cn(
              'flex items-center gap-1.5 flex-wrap',
              task.is_overdue && 'font-semibold text-red-400',
            )}
          >
            <span>
              {format.dateTime(new Date(task.deadline), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
            {task.is_overdue && (
              <Badge variant="tint" tint="red" className="text-[10px] tracking-wide uppercase px-1.5 py-0.5">
                {t('overdue')}
              </Badge>
            )}
          </span>
        </div>

        {/* Footer: Status, Stars, and Comments */}
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0 pt-1 border-t border-white/10">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <TaskStatusControl status={task.status} />
            {!!task.star_reward && task.star_reward > 0 && (
              <Badge variant="tint" tint="amber" className="text-xs font-semibold gap-1">
                <Star className="size-3 fill-amber-400 text-amber-400" />
                +{task.star_reward}
              </Badge>
            )}
            {/* The fine that replaces the bounty when the task is finished
             * late — see updateTaskStatusAction's on-time/late split. */}
            {!!task.star_penalty && task.star_penalty > 0 && (
              <Badge variant="tint" tint="red" className="text-xs font-semibold gap-1">
                <Minus className="size-3 text-red-400" />
                {task.star_penalty}
              </Badge>
            )}
          </div>
          <TaskCommentsDrawer
            taskId={task.id}
            taskTitle={task.title}
            currentUserId={currentUserId}
            canComment={canComment}
            commentCount={task.comment_count ?? 0}
          />
        </div>
      </motion.div>
    </div>
  );
}

export const TaskCard = memo(TaskCardImpl);
