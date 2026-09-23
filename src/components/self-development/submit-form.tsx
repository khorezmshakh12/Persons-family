'use client';

import { useActionState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { submitSelfDevelopmentAction, type SelfDevActionState } from '@/lib/actions/self-development';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function SubmitForm() {
  const t = useTranslations('selfDevelopment');
  const tCommon = useTranslations('common');
  const [state, formAction, isPending] = useActionState<SelfDevActionState, FormData>(
    submitSelfDevelopmentAction,
    undefined,
  );

  useEffect(() => {
    if (state?.success) toast.success(t('submitted'));
  }, [state, t]);

  if (state?.success) {
    return <p className="text-sm text-au-muted">{t('submittedThisMonth')}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="achievements" className="text-au-ink">
          {t('achievements')}
        </Label>
        <Textarea
          id="achievements"
          name="achievements"
          rows={3}
          maxLength={4000}
          placeholder={t('achievementsPlaceholder')}
          className="border-au-line bg-au-card text-au-ink placeholder:text-au-faint"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="valueAdded" className="text-au-ink">
          {t('valueAdded')}
        </Label>
        <Textarea
          id="valueAdded"
          name="valueAdded"
          rows={3}
          maxLength={4000}
          placeholder={t('valueAddedPlaceholder')}
          className="border-au-line bg-au-card text-au-ink placeholder:text-au-faint"
        />
      </div>
      {state?.error && <p className="text-sm text-red-700">{t(`errors.${state.error}`)}</p>}
      <Button type="submit" loading={isPending} className="w-fit">
        {isPending ? tCommon('loading') : t('submit')}
      </Button>
    </form>
  );
}
