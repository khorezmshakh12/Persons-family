import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

/** The Telegram centre moved to Platform › Telegram (v8-B, 2026-10-10). */
export default async function TelegramSetupPage() {
  redirect({ href: '/platform?tab=telegram', locale: await getLocale() });
}
