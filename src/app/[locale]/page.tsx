import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function RootLocalePage() {
  const { user, profile } = await getAuthState();
  const locale = await getLocale();

  if (user) {
    redirect({ href: profile?.must_change_password ? '/set-password' : '/dashboard', locale });
  } else {
    redirect({ href: '/login', locale });
  }
}
