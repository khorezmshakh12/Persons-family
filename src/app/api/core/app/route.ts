import { NextResponse } from 'next/server';
import { getAuthState } from '@/lib/auth/session';
import { loadCore } from '@/lib/core-state';
import { CORE_HTML } from '@/core/core-html';
import { bridgeAfter, bridgeBefore } from '@/core/bridge';

export const dynamic = 'force-dynamic';

/** The Core v2 page, 1:1 from the owner's HTML, with the data bridge injected. */
export async function GET(req: Request) {
  const { profile } = await getAuthState();
  if (!profile) return NextResponse.redirect(new URL('/staff/uz/login?reason=session', req.url));
  const locale = new URL(req.url).searchParams.get('l') === 'ru' ? 'ru' : new URL(req.url).searchParams.get('l') === 'en' ? 'en' : 'uz';
  const { me, state } = await loadCore(profile);
  const html = CORE_HTML.replace('<head>', `<head>${bridgeBefore({ me, state, api: '/staff/api/core/state' })}`).replace(
    /<\/body>(?![\s\S]*<\/body>)/,
    `${bridgeAfter(locale)}</body>`,
  );
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
