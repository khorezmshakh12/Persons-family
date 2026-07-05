import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { HeroCard } from '@/components/dashboard/hero-card';
import { CompanyNewsCard } from '@/components/dashboard/company-news-card';
import { WeeklyProgressCard } from '@/components/dashboard/weekly-progress-card';
import { TeamResultsTable } from '@/components/dashboard/team-results-table';
import { GlassCardSkeleton, GlassTableSkeleton } from '@/components/skeletons/glass-skeletons';

// User-specific and cookie-driven — never attempt to prerender this route.
export const dynamic = 'force-dynamic';

// Each card fetches its own data and streams in behind its own Suspense
// boundary, so the hero + layout paint immediately instead of the whole
// page blocking on the slowest of three independent Supabase queries.
export default async function DashboardPage() {
  const t = await getTranslations('dashboard');
  const { user, profile } = await getAuthState();
  const isAdmin = profile?.role === 'ceo' || profile?.role === 'admin_manager';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <HeroCard firstName={profile?.first_name ?? ''} isAdmin={isAdmin} />
        <div id="company-news">
          <Suspense fallback={<GlassCardSkeleton />}>
            <CompanyNewsCard />
          </Suspense>
        </div>
        <div id="weekly-progress" className="scroll-mt-4">
          <Suspense fallback={<GlassCardSkeleton />}>
            <WeeklyProgressCard userId={user?.id ?? null} />
          </Suspense>
        </div>
      </div>

      {isAdmin && (
        <div id="team-results" className="flex scroll-mt-4 flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-white">{t('teamResults.sectionTitle')}</h2>
          <Suspense fallback={<GlassTableSkeleton rows={5} />}>
            <TeamResultsTable />
          </Suspense>
        </div>
      )}
    </div>
  );
}
