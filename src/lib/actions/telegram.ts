'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { getAuthState } from '@/lib/auth/session';
import { authErrorCode, requireCap, requireSection } from '@/lib/auth/require-admin';
import { telegramBot, TELEGRAM_WEBAPP_URL } from '@/lib/telegram';
import { recordNotifications } from '@/lib/notifications';

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
    await requireCap('staff.manage');
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
  logSystemAction('staff.telegram_disconnect', `Disconnected Telegram of ${parsed.data.id}`);

  revalidatePath('/[locale]/staff', 'page');
  return { success: true };
}

/** Platform › Telegram: an in-app reminder (bell, "Harakat kerak") to the
 * people who haven't linked Telegram yet — they can't be messaged there. */
export async function remindTelegramLinkAction(userIds: string[]): Promise<{ error?: string; sent?: number }> {
  try {
    await requireSection('telegramSetup');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const ids = z.array(z.string().uuid()).max(500).safeParse(userIds);
  if (!ids.success || !ids.data.length) return { error: 'invalidInput' };
  const rows = await sql<{ id: string }[]>`
    select p.id from profiles p
    where p.id = any(${sql.array(ids.data)}::uuid[]) and p.is_active and p.telegram_id is null
      and not exists (select 1 from notifications n where n.user_id = p.id and n.ref = 'tg-link' and n.action)`;
  await recordNotifications(
    rows.map((r) => r.id),
    {
      kind: 'system',
      text: "📱 Telegram'ni ulang\nVazifa, oylik va murojaat xabarlari telefoningizga kelishi uchun: Sozlamalar › Telegram › «Ulash».",
      href: '/settings?s=telegram',
      action: true,
      ref: 'tg-link',
    },
  );
  return { sent: rows.length };
}

/** One-time (or after-a-domain-change) setup step: registers this
 * deployment's webhook URL with Telegram, done from the UI instead of a
 * manual curl command. CEO-only, same as the rest of /telegram-setup. */
export async function registerTelegramWebhookAction(): Promise<{ error?: string; success?: boolean }> {
  try {
    await requireSection('telegramSetup');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!telegramBot) return { error: 'notConfigured' };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!appUrl || !secret) return { error: 'notConfigured' };

  try {
    // NEXT_PUBLIC_APP_URL is the bare Cloud Run host — every real route
    // (including this API one) actually lives under next.config.ts's
    // basePath: '/staff'. Registering the unprefixed URL 404s on every
    // delivery attempt; live getWebhookInfo confirmed exactly that ("Wrong
    // response from the webhook: 404 Not Found", updates piling up
    // undelivered) — same /staff-omission bug already hit twice today in
    // the Cloud Scheduler job URLs.
    await telegramBot.telegram.setWebhook(`${appUrl}/staff/api/telegram/webhook`, { secret_token: secret });
    // The chat's menu button opens the Persons Mini App (app/[locale]/tg).
    // Best-effort: a failure here must not report the webhook as failed.
    await telegramBot.telegram
      .setChatMenuButton({ menuButton: { type: 'web_app', text: 'Persons', web_app: { url: TELEGRAM_WEBAPP_URL } } })
      .catch((error: unknown) => console.error('setChatMenuButton failed', error instanceof Error ? error.message : error));
    return { success: true };
  } catch {
    return { error: 'webhookFailed' };
  }
}
