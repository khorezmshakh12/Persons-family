'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';
import { requireCeo } from '@/lib/auth/require-admin';
import { telegramBot, isTelegramConfigured, sendTelegramMessageToMany, escapeTelegramText } from '@/lib/telegram';

export type TelegramActionState = { error?: string; success?: boolean } | undefined;

/** Mints a fresh single-use link token for the current user (clearing any
 * of their previous unused ones first) — embedded into the deep link/QR
 * code shown on their own Settings page. */
export async function createTelegramLinkTokenAction(): Promise<{ token?: string; error?: string }> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const supabase = await createClient();
  await supabase.from('telegram_link_tokens').delete().eq('profile_id', user.id);
  const { data, error } = await supabase
    .from('telegram_link_tokens')
    .insert({ profile_id: user.id })
    .select('token')
    .single();
  if (error || !data) return { error: 'linkFailed' };
  return { token: data.token };
}

export async function disconnectTelegramAction(): Promise<{ error?: string; success?: boolean }> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ telegram_id: null }).eq('id', user.id);
  if (error) return { error: 'updateFailed' };
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
    await requireCeo();
  } catch {
    return { error: 'forbidden' };
  }

  if (!isTelegramConfigured()) return { error: 'notConfigured' };

  const parsed = broadcastSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data: staff } = await supabase.from('profiles').select('telegram_id').not('telegram_id', 'is', null);

  const text = `📢 *E'lon*\n\n${escapeTelegramText(parsed.data.message)}`;
  await sendTelegramMessageToMany((staff ?? []).map((s) => s.telegram_id), text);

  return { success: true };
}

/** One-time (or after-a-domain-change) setup step: registers this
 * deployment's webhook URL with Telegram, done from the UI instead of a
 * manual curl command. CEO-only, same as the rest of /telegram-setup. */
export async function registerTelegramWebhookAction(): Promise<{ error?: string; success?: boolean }> {
  try {
    await requireCeo();
  } catch {
    return { error: 'forbidden' };
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
