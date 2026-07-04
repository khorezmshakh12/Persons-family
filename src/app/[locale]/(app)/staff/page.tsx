import { getTranslations } from 'next-intl/server';
import { ComingSoonPage } from '@/components/coming-soon-page';

export default async function StaffPage() {
  const t = await getTranslations();
  return <ComingSoonPage title={t('nav.staff')} description={t('common.comingSoon')} />;
}
