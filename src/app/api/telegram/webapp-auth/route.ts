import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db/client';
import { reissueSessionCookie, SESSION_COOKIE_NAME } from '@/lib/gcp/session';
import { verifyTelegramInitData } from '@/lib/telegram-webapp-auth';

/**
 * Telegram Mini App sign-in: the bot's "Persons" button opens /tg, which
 * POSTs Telegram's signed `initData` here. A valid signature proves the
 * request comes from this Telegram account, and profiles.telegram_id was
 * bound to an employee through their personal /start link (see
 * telegram-bot-handlers.ts) — so that pair is enough to open a session,
 * the same way a password login would.
 *
 * Lives under app/api (outside the proxy matcher), so it has no session
 * requirement of its own.
 */
export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ error: 'notConfigured' }, { status: 503 });

  let initData = '';
  try {
    const body = (await req.json()) as { initData?: unknown };
    if (typeof body.initData === 'string') initData = body.initData;
  } catch {
    // fall through to the 400 below
  }
  if (!initData || initData.length > 8192) return NextResponse.json({ error: 'badRequest' }, { status: 400 });

  const tgUser = verifyTelegramInitData(initData, token);
  if (!tgUser) return NextResponse.json({ error: 'invalidSignature' }, { status: 401 });

  try {
    const profiles = await sql<{ id: string; is_active: boolean; must_change_password: boolean; frozen_reason: string | null }[]>`
      select id, is_active, must_change_password, frozen_reason from profiles where telegram_id = ${tgUser.id} limit 2
    `;
    // One Telegram chat bound to two staff accounts: refuse to guess which
    // one to sign into.
    if (profiles.length !== 1) {
      return NextResponse.json({ error: profiles.length ? 'ambiguous' : 'notLinked' }, { status: 404 });
    }
    const [profile] = profiles;
    if (!profile.is_active) {
      return NextResponse.json(
        { error: profile.frozen_reason === 'star_balance' ? 'starFrozen' : 'suspended' },
        { status: 403 },
      );
    }

    const sessionCookie = await reissueSessionCookie(profile.id);
    (await cookies()).set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_APP_URL?.startsWith('http://localhost'),
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 14,
      path: '/',
    });
    return NextResponse.json({ ok: true, next: profile.must_change_password ? '/set-password' : '/dashboard' });
  } catch (error) {
    console.error('telegram webapp-auth failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'unexpected' }, { status: 500 });
  }
}
