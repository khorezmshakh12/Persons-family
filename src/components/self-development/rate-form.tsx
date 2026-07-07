'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { rateSelfDevelopmentAction, type SelfDevActionState } from '@/lib/actions/self-development';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function RateForm({ submissionId, currentRating }: { submissionId: string; currentRating: string | null }) {
  const t = useTranslations('selfDevelopment');
  const tCommon = useTranslations('common');
  const [rating, setRating] = useState(currentRating ?? '');
  const [state, formAction, isPending] = useActionState<SelfDevActionState, FormData>(
    rateSelfDevelopmentAction,
    undefined,
  );

  useEffect(() => {
    if (state?.success) toast.success(t('rated'));
    else if (state?.error) toast.error(t(`errors.${state.error}`));
  }, [state, t]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={submissionId} />
      <Textarea
        name="ceoRating"
        value={rating}
        onChange={(e) => setRating(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder={t('ratingPlaceholder')}
        className="border-white/30 bg-white/10 text-white placeholder:text-white/40"
      />
      <Button type="submit" size="sm" disabled={isPending} className="w-fit">
        {isPending ? tCommon('loading') : t('saveRating')}
      </Button>
    </form>
  );
}
