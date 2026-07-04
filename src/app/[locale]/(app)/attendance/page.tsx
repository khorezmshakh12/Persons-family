import { getTranslations } from 'next-intl/server';
import { ComingSoonPage } from '@/components/coming-soon-page';

export default async function AttendancePage() {
  const t = await getTranslations();
  return <ComingSoonPage title={t('nav.attendance')} description={t('common.comingSoon')} />;
}
