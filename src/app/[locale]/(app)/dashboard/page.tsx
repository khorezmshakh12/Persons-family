import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { HeroCard } from '@/components/dashboard/hero-card';
import { CompanyNewsCard } from '@/components/dashboard/company-news-card';
import { WeeklyProgressCard } from '@/components/dashboard/weekly-progress-card';
import { TeamResultsTable } from '@/components/dashboard/team-results-table';

// User-specific and cookie-driven — never attempt to prerender this route.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const t = await getTranslations('dashboard');
  const { user, profile } = await getAuthState();
  const isAdmin = profile?.role === 'ceo' || profile?.role === 'admin_manager';

  const supabase = await createClient();

  const { data: performance } = user
    ? await supabase.from('staff_performance').select('*').eq('staff_id', user.id).maybeSingle()
    : { data: null };

  const { data: news } = await supabase
    .from('company_news')
    .select('id, title, content, created_at')
    .order('created_at', { ascending: false })
    .limit(3);

  let teamStaff: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    performance: { current_tier: 'A' | 'B' | 'C'; months_in_tier: number } | null;
  }[] = [];

  if (isAdmin) {
    const { data: staffProfiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, avatar_url')
      .in('role', ['teacher', 'assistant'])
      .eq('is_active', true)
      .order('first_name', { ascending: true });

    const { data: performanceRows } = await supabase
      .from('staff_performance')
      .select('staff_id, current_tier, months_in_tier');

    const performanceByStaffId = Object.fromEntries(
      (performanceRows ?? []).map((row) => [row.staff_id, row]),
    );

    teamStaff = (staffProfiles ?? []).map((p) => ({
      ...p,
      performance: performanceByStaffId[p.id] ?? null,
    }));
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <HeroCard firstName={profile?.first_name ?? ''} isAdmin={isAdmin} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div id="company-news">
          <CompanyNewsCard news={news ?? []} />
        </div>
        <div id="weekly-progress" className="scroll-mt-4">
          <WeeklyProgressCard performance={performance} />
        </div>
      </div>

      {isAdmin && (
        <div id="team-results" className="flex scroll-mt-4 flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{t('teamResults.sectionTitle')}</h2>
          <TeamResultsTable staff={teamStaff} />
        </div>
      )}
    </div>
  );
}
