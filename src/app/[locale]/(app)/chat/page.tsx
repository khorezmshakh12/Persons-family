import { getTranslations } from 'next-intl/server';
import { ComingSoonPage } from '@/components/coming-soon-page';

export default async function ChatPage() {
  const t = await getTranslations();
  return <ComingSoonPage title={t('nav.chat')} description={t('common.comingSoon')} />;
}
