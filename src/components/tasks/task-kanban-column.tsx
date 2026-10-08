'use client';

import { EmptyState } from '@/components/ui/empty-state';

import { memo, useState, ViewTransition } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { CheckCircle2, ChevronDown, CircleDashed, Hourglass, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TaskCard, type Task } from './task-card';
import type { Assignee } from './assign-task-dialog';
import type { BoardLane } from '@/lib/task-status';

/** Lane identity: icon + accent, so the four lanes read apart at a glance. */
const LANE_STYLE: Record<BoardLane, { icon: typeof CircleDashed; tone: string; bar: string }> = {
  pending: { icon: CircleDashed, tone: 'text-au-muted', bar: 'bg-au-chart-4' },
  in_progress: { icon: Loader, tone: 'text-au-info', bar: 'bg-au-info' },
  review: { icon: Hourglass, tone: 'text-au-accent-text', bar: 'bg-au-accent' },
  done: { icon: CheckCircle2, tone: 'text-au-ok', bar: 'bg-au-ok' },
};

function TaskKanbanColumnImpl({
  status,
  label,
  tasks,
  isAdmin,
  assignees,
  currentUserId,
  emptyLabel,
  onRequestDelete,
  previewTaskId = null,
  collapsible = true,
  defaultExpanded = true,
  onTimePct = null,
  footer,
}: {
  status: BoardLane;
  label: string;
  /** Share of this lane's open cards that are still on time (0–100); null hides the bar. */
  onTimePct?: number | null;
  /** Extra control under the cards (e.g. the done lane's "show all"). */
  footer?: React.ReactNode;
  tasks: Task[];
  isAdmin: boolean;
  assignees: Assignee[];
  currentUserId: string;
  emptyLabel: string;
  onRequestDelete: (task: Task) => void;
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
  const style = LANE_STYLE[status];
  const Icon = style.icon;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-3 rounded-2xl p-1.5 sm:p-2 transition-colors min-w-0 w-full overflow-hidden',
        isOver && 'bg-au-accent-soft/50 ring-2 ring-au-accent/60',
      )}
    >
      {collapsible ? (
        <h2>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className={cn(
              'group flex w-full min-w-0 flex-col gap-2 rounded-au-ctl border border-au-line bg-au-card px-3 pt-2.5 pb-2 text-sm text-au-ink transition-colors hover:border-au-faint hover:bg-au-card-2',
              status === 'review' && tasks.length > 0 && 'border-au-accent/40 bg-au-accent-soft/40',
            )}
          >
            <span className="flex w-full items-center gap-2">
              <Icon className={cn('size-4 shrink-0', style.tone)} strokeWidth={2} aria-hidden />
              <span className="truncate font-semibold">{label}</span>
              <span
                key={tasks.length}
                className={cn('lane-count ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums', status === 'review' && tasks.length > 0 ? 'bg-au-accent text-au-accent-ink' : 'bg-au-card-2 text-au-muted')}
              >
                {tasks.length}
              </span>
              <ChevronDown
                className={cn('size-4 shrink-0 text-au-muted transition-transform duration-200', expanded && 'rotate-180')}
              />
            </span>
            {onTimePct !== null && (
              <span className="block h-1 w-full overflow-hidden rounded-full bg-au-card-2" aria-hidden>
                <span
                  className={cn('block h-full origin-left rounded-full transition-transform duration-700 ease-out', style.bar)}
                  style={{ transform: `scaleX(${Math.max(0, Math.min(100, onTimePct)) / 100})` }}
                />
              </span>
            )}
          </button>
        </h2>
      ) : (
        <h2 className="text-sm font-semibold text-au-ink px-1 truncate">
          {label} ({tasks.length})
        </h2>
      )}

      <AnimatePresence initial={false}>
        {showCards && (
          <motion.div
            // Height only on the way in — no `opacity: 0` in `initial`. A
            // collapsed column that a drag-over auto-opens would otherwise
            // mount its cards at opacity 0, and if that animation stalls the
            // cards you are dragging onto are invisible. Expanding from
            // height 0 with opacity untouched can only ever under-reveal,
            // never hide. Opacity stays on `exit` (leaving is safe).
            initial={{ height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="flex flex-col gap-3 min-w-0 w-full overflow-hidden"
          >
            {tasks.length === 0 ? (
              <EmptyState compact title={emptyLabel} />
            ) : (
              tasks.map((task) => (
                // Each card is its own view transition: when the board changes
                // inside startTransition (delete / undo), removed cards shrink
                // out and the rest glide into place (#7, motion-v4.css).
                <ViewTransition key={task.id} enter="card-in" exit="card-out" update="card-move" default="none">
                <TaskCard
                  task={task}
                  isAdmin={isAdmin}
                  assignees={assignees}
                  currentUserId={currentUserId}
                  onRequestDelete={onRequestDelete}
                  variant={task.id === previewTaskId ? 'preview' : 'default'}
                />
                </ViewTransition>
              ))
            )}
            {footer}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const TaskKanbanColumn = memo(TaskKanbanColumnImpl);
