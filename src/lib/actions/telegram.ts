'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { requireAdmin, requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { telegramBot, isTelegramConfigured, sendTelegramMessageToMany, escapeTelegramText } from '@/lib/telegram';

export type TelegramActionState = { error?: string; success?: boolean } | undefined;

/** Mints a fresh single-use link token for the current user (clearing any
 * of their previous unused ones first) — embedded into the deep link/QR
 * code shown on their own Settings page. */
export async function createTelegramLinkTokenAction(): Promise<{ token?: string; error?: string }> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  try {
    await sql`delete from telegram_link_tokens where profile_id = ${user.id}`;
    const [row] = await sql<{ token: string }[]>`
      insert into telegram_link_tokens (profile_id) values (${user.id}) returning token
    `;
    if (!row) return { error: 'linkFailed' };
    return { token: row.token };
  } catch {
    return { error: 'linkFailed' };
  }
}

const idSchema = z.object({ id: z.string().uuid() });

/** Disconnecting is CEO-only now — an employee can link their own Telegram
 * (that's still self-service, see createTelegramLinkTokenAction) but
 * can no longer unlink it themselves; only the CEO can, from the Staff
 * page. */
export async function adminDisconnectTelegramAction(
  _prevState: TelegramActionState,
  formData: FormData,
): Promise<TelegramActionState> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    await sql`update profiles set telegram_id = null where id = ${parsed.data.id}`;
  } catch {
    return { error: 'updateFailed' };
  }

  revalidatePath('/[locale]/staff', 'page');
  return { success: true };
}

const broadcastSchema = z.object({ message: z.string().trim().min(1).max(2000) });

/** Hidden CEO-only tool: an urgent notification to every staff member who
 * has connected Telegram, regardless of role. */
export async function sendBroadcastAction(
  _prevState: TelegramActionState,
  formData: FormData,
): Promise<TelegramActionState> {
  try {
    await requireAdmin();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  if (!isTelegramConfigured()) return { error: 'notConfigured' };

  const parsed = broadcastSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const staff = await sql<{ telegram_id: number }[]>`
    select telegram_id from profiles where telegram_id is not null
  `;

  try {
    const text = `📢 <b>E'lon</b>\n\n${escapeTelegramText(parsed.data.message)}`;
    await sendTelegramMessageToMany(staff.map((s) => s.telegram_id), text);
  } catch (error) {
    console.error('Telegram Notification Failed:', error instanceof Error ? error.message : error);
  }

  return { success: true };
}

/** One-time (or after-a-domain-change) setup step: registers this
 * deployment's webhook URL with Telegram, done from the UI instead of a
 * manual curl command. CEO-only, same as the rest of /telegram-setup. */
export async function registerTelegramWebhookAction(): Promise<{ error?: string; success?: boolean }> {
  try {
    await requireAdmin();
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!telegramBot) return { error: 'notConfigured' };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!appUrl || !secret) return { error: 'notConfigured' };

  try {
    await telegramBot.telegram.setWebhook(`${appUrl}/api/telegram/webhook`, { secret_token: secret });
    return { success: true };
  } catch {
    return { error: 'webhookFailed' };
  }
}
