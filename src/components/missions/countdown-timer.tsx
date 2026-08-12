'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

function msRemaining(deadlineDate: string): number {
  return new Date(`${deadlineDate}T23:59:59Z`).getTime() - Date.now();
}

function splitUnits(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/** One digit's own crossfade/slide between values — reads as a "flip" at a
 * fraction of the risk of an actual 3D card-flip animation (no perspective
 * transforms to get wrong, no jank if a tick is missed). */
function FlipDigit({ digit }: { digit: string }) {
  return (
    <span className="relative inline-block h-6 w-4 overflow-hidden text-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={digit}
          initial={{ y: '-70%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '70%', opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className="absolute inset-0 flex items-center justify-center font-heading text-sm font-bold tabular-nums text-white"
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function FlipUnit({ value, label }: { value: number; label: string }) {
  const digits = String(value).padStart(2, '0').split('');
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-0.5 rounded-md border border-white/20 bg-black/40 px-1.5 py-1 shadow-inner">
        {digits.map((d, i) => (
          <FlipDigit key={i} digit={d} />
        ))}
      </div>
      <span className="text-[9px] font-medium tracking-wide text-white/50 uppercase">{label}</span>
    </div>
  );
}

/** Live flip-clock readout — only rendered once a mission is in_progress.
 * Re-derives from the deadline every tick rather than counting down a
 * stored duration, so it's correct even if the tab was left open across a
 * day boundary. */
export function CountdownTimer({ deadlineDate }: { deadlineDate: string }) {
  const t = useTranslations('missions');
  const [remainingMs, setRemainingMs] = useState(() => msRemaining(deadlineDate));

  useEffect(() => {
    const id = setInterval(() => setRemainingMs(msRemaining(deadlineDate)), 1000);
    return () => clearInterval(id);
  }, [deadlineDate]);

  if (remainingMs <= 0) {
    return <span className="text-xs font-semibold text-red-400">{t('overdue')}</span>;
  }

  const { days, hours, minutes, seconds } = splitUnits(remainingMs);

  return (
    <div className={cn('flex items-start gap-1.5')}>
      <FlipUnit value={days} label={t('countdown.days')} />
      <span className="mt-1 text-xs text-white/30">:</span>
      <FlipUnit value={hours} label={t('countdown.hours')} />
      <span className="mt-1 text-xs text-white/30">:</span>
      <FlipUnit value={minutes} label={t('countdown.minutes')} />
      <span className="mt-1 text-xs text-white/30">:</span>
      <FlipUnit value={seconds} label={t('countdown.seconds')} />
    </div>
  );
}
