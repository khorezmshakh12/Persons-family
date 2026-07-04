import { getTranslations } from 'next-intl/server';
import { ComingSoonPage } from '@/components/coming-soon-page';

export default async function LessonPlansPage() {
  const t = await getTranslations();
  return <ComingSoonPage title={t('nav.lessonPlans')} description={t('common.comingSoon')} />;
}
