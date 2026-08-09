'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Send, Unlink, Loader2 } from 'lucide-react';
import { createTelegramLinkTokenAction, disconnectTelegramAction } from '@/lib/actions/telegram';
import { Button } from '@/components/ui/button';

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

export function TelegramConnectSection({ isConnected: initialConnected }: { isConnected: boolean }) {
  const t = useTranslations('settings.telegram');
  const [isConnected, setIsConnected] = useState(initialConnected);
  const [isPending, startTransition] = useTransition();
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  function handleConnect() {
    if (!BOT_USERNAME) {
      toast.error(t('errors.notConfigured'));
      return;
    }
    startTransition(async () => {
      const result = await createTelegramLinkTokenAction();
      if (result.error || !result.token) {
        toast.error(t('errors.linkFailed'));
        return;
      }
      const link = `https://t.me/${BOT_USERNAME}?start=${result.token}`;
      setDeepLink(link);
      try {
        // Dynamically imported: every other Settings visitor who never
        // clicks "Connect" shouldn't pay for this library in their initial
        // page bundle — it's only needed right here, on demand.
        const { default: QRCode } = await import('qrcode');
        setQrDataUrl(await QRCode.toDataURL(link, { margin: 1, width: 200 }));
      } catch {
        // QR generation failing still leaves the deep-link button usable.
      }
    });
  }

  function handleDisconnect() {
    startTransition(async () => {
      const result = await disconnectTelegramAction();
      if (result.error) {
        toast.error(t('errors.updateFailed'));
        return;
      }
      setIsConnected(false);
      setDeepLink(null);
      setQrDataUrl(null);
      toast.success(t('disconnected'));
    });
  }

  if (isConnected) {
    return (
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-sm text-white">
          <span className="size-2.5 rounded-full bg-emerald-400" />
          {t('connected')}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleDisconnect}
          disabled={isPending}
          className="border-white/30 bg-white/10 text-white hover:bg-white/20"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Unlink className="size-4" />}
          {t('disconnect')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-white/70">{t('description')}</p>
      {!deepLink ? (
        <Button type="button" onClick={handleConnect} disabled={isPending} className="w-fit">
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {t('connectButton')}
        </Button>
      ) : (
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL, next/image doesn't apply here
            <img
              src={qrDataUrl}
              alt={t('qrAlt')}
              className="size-40 shrink-0 rounded-xl border border-white/20 bg-white p-2"
            />
          )}
          <div className="flex flex-col gap-2">
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:opacity-90"
            >
              {t('openBot')}
            </a>
            <p className="text-xs text-white/60">{t('linkHint')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
