import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { LessonsCalendar } from '@/components/calendar/lessons-calendar';
import { GlassCardSkeleton } from '@/components/skeletons/glass-skeletons';
import { Page, PageHeader } from '@/components/app-shell/page';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const t = await getTranslations('calendar');

  return (
    <Page width="narrow">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <Suspense fallback={<GlassCardSkeleton />}>
        <LessonsCalendar />
      </Suspense>
    </Page>
  );
}
