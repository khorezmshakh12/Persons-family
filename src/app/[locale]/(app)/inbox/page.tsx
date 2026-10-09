import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

/** Inbox section removed (owner, 2026-10-05) — old links land on the Dashboard. */
export default async function InboxPage() {
  redirect({ href: '/dashboard', locale: await getLocale() });
}
