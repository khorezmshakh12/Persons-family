import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { TgEntry } from '@/components/app-mode/tg-entry';

export const metadata: Metadata = { title: 'Persons', robots: { index: false, follow: false } };

/** Entry point the Telegram bot's "Persons" button opens (Mini App). Public
 * — proxy.ts lets it through without a session; TgEntry signs in with
 * Telegram's initData and hands over to the dashboard. */
export default async function TgPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TgEntry />;
}
