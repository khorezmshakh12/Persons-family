'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trophy } from 'lucide-react';
import { featureSelfDevReportAction } from '@/lib/actions/self-development';
import { celebrate } from '@/components/motion/events';
import { cn } from '@/lib/utils';

/** CEO: publish this report to company news as the month's best. */
export function FeatureReportButton({ submissionId }: { submissionId: string }) {
  const t = useTranslations('selfDevelopment.v2.feature');
  const [done, setDone] = useState(false);
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      disabled={busy || done}
      onClick={() =>
        start(async () => {
          const res = await featureSelfDevReportAction(submissionId);
          if (res?.error) return void toast.error(t('failed'));
          setDone(true);
          celebrate('🏆');
          toast.success(t('done'));
        })
      }
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
        done ? 'ms-pop-in bg-au-ok-soft text-au-ok' : 'bg-au-accent-soft text-au-accent-text hover:bg-au-accent hover:text-au-accent-ink',
      )}
    >
      <Trophy className="size-3.5" aria-hidden />
      {done ? t('done') : t('cta')}
    </button>
  );
}
