import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Instrument_Serif, Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { CursorGlow } from '@/components/cursor-glow';
import { IosActiveFix } from '@/components/ios-active-fix';
import { IntlUzShim } from '@/components/intl-uz-shim';
import { AppModeScript } from '@/components/app-mode/app-mode-script';
import { TelegramBridge } from '@/components/app-mode/telegram-bridge';
import '../globals.css';

// This app ships uz/ru/en. Google Fonts serves each subset as its own
// @font-face with a unicode-range, so the browser only ever fetches the
// chunk it needs — declaring `cyrillic` costs Latin/Uzbek readers nothing.
// Persons Aurora: Inter for all UI text (wired to --au-font-sans in
// aurora.css).
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'latin-ext', 'cyrillic'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin', 'latin-ext', 'cyrillic'],
});

// Display face for the hero's italic name accent only (`font-display
// italic`) — never used anywhere else.
const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin', 'latin-ext'],
  weight: '400',
  style: ['normal', 'italic'],
});

// viewport-fit=cover lets the installed app / Telegram draw under the
// notch; the shell pads itself with env(safe-area-inset-*) (globals.css).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4f2ee',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'app' });
  const loginPath = `/staff/${locale}/login`;
  return {
    // The Cloud Run URL (NEXT_PUBLIC_APP_URL) is an implementation detail
    // that shouldn't itself be indexed — persons-staffs.uz is the domain
    // actually meant to surface in search, so metadata resolves against it
    // regardless of which host served the response.
    metadataBase: new URL('https://www.persons-staffs.uz'),
    title: {
      default: `Persons Staff | ${t('name')}`,
      template: `%s | Persons Staff`,
    },
    description: t('description'),
    applicationName: 'Persons Staff',
    // Installable as a home-screen app (app/manifest.ts).
    manifest: '/staff/manifest.webmanifest',
    appleWebApp: { capable: true, title: 'Persons', statusBarStyle: 'default' },
    icons: {
      apple: [{ url: '/staff/app-icons/apple-touch-icon.png', sizes: '180x180' }],
    },
    keywords: ['Persons Staff', 'Persons Education', 'persons-staffs.uz', 'xodimlar platformasi', 'staff platform'],
    alternates: {
      canonical: loginPath,
      languages: {
        uz: '/staff/uz/login',
        ru: '/staff/ru/login',
        en: '/staff/en/login',
      },
    },
    openGraph: {
      type: 'website',
      siteName: 'Persons Staff',
      url: loginPath,
      title: `Persons Staff | ${t('name')}`,
      description: t('description'),
      locale,
    },
    robots: { index: true, follow: true },
    // Drop the Google Search Console verification token into
    // NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION (an env var on the Cloud Run
    // service) — no code change needed to activate it once the request is
    // approved.
    verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
      ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
      : undefined,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <AppModeScript />
        <IntlUzShim />
        <ThemeProvider attribute="class" forcedTheme="light" disableTransitionOnChange>
          <NextIntlClientProvider messages={messages}>
            <CursorGlow />
            <IosActiveFix />
            <TelegramBridge />
            {children}
            <Toaster />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
