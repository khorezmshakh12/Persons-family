import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { canSeeFor } from '@/lib/permissions';
import { TaskTrackerFrame } from '@/components/task-tracker/task-tracker-frame';

export const dynamic = 'force-dynamic';

/** Each employee's private Task Tracker — the API only ever serves the
 * signed-in user's own workspace. */
export default async function TaskTrackerPage() {
  const { profile } = await getAuthState();
  const locale = await getLocale();
  if (!profile) redirect({ href: { pathname: '/login', query: { reason: 'session' } }, locale });
  if (!canSeeFor(profile, 'taskTracker')) redirect({ href: '/dashboard', locale });
  const t = await getTranslations('nav');
  return <TaskTrackerFrame title={t('taskTracker')} />;
}
