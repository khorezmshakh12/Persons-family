import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { CreateNewsDialog } from '@/components/company-news/create-news-dialog';
import { NewsList } from '@/components/company-news/news-list';

export const dynamic = 'force-dynamic';

export default async function CompanyNewsPage() {
  const t = await getTranslations('companyNews');
  const { profile } = await getAuthState();
  const isAdmin = profile?.role === 'ceo' || profile?.role === 'admin_manager';

  const supabase = await createClient();
  const { data: news } = await supabase
    .from('company_news')
    .select('id, title, content, created_at, author:profiles!company_news_created_by_fkey(first_name, last_name)')
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        {isAdmin && <CreateNewsDialog />}
      </div>
      <NewsList news={(news as never) ?? []} />
    </div>
  );
}
