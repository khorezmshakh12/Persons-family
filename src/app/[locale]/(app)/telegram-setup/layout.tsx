import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';

export default async function TelegramSetupLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getAuthState();
  const locale = await getLocale();

  if (!profile || profile.role !== 'ceo') {
    redirect({ href: '/dashboard', locale });
  }

  return <>{children}</>;
}
