import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

/** The lessons calendar became a layer of the team calendar (Jamoa hayoti,
 * 2026-10-09) — old links land there. */
export default async function CalendarPage() {
  redirect({ href: '/company-news?tab=calendar', locale: await getLocale() });
}
