import { Telegraf } from 'telegraf';
import { sql } from '@/lib/db/client';
import { NOTIFY_META, type NotifyKind } from '@/lib/notify-kinds';
import { recordForChats, recordNotifications } from '@/lib/notifications';

const token = process.env.TELEGRAM_BOT_TOKEN;

// Created once per server instance. `bot.telegram` can send messages and
// manage the webhook without ever calling `bot.launch()` — launch() starts
// long-polling, which doesn't work on Vercel's serverless functions. We
// run in webhook mode instead (src/app/api/telegram/webhook), so this
// client is only ever used to send messages and to register the webhook.
export const telegramBot = token ? new Telegraf(token) : null;

/** The Mini App entry the bot's buttons open (app/[locale]/tg). On the
 * public domain, not NEXT_PUBLIC_APP_URL (the bare Cloud Run host). */
export const TELEGRAM_WEBAPP_URL = process.env.TELEGRAM_WEBAPP_URL || 'https://www.persons-staffs.uz/staff/uz/tg';

/** Inline "open the app" button for bot replies. */
export function openAppKeyboard(text = '📱 Persons ilovasini ochish') {
  return { inline_keyboard: [[{ text, web_app: { url: TELEGRAM_WEBAPP_URL } }]] };
}

export function isTelegramConfigured(): boolean {
  return telegramBot !== null;
}

/** Neutralizes the characters that are structurally significant in
 * Telegram's HTML parse mode when they show up inside text we didn't
 * author ourselves (an ampersand or angle bracket in someone's name or an
 * issue title). We control the <b> tags ourselves in each template, so
 * this only needs to escape stray occurrences from user-entered content. */
export function escapeTelegramText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Throws on failure with Telegram's own error description instead of
 * swallowing it — every caller is responsible for its own try/catch (see
 * sendTelegramMessageToMany below and each notify* helper), which is what
 * keeps "a Telegram delivery failure must never fail the action that
 * triggered it" true without this function hiding *why* a send failed.
 * Uses the raw Bot API over fetch rather than the Telegraf client so it
 * has no dependency on the webhook bot instance being configured. */
export async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  if (!token) {
    console.warn('Telegram bot not configured (TELEGRAM_BOT_TOKEN missing) — skipping notification.');
    return;
  }
  console.log('Attempting to send to Chat ID:', chatId);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  const data = await res.json();
  console.log('Telegram API Response:', data);
  if (!res.ok) {
    throw new Error(data.description || 'Unknown Telegram Error');
  }
}

/** Sends the same message to multiple chat ids, deduplicated, silently
 * skipping nulls (staff who haven't connected Telegram yet). Each send is
 * caught individually so one bad chat id (blocked bot, deleted account)
 * can't fail Promise.all and take the rest of the batch down with it.
 *
 * Accepts string ids too — postgres-js returns `bigint` columns (like
 * profiles.telegram_id and telegram_group_chats.chat_id, both bigint) as
 * JS strings, not numbers, to avoid silent precision loss. A `typeof id
 * === 'number'` filter here used to reject every one of those, silently
 * emptying `unique` and skipping every send — no error, no log line, just
 * a compliance report that quietly never left the database. Chat/user ids
 * fit in a 52-bit range (Telegram's own guarantee), well inside
 * Number.MAX_SAFE_INTEGER, so Number(id) is a safe, lossless conversion. */
export async function sendTelegramMessageToMany(
  chatIds: (number | string | null | undefined)[],
  text: string,
): Promise<void> {
  const unique = Array.from(
    new Set(
      chatIds
        .map((id) => (typeof id === 'string' ? Number(id) : id))
        .filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
    ),
  );
  await Promise.all(
    unique.map(async (id) => {
      try {
        await sendTelegramMessage(id, text);
      } catch (error) {
        console.error('Telegram Notification Failed:', error instanceof Error ? error.message : error);
      }
    }),
  );
}

/* ------------------------------------------------------------ preferences */

/** 'HH:MM' now in Tashkent. */
function tashkentClock(): string {
  return new Date(Date.now() + 5 * 3_600_000).toISOString().slice(11, 16);
}

function inQuiet(from: string | null, to: string | null, now: string): boolean {
  if (!from || !to || from === to) return false;
  const f = from.slice(0, 5);
  const t = to.slice(0, 5);
  return f < t ? now >= f && now < t : now >= f || now < t; // wraps midnight
}

/** Chat ids (as numbers) that have muted this kind, or are in their quiet
 * hours for a quiet-able kind. One query per batch; on any error, nobody
 * is filtered (a preference lookup must never swallow a notification). */
async function blockedChats(chatIds: number[], kind: NotifyKind): Promise<Set<number>> {
  if (!chatIds.length) return new Set();
  try {
    const rows = await sql<{ telegram_id: string | number; muted: string[]; quiet_from: string | null; quiet_to: string | null }[]>`
      select p.telegram_id, n.muted, n.quiet_from::text as quiet_from, n.quiet_to::text as quiet_to
      from notification_prefs n join profiles p on p.id = n.user_id
      where p.telegram_id = any(${sql.array(chatIds.map(String))}::bigint[])`;
    const now = tashkentClock();
    return new Set(
      rows
        .filter((r) => r.muted.includes(kind) || (NOTIFY_META[kind].quiet && inQuiet(r.quiet_from, r.quiet_to, now)))
        .map((r) => Number(r.telegram_id)),
    );
  } catch (error) {
    console.error('notification prefs lookup failed', error instanceof Error ? error.message : error);
    return new Set();
  }
}

/** In-app copy options for the kinded sends. Every kinded Telegram message
 * also lands in the bell (Bildirishnomalar markazi) — muted kinds and quiet
 * hours only silence Telegram, never the in-app record. `record: false` for
 * callers whose event the bell already shows another way (new tasks,
 * warnings) or that recorded it themselves (notifyUsers). Chat is never
 * recorded — it has its own unread state. */
export type SendOpts = { record?: boolean; href?: string | null; action?: boolean; ref?: string | null };

function shouldRecord(kind: NotifyKind, opts?: SendOpts) {
  return kind !== 'chat' && opts?.record !== false;
}

/** sendTelegramMessage, honouring the recipient's preferences for `kind`. */
export async function sendTelegramAs(kind: NotifyKind, chatId: string | number, text: string, opts?: SendOpts): Promise<void> {
  const id = Number(chatId);
  if (Number.isFinite(id) && shouldRecord(kind, opts)) await recordForChats([id], { kind, text, href: opts?.href, action: opts?.action, ref: opts?.ref });
  if (Number.isFinite(id) && (await blockedChats([id], kind)).has(id)) return;
  await sendTelegramMessage(chatId, text);
}

/** sendTelegramMessageToMany, honouring each recipient's preferences. */
export async function sendTelegramManyAs(
  kind: NotifyKind,
  chatIds: (number | string | null | undefined)[],
  text: string,
  opts?: SendOpts,
): Promise<void> {
  const ids = chatIds.map((c) => (typeof c === 'string' ? Number(c) : c)).filter((c): c is number => typeof c === 'number' && Number.isFinite(c));
  const unique = [...new Set(ids)];
  if (shouldRecord(kind, opts)) await recordForChats(unique, { kind, text, href: opts?.href, action: opts?.action, ref: opts?.ref });
  const blocked = await blockedChats(unique, kind);
  await sendTelegramMessageToMany(unique.filter((c) => !blocked.has(c)), text);
}

/** The people-addressed path: stores the notification for every person
 * (Telegram linked or not), then mirrors it to the linked ones' Telegram
 * under their preferences. Never throws. */
export async function notifyUsers(
  kind: NotifyKind,
  userIds: (string | null | undefined)[],
  text: string,
  opts: Omit<SendOpts, 'record'> & { telegram?: boolean } = {},
): Promise<void> {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return;
  await recordNotifications(ids, { kind, text, href: opts.href, action: opts.action, ref: opts.ref });
  if (opts.telegram === false) return;
  try {
    const rows = await sql<{ telegram_id: string | number }[]>`
      select telegram_id from profiles where id = any(${sql.array(ids)}::uuid[]) and is_active and telegram_id is not null`;
    await sendTelegramManyAs(kind, rows.map((r) => r.telegram_id), text, { record: false });
  } catch (error) {
    console.error('notifyUsers telegram failed', error instanceof Error ? error.message : error);
  }
}
