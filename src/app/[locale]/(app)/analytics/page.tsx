import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { RolesDonutChart } from '@/components/dashboard/roles-donut-chart';
import { GrowthChart } from '@/components/dashboard/growth-chart';
import { GlassCardSkeleton } from '@/components/skeletons/glass-skeletons';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const t = await getTranslations('analytics');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <div className="rounded-3xl border border-white/20 bg-white/10 p-8 text-white shadow-xl backdrop-blur-md">
        <h1 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <p className="mt-1 text-white/70">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Suspense fallback={<GlassCardSkeleton />}>
          <RolesDonutChart large />
        </Suspense>
        <Suspense fallback={<GlassCardSkeleton />}>
          <GrowthChart large />
        </Suspense>
      </div>
    </div>
  );
}
