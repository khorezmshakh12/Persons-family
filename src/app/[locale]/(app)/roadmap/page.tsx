import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

/** Roadmap section removed (owner, 2026-09-26) — old links land on the Dashboard. */
export default async function RoadmapPage() {
  redirect({ href: '/dashboard', locale: await getLocale() });
}
