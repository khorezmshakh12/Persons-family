'use client';

import { useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/navigation';
import { triageOpenIssuesAction } from '@/lib/actions/issues';
import { BTN_SECONDARY } from '@/lib/glass';

/** CEO: run TypeSafe triage on open issues that don't have it yet. */
export function AiTriageButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={BTN_SECONDARY}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await triageOpenIssuesAction();
          if (res.error) toast.error("AI tahlil ishlamadi");
          else if (!res.done) toast("Tahlil qilinmagan ochiq murojaat yo'q (yoki AI kaliti sozlanmagan)");
          else {
            toast.success(`${res.done} ta murojaat AI bilan tahlil qilindi`);
            router.refresh();
          }
        })
      }
    >
      <Sparkles className="size-4" /> {pending ? 'Tahlil qilinmoqda…' : 'AI tahlil'}
    </button>
  );
}
