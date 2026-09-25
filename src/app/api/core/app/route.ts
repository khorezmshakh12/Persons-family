import { NextResponse } from 'next/server';
import { getAuthState } from '@/lib/auth/session';
import { CORE_VIEWS, coreViews, loadCore, type CoreView } from '@/lib/core-state';
import { CORE_HTML } from '@/core/core-html';
import { bridgeAfter, bridgeBefore, embedCss } from '@/core/bridge';

export const dynamic = 'force-dynamic';

/** One Core v2 page (?p=home|tasks|inbox|sales|hr|report|settings), 1:1 from
 * the owner's HTML, embedded in the matching site section with the data
 * bridge injected. ?h=auto → grows with its content (Dashboard). */
export async function GET(req: Request) {
  const { profile } = await getAuthState();
  if (!profile) return NextResponse.redirect(new URL('/staff/uz/login?reason=session', req.url));
  const q = new URL(req.url).searchParams;
  const locale = q.get('l') === 'ru' ? 'ru' : q.get('l') === 'en' ? 'en' : 'uz';
  const view = (CORE_VIEWS as readonly string[]).includes(q.get('p') ?? '') ? (q.get('p') as CoreView) : 'home';
  if (!(await coreViews(profile)).includes(view)) return new NextResponse('Forbidden', { status: 403 });
  const auto = q.get('h') === 'auto';
  const { me, state } = await loadCore(profile);
  const html = CORE_HTML.replace(
    '<head>',
    `<head>${bridgeBefore({ me, state, api: '/staff/api/core/state', view, auto })}${embedCss(auto)}`,
  ).replace(/<\/body>(?![\s\S]*<\/body>)/, `${bridgeAfter(locale)}</body>`);
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
