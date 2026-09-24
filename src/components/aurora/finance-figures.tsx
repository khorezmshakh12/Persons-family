'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatUZS } from '@/lib/format-currency';
import { cn } from '@/lib/utils';

const MASK = '••••••';

/**
 * The money figures of the dashboard Finance card. Masked by default on every
 * load (same rule as MaskableStatValue — a salary never appears on screen
 * until the viewer deliberately reveals it); one eye toggles the headline and
 * the three figures together instead of an eye per number.
 */
export function FinanceFigures({
  headline,
  headlineCaption,
  figures,
}: {
  headline: number;
  headlineCaption: string;
  figures: { label: string; value: number; tone?: 'ok' | 'accent' | 'muted' }[];
}) {
  const t = useTranslations('dashboard.stats');
  const [revealed, setRevealed] = useState(false);
  const show = (n: number) => (revealed ? formatUZS(n) : MASK);

  return (
    <>
      <div className="flex items-end gap-3">
        <div className="min-w-0">
          <div className="font-display text-[44px] leading-[44px] tracking-[-0.02em] text-au-ink tabular-nums sm:text-[52px] sm:leading-[52px]">
            {show(headline)}
          </div>
          <div className="mt-1 text-xs font-medium text-au-muted">{headlineCaption}</div>
        </div>
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? t('hideAmount') : t('showAmount')}
          className="tap-scale mb-6 shrink-0 text-au-muted hover:text-au-ink"
        >
          {revealed ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-au-ctl border border-au-line">
        {figures.map((f, i) => (
          <div key={f.label} className={cn('flex min-w-0 flex-col gap-0.5 px-3 py-2.5', i > 0 && 'border-l border-au-line')}>
            <span className="truncate text-[11px] font-medium text-au-muted">{f.label}</span>
            <span
              className={cn(
                'truncate text-sm font-bold tabular-nums',
                !revealed || !f.tone
                  ? 'text-au-ink'
                  : f.tone === 'ok'
                    ? 'text-au-ok'
                    : f.tone === 'accent'
                      ? 'text-au-accent-text'
                      : 'text-au-muted',
              )}
            >
              {show(f.value)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
