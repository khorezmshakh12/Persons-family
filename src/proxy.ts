import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/lib/supabase/middleware';

const handleI18nRouting = createIntlMiddleware(routing);

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
  const intlResponse = handleI18nRouting(request);

  // The intl middleware already decided to redirect (e.g. "/" -> "/en").
  // Let that happen first; auth gating runs once the locale is in the URL.
  if (intlResponse.headers.get('location')) {
    return intlResponse;
  }

  const { user, mustChangePassword } = await getSessionUser(request, intlResponse);
  const { locale, path } = localeAndPath(request.nextUrl.pathname);

  const redirectTo = (target: string) => {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${target}`;
    return copyCookies(intlResponse, NextResponse.redirect(url));
  };

  if (!user) {
    return path === '/login' ? intlResponse : redirectTo('/login');
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
