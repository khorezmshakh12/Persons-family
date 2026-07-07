'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Link2 } from 'lucide-react';
import { registerTelegramWebhookAction } from '@/lib/actions/telegram';
import { Button } from '@/components/ui/button';

export function WebhookRegisterButton() {
  const t = useTranslations('telegramSetup');
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await registerTelegramWebhookAction();
      if (result.error) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(t('webhook.success'));
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={isPending}
      className="w-fit border-white/30 bg-white/10 text-white hover:bg-white/20"
    >
      {isPending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
      {t('webhook.registerButton')}
    </Button>
  );
}
