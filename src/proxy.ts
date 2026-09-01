import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/lib/gcp/middleware';

const handleI18nRouting = createIntlMiddleware(routing);

// Kill switch for a full site lockout. Currently ON for the platform
// upgrade — every request (including logged-in users) gets the maintenance
// page and nothing else.
//
// TO BRING THE SITE BACK: change the line below to
//   const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';
// and redeploy `main`.
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';

const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Texnik ishlar</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 12px; font-family: system-ui, -apple-system, sans-serif;
    background: #0f172a; color: #fff; text-align: center; padding: 24px; }
  h1 { font-size: 1.5rem; font-weight: 600; margin: 0; max-width: 34rem; line-height: 1.4; }
  p { margin: 0; font-size: 1rem; color: #94a3b8; max-width: 34rem; }
</style>
</head>
<body>
  <h1>Sayt tuzatish va yangilash ishlari olib borilyapti</h1>
  <p>Iltimos, birozdan so'ng qayta urinib ko'ring.</p>
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

  // NOTE: the true root ("/", i.e. "/staff" once the basePath is applied)
  // 404s instead of next-intl's own middleware redirecting to the default
  // locale — confirmed this is a Next.js + basePath interaction that
  // serves a statically-cached 404 for this exact path WITHOUT ever
  // invoking this middleware at all (an explicit early-return redirect
  // right here, ahead of everything else, still didn't fire). Worked
  // around one level up instead, in persons-staffs-gateway's own
  // next.config.ts redirects(), which intercepts "/staff" before it ever
  // reaches this app.

  // Resolve the session (and mutate `request`'s cookies) *before* running
  // the intl middleware below. next-intl snapshots `request.headers`
  // to build its own response, so if the auth refresh ran after that
  // snapshot, the refreshed session would never make it into this request's
  // render — only into the Set-Cookie header for the *next* request. That
  // mismatch is what used to make navigating to a protected page look like
  // a logout that a manual page refresh "fixed".
  const {
    user,
    mustChangePassword,
    suspended,
    response: authResponse,
  } = await getSessionUser(request);

  const intlResponse = handleI18nRouting(request);
  copyCookies(authResponse, intlResponse);

  // The intl middleware already decided to redirect (e.g. "/" -> "/en").
  // Let that happen first; auth gating runs once the locale is in the URL.
  if (intlResponse.headers.get('location')) {
    return intlResponse;
  }

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
