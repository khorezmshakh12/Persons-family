'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

function msRemaining(deadlineDate: string): number {
  return new Date(`${deadlineDate}T23:59:59Z`).getTime() - Date.now();
}

/** Live days/hours-remaining readout — only rendered once a mission is
 * in_progress. Re-derives from the deadline every tick rather than
 * counting down a stored duration, so it's correct even if the tab was
 * left open across a day boundary. */
export function CountdownTimer({ deadlineDate }: { deadlineDate: string }) {
  const t = useTranslations('missions');
  const [remainingMs, setRemainingMs] = useState(() => msRemaining(deadlineDate));

  useEffect(() => {
    const id = setInterval(() => setRemainingMs(msRemaining(deadlineDate)), 60_000);
    return () => clearInterval(id);
  }, [deadlineDate]);

  if (remainingMs <= 0) {
    return <span className="text-xs font-semibold text-red-400">{t('overdue')}</span>;
  }

  const totalHours = Math.floor(remainingMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  return (
    <span className="text-xs font-semibold tabular-nums text-white">
      {days > 0 ? t('countdownDaysHours', { days, hours }) : t('countdownHours', { hours })}
    </span>
  );
}
