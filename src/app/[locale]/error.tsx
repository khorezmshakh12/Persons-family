'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('common');

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-lg font-semibold">{t('errorTitle')}</h2>
      <p className="text-muted-foreground text-sm">{t('errorDescription')}</p>
      <Button onClick={() => reset()}>{t('tryAgain')}</Button>
    </div>
  );
}
