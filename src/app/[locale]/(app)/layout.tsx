import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { AppShell } from '@/components/app-shell/app-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getAuthState();
  const locale = await getLocale();

  if (!user || !profile) redirect({ href: '/login', locale });
  if (profile!.must_change_password) redirect({ href: '/set-password', locale });

  return <AppShell profile={profile!}>{children}</AppShell>;
}
