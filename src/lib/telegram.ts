import { Telegraf } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;

// Created once per server instance. `bot.telegram` can send messages and
// manage the webhook without ever calling `bot.launch()` — launch() starts
// long-polling, which doesn't work on Vercel's serverless functions. We
// run in webhook mode instead (src/app/api/telegram/webhook), so this
// client is only ever used to send messages and to register the webhook.
export const telegramBot = token ? new Telegraf(token) : null;

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
