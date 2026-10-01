import { createHmac, timingSafeEqual } from 'node:crypto';

/** How old a Mini App launch payload may be. Telegram keeps the same
 * initData for the whole webview session, so this has to outlive a long
 * session, but it must still expire so a leaked payload stops working. */
const MAX_AGE_SECONDS = 60 * 60 * 24;

export type TelegramWebAppUser = { id: number; first_name?: string; last_name?: string; username?: string };

/**
 * Verifies a Telegram Mini App `initData` string, per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 *   secret = HMAC_SHA256(key = "WebAppData", msg = bot_token)
 *   hash   = hex(HMAC_SHA256(key = secret, msg = data_check_string))
 *
 * where data_check_string is every field except `hash`, as `key=value`,
 * sorted by key and joined with "\n". Returns the Telegram user only when
 * the signature matches and the payload is fresh; null otherwise.
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  now = Math.floor(Date.now() / 1000),
): TelegramWebAppUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || authDate <= 0 || now - authDate > MAX_AGE_SECONDS || authDate - now > 300) {
    return null;
  }

  try {
    const user = JSON.parse(params.get('user') ?? 'null') as TelegramWebAppUser | null;
    return user && Number.isSafeInteger(user.id) && user.id > 0 ? user : null;
  } catch {
    return null;
  }
}
