'use client';

import { useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/navigation';
import { triageOpenIssuesAction } from '@/lib/actions/issues';
import { useTranslations } from 'next-intl';
import { BTN_SECONDARY } from '@/lib/glass';

/** CEO: run TypeSafe triage on open issues that don't have it yet. */
export function AiTriageButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const t = useTranslations('iss.ai');
  return (
    <button
      type="button"
      className={BTN_SECONDARY}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await triageOpenIssuesAction();
          if (res.error) toast.error(t('failed'));
          else if (!res.done) toast(t('allDone'));
          else {
            toast.success(t('done', { n: res.done }));
            router.refresh();
          }
        })
      }
    >
      <Sparkles className="size-4" /> {pending ? t('working') : t('button')}
    </button>
  );
}
