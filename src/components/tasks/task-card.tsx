'use client';

import { StarIcon } from '@/components/ui/star-icon';
import { memo, useState } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { useDraggable } from '@dnd-kit/core';
import { motion, useReducedMotion } from 'framer-motion';
import {
  CalendarClock,
  ChevronDown,
  GripVertical,
  Hourglass,
  Minus,
  ExternalLink,
  Undo2,
} from 'lucide-react';
import { TaskStatusControl } from './task-status-control';
import { EditTaskDialog } from './edit-task-dialog';
import { DeleteTaskButton } from './delete-task-button';
import { TaskCommentsDrawer } from './task-comments-drawer';
import { TaskAttachmentsDrawer } from './task-attachments-drawer';
import { TaskStageActions } from './task-stage-actions';
import { TaskStageProgress } from './task-stage-progress';
import { TaskCountdown } from './task-countdown';
import type { Assignee } from './assign-task-dialog';
import { Badge } from '@/components/ui/badge';
import { SURFACE_CARD } from '@/lib/glass';
import { useNowTicker } from '@/lib/use-now-ticker';
import { isTaskUnderReview, type TaskStatus } from '@/lib/task-status';
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
  /** Mirrored from a Strategy task — shown with a small badge. */
  from_strategy?: boolean;
  /** Same idea for the attachments drawer. */
  attachment_count?: number;
  /** The CEO ticked "the employee must upload a file" — approval routes this
   * task through `awaiting_upload` instead of straight to `done`. */
  requires_proof?: boolean;
  /** The CEO's mandatory explanation from the last rejection. Shown to the
   * assignee until they resubmit (submitTaskAction clears it). */
  rejection_reason?: string | null;
  /** Optional star bounty attached by the CEO, paid out when the task is
   * completed on time. */
  star_reward?: number | null;
  /** Optional star fine attached by the CEO, deducted instead of the reward
   * when the task is completed after its deadline. */
  star_penalty?: number | null;
  /** Insert time — every column now orders newest-first by date (see
   * TaskBoard), so the oldest work sinks to the bottom. */
  created_at?: string;
  /** Stamped once, in finalizeTaskDone — null until the CEO actually
   * approves. Drives the done column's date ordering (see TaskBoard). */
  completed_at?: string | null;
  /** Stamped in transitionToSubmitted; the done column's ordering fallback
   * for a card that's `submitted`/`awaiting_upload` (handed in, but not yet
   * approved, so it has no completed_at yet but still lives in that
   * column — see TaskBoard's boardColumnFor). */
  submitted_at?: string | null;
};

/** Render text with auto-detected URLs as clickable, breakable external links. */
function FormattedDescription({ text }: { text: string }) {
  const urlPattern = /(https?:\/\/[^\s]+)/;
  const parts = text.split(new RegExp(urlPattern.source, 'g'));

  return (
    <>
      {parts.map((part, i) => {
        if (urlPattern.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 font-medium text-au-info underline underline-offset-2 break-all"
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

/**
 * - `default` — the card sitting in its own status column.
 * - `preview` — the *provisional* placement rendered inside the column the
 *   pointer is currently over, before the drop actually happens. Still the
 *   real draggable (same id, so dnd-kit keeps a mounted active node the whole
 *   drag), just drawn as a dashed placeholder.
 * - `overlay` — the copy inside `<DragOverlay>` that follows the cursor.
 */
export type TaskCardVariant = 'default' | 'preview' | 'overlay';

function TaskCardImpl({
  task,
  isAdmin,
  assignees,
  currentUserId,
  onRequestDelete,
  variant = 'default',
}: {
  task: Task;
  isAdmin: boolean;
  assignees: Assignee[];
  currentUserId: string;
  onRequestDelete: (task: Task) => void;
  variant?: TaskCardVariant;
}) {
  const t = useTranslations('tasks');
  const format = useFormatter();
  const [isExpanded, setIsExpanded] = useState(false);
  const isOverlay = variant === 'overlay';
  const isPreview = variant === 'preview';
  // The only motion on this card is drag-time (the `layout` reflow when the
  // provisional placement moves it between columns) and pointer-time (hover
  // scale). Both are transform-only sugar, so under `prefers-reduced-motion`
  // they are simply dropped — the card, and the drag preview's placement,
  // stay exactly where they are. Nothing here gates visibility either way.
  const reduceMotion = useReducedMotion();

  // Status is the assignee's own progress report — not even the admin who
  // assigned the task can drag it, mirroring protect_task_fields' DB-level
  // `auth.uid() <> new.assigned_to` check.
  //
  // A task under review (`submitted` / `awaiting_upload`) is frozen: the
  // assignee has handed it in and only the CEO's approve/reject — or the
  // proof upload — moves it from here. updateTaskStatusAction rejects such a
  // drag with `underReview`; not registering the handle at all is the same
  // rule stated where the user can see it.
  const underReview = isTaskUnderReview(task.status);
  // `done` is frozen too: only the CEO's approval puts a card there, and the
  // assignee must not be able to drag it back out (updateTaskStatusAction
  // rejects that with `invalidTransition`).
  const canDrag = task.assigned_to === currentUserId && !underReview && task.status !== 'done';
  const isAssignee = task.assigned_to === currentUserId;
  // The CEO who assigned it. `assigned_by` is optional on this type (the
  // board's older snapshot mapping predates it), so a missing value falls
  // back to the plain admin flag — every review action re-checks both the
  // role and `assigned_by` server-side regardless.
  const isReviewer = task.assigned_by ? task.assigned_by === currentUserId : isAdmin;
  // Rejections are addressed to the assignee, so the banner is theirs; the
  // CEO already knows what they wrote. Cleared on resubmit.
  const showRejection = !!task.rejection_reason && isAssignee && task.status === 'in_progress';
  // Spec #1: a task's thread belongs to the person who received it, the
  // person who assigned it, and the CEO (isAdmin here is exactly
  // `role === 'ceo'` — see tasks/page.tsx). This only decides whether the
  // composer is shown; createTaskCommentAction re-checks it server-side.
  const canComment =
    isAdmin || task.assigned_to === currentUserId || task.assigned_by === currentUserId;
  // The overlay copy must never register under the real card's id — that
  // would be a second draggable for the same task — so it takes a suffixed,
  // permanently disabled registration instead.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: isOverlay ? `${task.id}__overlay` : task.id,
    disabled: !canDrag || isOverlay,
  });

  // Urgency drives the left stripe and the deadline chip: overdue (red),
  // due within 24h (apricot, breathing), under review (blue), done (green).
  const now = useNowTicker();
  const open = task.status === 'pending' || task.status === 'in_progress';
  // null until mounted (SSR has no clock) — urgency then falls back to the server's is_overdue.
  const msLeft = now === null ? Infinity : new Date(task.deadline).getTime() - now;
  const overdue = open && (task.is_overdue || msLeft < 0);
  const dueSoon = open && !overdue && msLeft < 24 * 3600_000;
  const stripe = overdue
    ? 'bg-au-bad'
    : dueSoon
      ? 'bg-au-accent'
      : underReview
        ? 'bg-au-info'
        : task.status === 'done'
          ? 'bg-au-ok'
          : 'bg-transparent';
  // How long the CEO has had it: amber after a day, red (and ringing) after two.
  const waitHours = underReview && task.submitted_at && now !== null ? Math.max(0, Math.floor((now - new Date(task.submitted_at).getTime()) / 3600_000)) : null;
  const initials = task.assignee ? `${task.assignee.first_name[0] ?? ''}${task.assignee.last_name[0] ?? ''}` : '';

  const isLongDescription =
    !!task.description && (task.description.length > 90 || task.description.includes('\n'));

  return (
    // No transform here on purpose: the <DragOverlay> copy is what follows the
    // cursor, so translating this node too would show the card twice.
    <div ref={setNodeRef} className="w-full min-w-0 max-w-full">
      <motion.div
        layout={!reduceMotion && !isDragging && !isOverlay}
        initial={false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileHover={reduceMotion || isDragging || isOverlay ? undefined : { y: -2 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        data-task-card={isOverlay ? undefined : task.id}
        data-task-lane={underReview ? 'review' : task.status}
        tabIndex={isOverlay ? -1 : 0}
        className={cn(
          SURFACE_CARD,
          'group/card relative flex w-full max-w-full min-w-0 flex-col gap-3 overflow-hidden break-words p-4 pl-5 transition-shadow hover:shadow-au-card-hover focus-visible:ring-2 focus-visible:ring-au-accent focus-visible:outline-none',
          isDragging && !isPreview && 'opacity-40',
          isPreview && 'border-2 border-dashed border-au-accent/60 opacity-60',
          // The lift is elevation-only on purpose — no scale/rotate. The
          // overlay has to stay the exact size of the card it will land on,
          // otherwise the drop animation (which glides the overlay onto the
          // real card's rect) ends with a visible size pop.
          isOverlay && 'm-lift cursor-grabbing bg-au-card-2 shadow-2xl ring-2 ring-au-accent/50',
        )}
      >
        <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px] transition-colors', stripe)} />
        {/* Card Header: Title + Action Buttons */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <span className="min-w-0 flex-1 text-[14.5px] leading-snug font-semibold text-au-ink break-words [overflow-wrap:anywhere]">
            {task.from_strategy && (
              <span className="mr-1.5 inline-flex translate-y-[-1px] items-center rounded-full bg-au-accent-soft px-1.5 py-0.5 align-middle text-[10px] font-bold text-au-accent-text">
                🎯 Strategiya
              </span>
            )}
            {task.title}
          </span>
          <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-1">
            {/* Edit/delete only on tasks this person handed out — a team lead
                also sees tasks their own boss gave them. */}
            {isAdmin && isReviewer && (
              <div className="flex items-center gap-1 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/card:opacity-100 [@media(hover:hover)]:group-hover/card:opacity-100">
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
                className="cursor-grab touch-none rounded p-1 text-au-muted hover:bg-au-card-2 hover:text-au-ink active:cursor-grabbing"
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
                'text-sm text-au-ink whitespace-pre-wrap break-words break-all [overflow-wrap:anywhere] leading-relaxed select-text',
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
                className="mt-1.5 self-start inline-flex items-center gap-1 text-xs font-semibold text-au-accent-text hover:underline"
              >
                <span>{isExpanded ? t('showLess') : t('showMore')}</span>
                <ChevronDown
                  className={cn('size-3.5 transition-transform duration-200', isExpanded && 'rotate-180')}
                />
              </button>
            )}
          </div>
        )}

        {/* Assignee & deadline */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-au-muted">
          {isAdmin && task.assignee && (
            <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-au-ink">
              <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-au-card-2 text-[10px] font-bold text-au-muted uppercase">
                {initials}
              </span>
              <span className="truncate">
                {task.assignee.first_name} {task.assignee.last_name}
              </span>
            </span>
          )}
          <span
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-md px-2 font-semibold tabular-nums',
              overdue ? 'bg-au-bad-soft text-au-bad' : dueSoon ? 'ms-breathe bg-au-accent-soft text-au-accent-text' : 'bg-au-card-2 text-au-muted',
            )}
          >
            <CalendarClock className="size-3.5" aria-hidden />
            {format.dateTime(new Date(task.deadline), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
          {overdue && (
            <Badge variant="tint" tint="red" className="px-1.5 py-0.5 text-[10px] tracking-wide uppercase">
              {t('overdue')}
            </Badge>
          )}
          {/* Live time-to-deadline (one shared 1s ticker for the whole
           * board — see lib/use-now-ticker). The drag overlay is a copy
           * of this card, so it skips the chip rather than tick twice. */}
          {!isOverlay && open && (
            <TaskCountdown deadline={task.deadline} completedAt={task.completed_at} status={task.status} />
          )}
          {waitHours !== null && (
            <span
              className={cn(
                'inline-flex h-6 items-center gap-1 rounded-md px-2 font-semibold',
                waitHours >= 48 ? 'ms-alarm bg-au-bad-soft text-au-bad' : waitHours >= 24 ? 'bg-au-accent-soft text-au-accent-text' : 'bg-au-info-soft text-au-info',
              )}
            >
              <Hourglass className="size-3.5" aria-hidden />
              {t('waiting', { hours: waitHours })}
            </span>
          )}
        </div>

        {/* Rejection banner: the CEO's reason from the last rejection,
         * shown to the assignee until they resubmit (submitTaskAction
         * clears rejection_reason on resubmit, which is what retires this). */}
        {showRejection && (
          <div className="flex items-start gap-2 rounded-au-ctl border border-au-bad/30 bg-au-bad-soft px-3 py-2 text-xs text-au-bad">
            <Undo2 className="mt-0.5 size-3.5 shrink-0" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold">{t('rejectionReason')}</span>
              <span className="whitespace-pre-wrap break-words">
                {task.rejection_reason}
              </span>
            </div>
          </div>
        )}

        {/* Lifecycle rail, always shown, and whichever single action this
         * side of the workflow can take right now (submit / approve-reject /
         * upload-proof / "waiting on the CEO") — see TaskStageActions,
         * which renders nothing once there is no action left to take. */}
        <TaskStageProgress status={task.status} />
        <TaskStageActions
          taskId={task.id}
          status={task.status}
          requiresProof={!!task.requires_proof}
          isAssignee={isAssignee}
          isReviewer={isReviewer}
        />

        {/* Footer: Status, Stars, and Comments */}
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0 pt-1 border-t border-au-line">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <TaskStatusControl status={task.status} />
            {!!task.star_reward && task.star_reward > 0 && (
              <Badge variant="tint" tint="amber" className="text-xs font-semibold gap-1">
                <StarIcon className="size-3 text-amber-600" />
                +{task.star_reward}
              </Badge>
            )}
            {/* The fine that replaces the bounty when the task is finished
             * late — see updateTaskStatusAction's on-time/late split. */}
            {!!task.star_penalty && task.star_penalty > 0 && (
              <Badge variant="tint" tint="red" className="text-xs font-semibold gap-1">
                <Minus className="size-3 text-red-600" />
                {task.star_penalty}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <TaskAttachmentsDrawer
              taskId={task.id}
              taskTitle={task.title}
              currentUserId={currentUserId}
              canManage={isAssignee || isReviewer}
              attachmentCount={task.attachment_count ?? 0}
            />
            <TaskCommentsDrawer
              taskId={task.id}
              taskTitle={task.title}
              currentUserId={currentUserId}
              canComment={canComment}
              commentCount={task.comment_count ?? 0}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export const TaskCard = memo(TaskCardImpl);
