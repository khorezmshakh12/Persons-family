import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell/app-shell';
import { BirthdayReminder } from '@/components/birthday-reminder';
import { getUpcomingBirthdays, tashkentTodayKey } from '@/lib/upcoming-birthdays';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getAuthState();
  const locale = await getLocale();

  if (!user || !profile) redirect({ href: '/login', locale });
  if (profile!.must_change_password) redirect({ href: '/set-password', locale });

  const supabase = await createClient();
  const { data: activeProfiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, date_of_birth')
    .eq('is_active', true);
  const upcomingBirthdays = getUpcomingBirthdays(activeProfiles ?? []);
  const birthdayNames = upcomingBirthdays.map((p) => `${p.first_name} ${p.last_name}`);

  return (
    <AppShell profile={profile!}>
      <BirthdayReminder names={birthdayNames} todayKey={tashkentTodayKey()} />
      {children}
    </AppShell>
  );
}
