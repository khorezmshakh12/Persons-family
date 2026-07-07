'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { sendBroadcastAction, type TelegramActionState } from '@/lib/actions/telegram';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function BroadcastForm() {
  const t = useTranslations('telegramSetup');
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState<TelegramActionState, FormData>(
    sendBroadcastAction,
    undefined,
  );

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success(t('broadcast.sent'));
      formRef.current?.reset();
    } else if (state.error) {
      toast.error(t(`errors.${state.error}`));
    }
  }, [state, t]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <Textarea
        name="message"
        required
        maxLength={2000}
        rows={4}
        placeholder={t('broadcast.placeholder')}
        className="border-white/30 bg-white/10 text-white placeholder:text-white/40"
      />
      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? t('broadcast.sending') : t('broadcast.send')}
      </Button>
    </form>
  );
}
