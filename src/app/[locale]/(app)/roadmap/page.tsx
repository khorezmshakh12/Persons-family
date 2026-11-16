import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

/** Roadmap · Mind map lives in HR (owner, 2026-11-16: visible to everyone). */
export default async function RoadmapPage() {
  redirect({ href: '/hr?tab=growth', locale: await getLocale() });
}
