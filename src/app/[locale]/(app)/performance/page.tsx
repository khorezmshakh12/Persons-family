import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

// Performance was merged into /self-development (tier, weekly progress,
// and the bonus/penalty ledger now live as a section on that same page) —
// this keeps the old URL from 404ing for anyone with it bookmarked.
export default async function PerformancePage() {
  const locale = await getLocale();
  redirect({ href: '/self-development', locale });
}
