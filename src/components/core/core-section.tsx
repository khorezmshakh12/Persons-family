import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { coreViews, type CoreView } from '@/lib/core-state';
import { CoreFrame } from './core-frame';

/** A site section that is one Core v2 page (Inbox, Sales, HR, Report,
 * Platform settings). Access follows Core's own rules (department / boss /
 * CEO-edited ACL) — see coreViews(). */
export async function CoreSection({ view, navKey }: { view: CoreView; navKey: string }) {
  const { profile } = await getAuthState();
  const locale = await getLocale();
  if (!profile) redirect({ href: { pathname: '/login', query: { reason: 'session' } }, locale });
  if (!(await coreViews(profile!)).includes(view)) redirect({ href: '/dashboard', locale });
  const t = await getTranslations('nav');
  return <CoreFrame view={view} title={t(navKey)} />;
}
