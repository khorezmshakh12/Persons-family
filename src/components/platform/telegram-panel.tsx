'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertTriangle, BellRing, CheckCircle2, Megaphone, Search, Send, XCircle } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { BTN_SECONDARY, CARD_TITLE, CHIP_BAD, CHIP_NEUTRAL, CHIP_OK, INPUT, SURFACE_CARD, SURFACE_INSET } from '@/lib/glass';
import { remindTelegramLinkAction } from '@/lib/actions/telegram';
import type { TelegramCenter } from '@/lib/telegram-center';
import { WebhookRegisterButton } from '@/components/telegram/webhook-register-button';

const dt = (iso: string) =>
  new Date(iso).toLocaleString('uz-UZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });

/** Platform › Telegram (v8-B, 2026-10-10): is the bot healthy, who still
 * can't receive notifications, and which sends failed. Announcements live
 * in Jamoa hayoti › Yangiliklar ("Majburiy o‘qish" reaches everyone). */
export function TelegramPanel({ data, canWebhook }: { data: TelegramCenter; canWebhook: boolean }) {
  const tStaff = useTranslations('staff');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'unlinked' | 'all'>('unlinked');
  const linked = data.staff.filter((s) => s.linked).length;
  const total = data.staff.length;
  const pct = total ? Math.round((linked / total) * 100) : 0;
  const unlinked = data.staff.filter((s) => !s.linked);
  const toRemind = unlinked.filter((s) => !s.reminded);
  const list = useMemo(
    () =>
      data.staff
        .filter((s) => (show === 'unlinked' ? !s.linked : true))
        .filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())),
    [data.staff, show, q],
  );
  const role = (r: string) => (tStaff.has(`roles.${r}`) ? tStaff(`roles.${r}`) : r);
  const hookOk = data.webhook && data.webhook.url && !data.webhook.lastError;

  const remind = (ids: string[]) =>
    start(async () => {
      const r = await remindTelegramLinkAction(ids);
      if (r.error) return void toast.error('Yuborib bo‘lmadi');
      toast.success(r.sent ? `${r.sent} kishiga eslatma yuborildi (bildirishnomalar markazida)` : 'Hammasiga allaqachon eslatilgan');
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <section className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-4')}>
          <h3 className={CARD_TITLE}>Bot holati</h3>
          {!data.configured ? (
            <p className="flex items-center gap-2 text-sm text-au-bad">
              <XCircle className="size-4" /> Bot sozlanmagan (TELEGRAM_BOT_TOKEN yo‘q)
            </p>
          ) : (
            <>
              <p className={cn('flex items-center gap-2 text-sm font-semibold', hookOk ? 'text-au-ok' : 'text-au-bad')}>
                {hookOk ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                {hookOk ? 'Ishlayapti' : data.webhook?.url ? 'Webhook xato bermoqda' : 'Webhook ulanmagan'}
              </p>
              {data.webhook?.pending ? <p className="text-xs text-au-muted">{data.webhook.pending} ta xabar navbatda</p> : null}
              {data.webhook?.lastError && (
                <p className="text-xs text-au-bad">
                  Oxirgi xato: {data.webhook.lastError}
                  {data.webhook.lastErrorAt ? ` · ${dt(data.webhook.lastErrorAt)}` : ''}
                </p>
              )}
              {canWebhook && <WebhookRegisterButton />}
            </>
          )}
        </section>
        <section className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-4')}>
          <h3 className={CARD_TITLE}>Ulangan xodimlar</h3>
          <p className="text-3xl font-bold tabular-nums">
            {linked}
            <span className="text-base text-au-muted">/{total}</span>
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-au-card-2">
            <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-au-ok' : pct >= 60 ? 'bg-au-accent' : 'bg-au-bad')} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-au-muted">{unlinked.length ? `${unlinked.length} kishiga Telegram xabarlari bormaydi — faqat saytdagi qo‘ng‘iroqchada ko‘radi.` : 'Hamma ulangan.'}</p>
        </section>
        <section className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-4')}>
          <h3 className={CARD_TITLE}>Yetkazilmagan (7 kun)</h3>
          <p className={cn('text-3xl font-bold tabular-nums', data.failures7d ? 'text-au-bad' : 'text-au-ok')}>{data.failures7d}</p>
          <p className="text-xs text-au-muted">Odatda: xodim botni bloklagan yoki akkauntini o‘chirgan. Pastdagi jurnalda kim ekanini ko‘ring.</p>
        </section>
      </div>

      <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-4')}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn(CARD_TITLE, 'mr-auto')}>Xodimlar</h3>
          <div className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-0.5">
            {(
              [
                ['unlinked', `Ulanmagan (${unlinked.length})`],
                ['all', `Hammasi (${total})`],
              ] as const
            ).map(([v, n]) => (
              <button
                key={v}
                type="button"
                onClick={() => setShow(v)}
                className={cn('h-8 rounded-[9px] px-2.5 text-xs font-semibold', show === v ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted')}
              >
                {n}
              </button>
            ))}
          </div>
          <label className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-au-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism…" className={cn(INPUT, 'h-9 w-44 pl-8')} />
          </label>
          <button type="button" className={cn(BTN_SECONDARY, 'h-9')} disabled={pending || !toRemind.length} onClick={() => remind(toRemind.map((s) => s.id))}>
            <BellRing className="size-4" /> Hammasiga eslatish ({toRemind.length})
          </button>
        </div>
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-au-muted">{show === 'unlinked' ? 'Hamma Telegram’ni ulagan 🎉' : 'Topilmadi'}</p>
        ) : (
          <ul className="divide-y divide-au-line">
            {list.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
                <span className="text-xs text-au-muted">{role(s.role)}</span>
                <span className="text-xs text-au-muted">{s.lastSeen ? `saytda: ${dt(s.lastSeen)}` : 'saytga kirmagan'}</span>
                {s.linked ? (
                  <span className={CHIP_OK}>ulangan</span>
                ) : s.reminded ? (
                  <span className={CHIP_NEUTRAL}>eslatilgan</span>
                ) : (
                  <button type="button" disabled={pending} onClick={() => remind([s.id])} className="inline-flex items-center gap-1 text-xs font-semibold text-au-muted hover:text-au-ink">
                    <Send className="size-3.5" /> Eslatish
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-4')}>
        <h3 className={CARD_TITLE}>Yetkazilmagan xabarlar jurnali</h3>
        {data.failures.length === 0 ? (
          <p className="text-sm text-au-muted">So‘nggi 30 kunda xato yo‘q.</p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto text-xs">
            {data.failures.map((f, k) => (
              <li key={k} className={cn(SURFACE_INSET, 'flex flex-wrap items-center gap-2 px-3 py-1.5')}>
                <span className="tabular-nums text-au-muted">{dt(f.at)}</span>
                <span className="font-semibold">{f.name ?? 'noma’lum chat'}</span>
                <span className={cn(CHIP_BAD, 'ml-auto max-w-full truncate')}>{f.error}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cn(SURFACE_INSET, 'flex flex-wrap items-center gap-3 p-4')}>
        <Megaphone className="size-5 text-au-accent-text" />
        <p className="min-w-0 flex-1 text-sm">
          <b>Hammaga e’lon</b> endi Jamoa hayoti › Yangiliklar’da: «Majburiy o‘qish» belgilansa, Telegram’ga ham boradi va kim o‘qiganini ko‘rasiz.
        </p>
        <Link href="/company-news" className={cn(BTN_SECONDARY, 'h-9')}>
          E’lon yozish
        </Link>
      </section>
    </div>
  );
}
