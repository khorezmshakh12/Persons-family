import type { Metadata } from 'next';
import { Geist, Geist_Mono, Golos_Text } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { CursorGlow } from '@/components/cursor-glow';
import { IosActiveFix } from '@/components/ios-active-fix';
import '../globals.css';

// This app ships uz/ru/en. Google Fonts serves each subset as its own
// @font-face with a unicode-range, so the browser only ever fetches the
// chunk it needs — declaring `cyrillic` here costs Latin/Uzbek readers
// nothing, but without it Russian text was silently falling back to the
// system font instead of using the self-hosted Geist face.
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin', 'latin-ext', 'cyrillic'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin', 'latin-ext', 'cyrillic'],
});

// Display face for headings/big numbers only (wired to --font-heading in
// globals.css) — a cyrillic-native foundry face rather than a Western
// geometric-sans afterthought, which matters for a staff base that reads
// uz/ru as often as en. Body copy stays on Geist for neutral, high-density
// legibility in tables/forms.
const golosText = Golos_Text({
  variable: '--font-golos',
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['600', '700', '800', '900'],
});

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
      className={`${geistSans.variable} ${geistMono.variable} ${golosText.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" forcedTheme="light" disableTransitionOnChange>
          <NextIntlClientProvider messages={messages}>
            <CursorGlow />
            <IosActiveFix />
            {children}
            <Toaster />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
