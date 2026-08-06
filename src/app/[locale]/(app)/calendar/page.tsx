import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { LessonsCalendar } from '@/components/calendar/lessons-calendar';
import { GlassCardSkeleton } from '@/components/skeletons/glass-skeletons';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const t = await getTranslations('calendar');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-8">
      <div className="rounded-3xl border border-white/20 bg-white/10 p-8 text-white shadow-xl backdrop-blur-md">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <p className="mt-1 text-white/70">{t('subtitle')}</p>
      </div>

      <Suspense fallback={<GlassCardSkeleton />}>
        <LessonsCalendar />
      </Suspense>
    </div>
  );
}
