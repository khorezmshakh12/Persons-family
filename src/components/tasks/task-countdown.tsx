'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { finishedOnTime, formatCountdown, parseInstant, type CountdownTone } from '@/lib/countdown';
import { useNowTicker } from '@/lib/use-now-ticker';
import type { TaskStatus } from '@/lib/task-status';
import { cn } from '@/lib/utils';

const CHIP =
  'inline-flex h-6 items-center gap-px whitespace-nowrap rounded-lg px-2 font-mono text-xs font-bold tabular-nums leading-none';

const TONE: Record<CountdownTone, string> = {
  ok: 'bg-au-card-2 text-au-ink',
  warn: 'bg-au-accent-soft text-au-accent-text',
  bad: 'bg-au-bad-soft text-au-bad',
};

/** Server / hydration placeholder: same box and width as a live value, so
 * nothing shifts when the ticker takes over after mount. */
const PLACEHOLDER = '--:--:--';

/**
 * Split into per-character cells. Each digit sits in a fixed-width,
 * overflow-hidden slot whose inner span is keyed by the digit itself — when
 * the digit changes React remounts that span and the transform-only
 * `cd-roll` animation (globals.css) slides the new digit in. Unchanged
 * digits keep their node and do not move.
 */
function Digits({ text }: { text: string }) {
  return (
    <>
      {Array.from(text).map((c, i) => {
        if (c >= '0' && c <= '9') {
          return (
            <span key={i} className="cd-slot">
              <span key={c} className="cd-roll">
                {c}
              </span>
            </span>
          );
        }
        if (c === 'k') {
          return (
            <span key={i} className="mr-1 font-sans font-extrabold">
              k
            </span>
          );
        }
        if (c === ':') {
          return (
            <span key={i} className="opacity-50">
              :
            </span>
          );
        }
        return <span key={i}>{c === ' ' ? ' ' : c}</span>;
      })}
    </>
  );
}

function LiveCountdown({ deadlineMs }: { deadlineMs: number }) {
  const t = useTranslations('tasks.countdown');
  const now = useNowTicker();
  if (now === null) {
    return (
      <span className={cn(CHIP, TONE.ok, 'text-au-muted')} aria-hidden>
        {PLACEHOLDER}
      </span>
    );
  }
  const cd = formatCountdown(deadlineMs, now);
  return (
    <span
      role="timer"
      aria-label={cd.overdue ? t('overdueBy', { time: cd.text.slice(1) }) : t('left', { time: cd.text })}
      className={cn(CHIP, TONE[cd.tone])}
    >
      <span aria-hidden className="inline-flex items-center">
        <Digits text={cd.text} />
      </span>
    </span>
  );
}

/**
 * The live "time to deadline" chip on a task card.
 *   - not done  → ticking countdown (amber under 24h, red with a minus once
 *                 past the deadline — the same instant the server flips
 *                 `is_overdue` and the penalty cron starts to apply).
 *   - done      → "✓ O'z vaqtida" / "✓ Kechikib bajarildi" from
 *                 completed_at vs deadline, exactly settleTaskStars' rule.
 */
function TaskCountdownImpl({
  deadline,
  completedAt,
  status,
}: {
  deadline: string | null | undefined;
  completedAt: string | null | undefined;
  status: TaskStatus;
}) {
  const t = useTranslations('tasks.countdown');
  if (!deadline) return null;

  if (status === 'done') {
    const onTime = finishedOnTime(deadline, completedAt);
    if (onTime === null) return null;
    return (
      <span
        className={cn(
          CHIP,
          'font-sans',
          onTime ? 'bg-au-ok-soft text-au-ok' : 'bg-au-bad-soft text-au-bad',
        )}
      >
        {onTime ? t('onTime') : t('late')}
      </span>
    );
  }

  const deadlineMs = parseInstant(deadline);
  if (!Number.isFinite(deadlineMs)) return null;
  return <LiveCountdown deadlineMs={deadlineMs} />;
}

export const TaskCountdown = memo(TaskCountdownImpl);
