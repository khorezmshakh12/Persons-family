import 'server-only';
import { sql } from '@/lib/db/client';
import { ROLE_DEPT, type Role } from '@/lib/permissions';
import { escapeTelegramText, sendTelegramMessageToMany } from '@/lib/telegram';

/** Telegram broadcast for one published post (audience-aware, sent once). */
export async function broadcastNews(id: string) {
  // Claim the send first so a cron run and a direct publish never both send.
  const [n] = await sql<{ title: string; audience: string; must_ack: boolean }[]>`
    update company_news set telegram_sent_at = now()
    where id = ${id} and telegram_sent_at is null and notify and deleted_at is null and (publish_at is null or publish_at <= now())
    returning title, audience, must_ack`;
  if (!n) return;
  const staff = await sql<{ telegram_id: number; role: Role }[]>`select telegram_id, role from profiles where is_active and telegram_id is not null`;
  const to = staff.filter((s) => n.audience === 'all' || ROLE_DEPT[s.role] === n.audience).map((s) => s.telegram_id);
  await sendTelegramMessageToMany(
    to,
    `${n.must_ack ? '❗️ <b>Muhim e’lon</b> — tanishib, “Tanishdim”ni bosing\n' : '📰 '}<b>${escapeTelegramText(n.title)}</b>`,
  ).catch(() => {});
}


/** Scheduled posts whose time has come (cron, every 15 min). */
export async function deliverScheduledNews(): Promise<number> {
  const due = await sql<{ id: string }[]>`
    select id from company_news
    where telegram_sent_at is null and notify and deleted_at is null and publish_at is not null and publish_at <= now()
    limit 20`;
  for (const n of due) await broadcastNews(n.id);
  return due.length;
}
