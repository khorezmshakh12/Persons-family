'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';
import { withdrawSelfDevelopmentAction } from '@/lib/actions/self-development';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

/** Author: take this month's not-yet-evaluated report back to fix it.
 * Two clicks (ask, then confirm) — no browser dialog. */
export function WithdrawReportButton({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, start] = useTransition();
  const t = useTranslations('wr');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (!armed) return setArmed(true);
          start(async () => {
            const res = await withdrawSelfDevelopmentAction(submissionId);
            if (res?.error) {
              setArmed(false);
              toast.error(
                res.error === 'alreadyEvaluated'
                  ? t('already')
                  : t('fail'),
              );
              return;
            }
            toast.success(t('done'));
            router.refresh();
          });
        }}
        className={cn(
          'inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
          armed ? 'bg-au-bad-soft text-au-bad hover:opacity-90' : 'bg-au-card-2 text-au-muted hover:text-au-ink',
        )}
      >
        <Undo2 className="size-3.5" aria-hidden />
        {busy ? t('busy') : armed ? t('confirm') : t('withdraw')}
      </button>
      {armed && !busy && (
        <button type="button" onClick={() => setArmed(false)} className="text-xs text-au-muted hover:text-au-ink">
          {t('cancel')}
        </button>
      )}
    </div>
  );
}
