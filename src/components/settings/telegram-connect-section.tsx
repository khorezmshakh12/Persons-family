'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Send, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createTelegramLinkTokenAction } from '@/lib/actions/telegram';
import { Button } from '@/components/ui/button';
import { springs } from '@/lib/motion';

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

export function TelegramConnectSection({ isConnected }: { isConnected: boolean }) {
  const t = useTranslations('settings.telegram');
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

  // Disconnecting is CEO-only now (see the Staff page) — a connected
  // employee just sees their own status here, no unlink control.
  if (isConnected) {
    return (
      <div className="flex items-center gap-2 text-sm text-white">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
        </span>
        {t('connected')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-white/70">{t('description')}</p>
      <AnimatePresence mode="wait" initial={false}>
        {!deepLink ? (
          <motion.div
            key="connect-btn"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springs.snappy}
          >
            <Button type="button" onClick={handleConnect} disabled={isPending} className="w-fit">
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {t('connectButton')}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="qr-section"
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={springs.gentle}
            className="flex flex-col items-start gap-4 sm:flex-row sm:items-center"
          >
            {qrDataUrl && (
              <div className="relative overflow-hidden rounded-xl border border-white/20 bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, next/image doesn't apply here */}
                <img
                  src={qrDataUrl}
                  alt={t('qrAlt')}
                  className="size-40 shrink-0"
                />
                {/* Subtle laser sweep overlay */}
                <div
                  className="pointer-events-none absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent shadow-[0_0_8px_rgba(6,182,212,0.8)]"
                  style={{
                    animation: 'laser-scan 2.5s ease-in-out infinite alternate',
                  }}
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition-transform duration-150 hover:opacity-90 active:scale-95"
              >
                {t('openBot')}
              </a>
              <p className="text-xs text-white/60">{t('linkHint')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
