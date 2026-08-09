'use client';

import { useActionState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  publishAnnouncementAction,
  clearAnnouncementAction,
  type AnnouncementActionState,
} from '@/lib/actions/announcements';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function AnnouncementSection({ currentMessage }: { currentMessage: string | null }) {
  const t = useTranslations('settings.announcement');
  const [state, formAction, isPending] = useActionState<AnnouncementActionState, FormData>(
    publishAnnouncementAction,
    undefined,
  );

  useEffect(() => {
    if (state?.error) toast.error(t(`errors.${state.error}`));
    else if (state && !state.error) toast.success(t('published'));
  }, [state, t]);

  async function handleClear() {
    const result = await clearAnnouncementAction();
    if (result?.error) toast.error(t(`errors.${result.error}`));
    else toast.success(t('cleared'));
  }

  return (
    <div className="flex flex-col gap-3">
      {currentMessage && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/30 bg-white/10 px-4 py-3">
          <p className="text-sm text-white">{currentMessage}</p>
          <Button type="button" size="sm" variant="outline" onClick={handleClear}>
            {t('clear')}
          </Button>
        </div>
      )}
      <form action={formAction} className="flex flex-col gap-3">
        <Textarea name="message" placeholder={t('placeholder')} maxLength={300} required />
        <Button type="submit" disabled={isPending} size="sm" className="w-fit">
          {isPending ? t('publishing') : t('publish')}
        </Button>
      </form>
    </div>
  );
}
