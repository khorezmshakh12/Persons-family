import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, mustChangePassword } = await getAuthState();
  const locale = await getLocale();

  if (!user) redirect({ href: '/login', locale });
  if (mustChangePassword) redirect({ href: '/set-password', locale });

  return <>{children}</>;
}
