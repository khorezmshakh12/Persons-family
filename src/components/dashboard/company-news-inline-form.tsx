'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { createNewsAction, type CompanyNewsActionState } from '@/lib/actions/company-news';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/** Compact publish control embedded directly in the dashboard's Company
 * News widget — the full form (see CreateNewsDialog) still exists on the
 * /company-news page itself; this is a sleeker inline alternative for
 * quick posts without leaving the dashboard. */
export function CompanyNewsInlineForm() {
  const t = useTranslations('companyNews');
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState<CompanyNewsActionState, FormData>(
    createNewsAction,
    undefined,
  );

  useEffect(() => {
    if (state?.error) {
      toast.error(t(`errors.${state.error}`));
    } else if (state && !state.error) {
      formRef.current?.reset();
    }
  }, [state, t]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2 border-b border-white/10 pb-4">
      <Input name="title" placeholder={t('titleLabel')} maxLength={200} required />
      <Textarea name="content" placeholder={t('contentLabel')} maxLength={5000} rows={2} required />
      <Button type="submit" disabled={isPending} size="sm" className="w-fit self-end">
        {t('publish')}
      </Button>
    </form>
  );
}
