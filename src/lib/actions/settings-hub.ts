'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { redirect } from '@/i18n/navigation';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { revokeUserSessions, SESSION_COOKIE_NAME } from '@/lib/gcp/session';
import { logSystemAction } from '@/lib/audit-log';
import { NOTIFY_KINDS } from '@/lib/notify-kinds';

type Result = { error?: string };

const prefsSchema = z.object({
  muted: z.array(z.enum(NOTIFY_KINDS)).max(NOTIFY_KINDS.length),
  quietFrom: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  quietTo: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
});

/** Which Telegram messages this person gets, and their quiet hours. */
export async function saveNotificationPrefsAction(input: z.input<typeof prefsSchema>): Promise<Result> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  const p = prefsSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const quiet = p.data.quietFrom && p.data.quietTo && p.data.quietFrom !== p.data.quietTo;
  try {
    await sql`
      insert into notification_prefs (user_id, muted, quiet_from, quiet_to)
      values (${user.id}, ${sql.array(p.data.muted)}::text[], ${quiet ? p.data.quietFrom : null}, ${quiet ? p.data.quietTo : null})
      on conflict (user_id) do update set muted = excluded.muted, quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to, updated_at = now()`;
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/settings', 'page');
  return {};
}

/** Sign this account out on every device (lost phone, shared computer).
 * Stamps sessions_revoked_at, so every other cookie fails getAuthState(). */
export async function signOutEverywhereAction(): Promise<Result> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  try {
    await revokeUserSessions(user.id);
  } catch (error) {
    console.error('signOutEverywhereAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }
  logSystemAction('auth.signout_all', `Signed out everywhere: ${user.id}`);
  (await cookies()).delete(SESSION_COOKIE_NAME);
  redirect({ href: { pathname: '/login', query: { reason: 'signedOut' } }, locale: await getLocale() });
  return {};
}
