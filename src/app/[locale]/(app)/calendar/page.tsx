import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { LessonsCalendar } from '@/components/calendar/lessons-calendar';
import { GlassCardSkeleton } from '@/components/skeletons/glass-skeletons';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const t = await getTranslations('calendar');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-1 pb-8 sm:px-7">
      <div className="relative overflow-hidden rounded-au-card bg-au-hero px-6 py-6 text-au-ink sm:px-[30px] sm:py-7">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">
          {t('title')}
        </h1>
        <p className="mt-1 text-au-muted">{t('subtitle')}</p>
      </div>

      <Suspense fallback={<GlassCardSkeleton />}>
        <LessonsCalendar />
      </Suspense>
    </div>
  );
}
