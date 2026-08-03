import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/lib/supabase/middleware';

const handleI18nRouting = createIntlMiddleware(routing);

// Kill switch for a full site lockout — set via `vercel --prod -e
// MAINTENANCE_MODE=true` (a one-off deploy-scoped env var, not persisted to
// the project's normal env var store) so turning it back off is just a
// plain `vercel --prod` redeploy, no flag to remember to unset.
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';

const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Yangilanish jarayonida</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #fff; text-align: center; padding: 24px; }
  h1 { font-size: 1.4rem; font-weight: 600; margin: 0; max-width: 32rem; }
</style>
</head>
<body>
  <h1>Yangilanish jarayonida, Adminga murojat qiling!</h1>
</body>
</html>`;

function localeAndPath(pathname: string): { locale: AppLocale; path: string } {
  const [, maybeLocale, ...rest] = pathname.split('/');
  if ((routing.locales as readonly string[]).includes(maybeLocale)) {
    return { locale: maybeLocale as AppLocale, path: `/${rest.join('/')}` || '/' };
  }
  return { locale: routing.defaultLocale, path: pathname };
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}

export default async function proxy(request: NextRequest) {
  if (MAINTENANCE_MODE) {
    return new NextResponse(MAINTENANCE_HTML, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '3600' },
    });
  }

  const intlResponse = handleI18nRouting(request);

  // The intl middleware already decided to redirect (e.g. "/" -> "/en").
  // Let that happen first; auth gating runs once the locale is in the URL.
  if (intlResponse.headers.get('location')) {
    return intlResponse;
  }

  const { user, mustChangePassword, suspended } = await getSessionUser(request, intlResponse);
  const { locale, path } = localeAndPath(request.nextUrl.pathname);

  const redirectTo = (target: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${target}`;
    url.search = '';
    if (params) for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return copyCookies(intlResponse, NextResponse.redirect(url));
  };

  if (!user) {
    if (path === '/login') return intlResponse;
    return redirectTo('/login', suspended ? { reason: 'suspended' } : undefined);
  }

  if (mustChangePassword) {
    return path === '/set-password' ? intlResponse : redirectTo('/set-password');
  }

  if (path === '/login' || path === '/set-password' || path === '/') {
    return redirectTo('/dashboard');
  }

  return intlResponse;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
