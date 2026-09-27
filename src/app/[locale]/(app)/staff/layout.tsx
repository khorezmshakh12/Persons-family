import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { canSee } from '@/lib/permissions';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getAuthState();
  const locale = await getLocale();

  if (!profile || !canSee(profile.role, 'staff')) {
    redirect({ href: '/dashboard', locale });
  }

  return <>{children}</>;
}
