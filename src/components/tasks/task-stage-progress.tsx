'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { TaskStatus } from '@/lib/task-status';

/**
 * The task's position in the lifecycle, as a four-beat rail:
 *
 *   in progress ─ submitted ─ approved / awaiting upload ─ done
 *
 * `pending` and `in_progress` share the first beat (the card is with the
 * assignee), `submitted` the second, `awaiting_upload` the third, and `done`
 * lights all four.
 *
 * ### Motion rules this component obeys
 *
 * Everything here animates **only** things that are already visible:
 *  - the filled bar's `scaleX` grows from whatever it currently is to its new
 *    value. It is never mounted at 0 opacity, and `initial={false}` means the
 *    very first paint jumps straight to the correct width rather than playing
 *    an entrance. A stalled animation can only leave the bar *short*, never
 *    leave the card blank.
 *  - the celebration sparks are an `aria-hidden`, `pointer-events-none`
 *    overlay that exists for ~1.1s after a genuine transition into `done` and
 *    then unmounts. Nothing underneath them depends on them.
 *  - `prefers-reduced-motion` drops both to a plain, instantly-correct render.
 *
 * This is the shape the repo settled on after the entrance-animation bug that
 * could strand cards invisible: no resting state is ever hidden.
 */

const STAGES = ['in_progress', 'submitted', 'approved', 'done'] as const;
type Stage = (typeof STAGES)[number];

const STAGE_INDEX: Record<TaskStatus, number> = {
  pending: 0,
  in_progress: 0,
  submitted: 1,
  awaiting_upload: 2,
  done: 3,
};

/** Six sparks on a ring, as fixed offsets — deterministic, so server and
 * client render the same thing and nothing reads a clock during render. */
const SPARKS = [
  { x: 0, y: -14 },
  { x: 13, y: -7 },
  { x: 13, y: 7 },
  { x: 0, y: 14 },
  { x: -13, y: 7 },
  { x: -13, y: -7 },
];

export function TaskStageProgress({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  const t = useTranslations('tasks');
  const reduceMotion = useReducedMotion();
  const activeIndex = STAGE_INDEX[status];
  const isDone = status === 'done';

  // A gentle celebratory beat the first time this card *becomes* done while
  // mounted. A card that was already done when it mounted gets nothing —
  // otherwise every board refresh would re-fire confetti at the whole
  // done column.
  const previousStatus = useRef<TaskStatus>(status);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    const justFinished = previousStatus.current !== 'done' && status === 'done';
    previousStatus.current = status;
    if (!justFinished || reduceMotion) return;

    setCelebrating(true);
    const timer = setTimeout(() => setCelebrating(false), 1100);
    return () => clearTimeout(timer);
    // Depends on `status` alone: a status that doesn't change cannot re-arm
    // this, and nothing in here calls a Server Action or router.refresh().
  }, [status, reduceMotion]);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className="flex items-center gap-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STAGES.length}
        aria-valuenow={activeIndex + 1}
        aria-valuetext={t(`stages.${STAGES[activeIndex] as Stage}`)}
      >
        {STAGES.map((stage, index) => {
          const reached = index <= activeIndex;
          return (
            <div
              key={stage}
              className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/15"
            >
              {/* Always mounted, always opaque — only the horizontal scale
               * moves. `originX: 0` makes it grow left-to-right. */}
              <motion.div
                initial={false}
                animate={{ scaleX: reached ? 1 : 0 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 220, damping: 28, delay: reached ? index * 0.05 : 0 }
                }
                style={{ originX: 0 }}
                className={cn(
                  'absolute inset-0 rounded-full',
                  isDone ? 'bg-emerald-400' : 'bg-sky-400',
                )}
              />
            </div>
          );
        })}
      </div>

      <div className="relative flex items-center gap-1.5">
        <motion.span
          // The label text genuinely changes between stages, so a small
          // cross-fade is content-driven rather than decorative. `key` makes
          // framer treat each label as a new node; `initial` starts at 0.6
          // opacity, never 0, so a stalled transition still leaves readable
          // text.
          key={STAGES[activeIndex]}
          initial={reduceMotion ? false : { opacity: 0.6, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.22 }}
          className={cn(
            'text-[11px] font-medium tracking-wide',
            isDone ? 'text-emerald-300' : 'text-white/60',
          )}
        >
          {t(`stages.${STAGES[activeIndex] as Stage}`)}
        </motion.span>

        {celebrating && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-0 size-0 -translate-y-1/2"
          >
            {SPARKS.map((spark, index) => (
              <motion.span
                key={index}
                initial={{ opacity: 1, x: 0, y: 0, scale: 0.4 }}
                animate={{ opacity: 0, x: spark.x, y: spark.y, scale: 1 }}
                transition={{ duration: 0.9, ease: 'easeOut', delay: index * 0.02 }}
                className="absolute size-1 rounded-full bg-amber-300 shadow-[0_0_6px_2px_rgba(252,211,77,0.5)]"
              />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
