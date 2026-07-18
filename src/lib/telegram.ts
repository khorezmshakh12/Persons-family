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

/** Best-effort — a Telegram delivery failure must never fail the action
 * that triggered it (creating an issue/group/etc. still has to succeed
 * even if a notification doesn't go out). Uses the raw Bot API over fetch
 * rather than the Telegraf client so it has no dependency on the webhook
 * bot instance being configured. */
export async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  if (!token) {
    console.warn('Telegram bot not configured (TELEGRAM_BOT_TOKEN missing) — skipping notification.');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) {
      console.error('Failed to send Telegram message:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Failed to send Telegram message:', err);
  }
}

/** Sends the same message to multiple chat ids, deduplicated, silently
 * skipping nulls (staff who haven't connected Telegram yet). */
export async function sendTelegramMessageToMany(
  chatIds: (number | null | undefined)[],
  text: string,
): Promise<void> {
  const unique = Array.from(new Set(chatIds.filter((id): id is number => typeof id === 'number')));
  await Promise.all(unique.map((id) => sendTelegramMessage(id, text)));
}
