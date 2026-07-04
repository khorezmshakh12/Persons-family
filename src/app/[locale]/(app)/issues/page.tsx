import { getTranslations } from 'next-intl/server';
import { ComingSoonPage } from '@/components/coming-soon-page';

export default async function IssuesPage() {
  const t = await getTranslations();
  return <ComingSoonPage title={t('nav.issues')} description={t('common.comingSoon')} />;
}
