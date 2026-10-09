import 'server-only';
import { sql } from '@/lib/db/client';
import { isTelegramConfigured, telegramBot } from '@/lib/telegram';

/** Platform › Telegram (v8-B): bot health, who is linked, failed sends. */
export type TelegramCenter = {
  configured: boolean;
  webhook: { url: string; pending: number; lastError: string | null; lastErrorAt: string | null } | null;
  staff: { id: string; name: string; role: string; linked: boolean; lastSeen: string | null; reminded: boolean }[];
  failures: { at: string; name: string | null; error: string }[];
  failures7d: number;
};

export async function loadTelegramCenter(): Promise<TelegramCenter> {
  const configured = isTelegramConfigured();
  const [staff, failures, [{ n }], webhook] = await Promise.all([
    sql<{ id: string; first_name: string | null; last_name: string | null; role: string; linked: boolean; last_seen_at: string | null; reminded: boolean }[]>`
      select p.id, p.first_name, p.last_name, p.role::text as role, p.telegram_id is not null as linked, p.last_seen_at::text as last_seen_at,
             exists (select 1 from notifications n where n.user_id = p.id and n.ref = 'tg-link' and n.action) as reminded
      from profiles p where p.is_active order by (p.telegram_id is not null), p.first_name, p.last_name`,
    sql<{ at: string; first_name: string | null; last_name: string | null; error: string }[]>`
      select f.created_at::text as at, p.first_name, p.last_name, f.error
      from telegram_failures f left join profiles p on p.telegram_id = f.chat_id
      order by f.created_at desc limit 40`.catch((error) => {
      console.error('telegram failures query failed', error instanceof Error ? error.message : error);
      return [];
    }),
    sql<{ n: number }[]>`select count(*)::int as n from telegram_failures where created_at > now() - interval '7 days'`.catch(() => [{ n: 0 }]),
    configured && telegramBot
      ? telegramBot.telegram
          .getWebhookInfo()
          .then((w) => ({
            url: w.url ?? '',
            pending: w.pending_update_count ?? 0,
            lastError: w.last_error_message ?? null,
            lastErrorAt: w.last_error_date ? new Date(w.last_error_date * 1000).toISOString() : null,
          }))
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  const name = (f: string | null, l: string | null) => `${f ?? ''} ${l ?? ''}`.trim() || '—';
  return {
    configured,
    webhook,
    staff: staff.map((s) => ({ id: s.id, name: name(s.first_name, s.last_name), role: s.role, linked: s.linked, lastSeen: s.last_seen_at, reminded: s.reminded })),
    failures: failures.map((f) => ({ at: f.at, name: f.first_name || f.last_name ? name(f.first_name, f.last_name) : null, error: f.error })),
    failures7d: n,
  };
}
