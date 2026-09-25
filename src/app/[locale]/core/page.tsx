import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Core v2 — the owner's Claude-designed staff workspace, full screen. */
export default async function CorePage() {
  const { profile } = await getAuthState();
  const locale = await getLocale();
  if (!profile) redirect({ href: { pathname: '/login', query: { reason: 'session' } }, locale });
  return (
    <iframe
      title="Persons Staff Core"
      src={`/staff/api/core/app?l=${locale}`}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 0, zIndex: 50, background: 'var(--au-bg)' }}
    />
  );
}
