'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');

  // Route-segment errors don't reach the server's own request logs (the
  // render already failed client-side), so this is the only place they'd
  // otherwise be lost entirely.
  useEffect(() => {
    console.error('Route error boundary caught:', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className={cn(GLASS_CARD, 'flex max-w-md flex-col items-center gap-4 p-8 text-center')}>
        <div className="flex size-14 items-center justify-center rounded-full border border-red-400/30 bg-red-500/15">
          <AlertTriangle className="size-7 text-red-300" />
        </div>
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('errorTitle')}
        </h2>
        <p className="text-sm text-white/70">{t('errorDescription')}</p>
        <Button onClick={() => reset()} className="mt-2">
          {t('tryAgain')}
        </Button>
      </div>
    </div>
  );
}
