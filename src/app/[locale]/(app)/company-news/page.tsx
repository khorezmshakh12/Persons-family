import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { companyNewsCutoff } from '@/lib/company-news';
import { CreateNewsDialog } from '@/components/company-news/create-news-dialog';
import { NewsList } from '@/components/company-news/news-list';
import { MarkCompanyNewsSeen } from '@/components/company-news/mark-company-news-seen';

export const dynamic = 'force-dynamic';

export default async function CompanyNewsPage() {
  const t = await getTranslations('companyNews');
  const { user, profile } = await getAuthState();
  const isAdmin = profile?.role === 'ceo';

  const rows = await sql<
    { id: string; title: string; content: string; created_at: string; created_by: string; author_first_name: string | null; author_last_name: string | null }[]
  >`
    select n.id, n.title, n.content, n.created_at, n.created_by,
      a.first_name as author_first_name, a.last_name as author_last_name
    from company_news n
    left join profiles a on a.id = n.created_by
    where n.created_at >= ${companyNewsCutoff()}
    order by n.created_at desc
  `;
  const news = rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    created_at: r.created_at,
    created_by: r.created_by,
    author: r.author_first_name ? { first_name: r.author_first_name, last_name: r.author_last_name! } : null,
  }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <MarkCompanyNewsSeen />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{t('title')}</h1>
        {isAdmin && <CreateNewsDialog />}
      </div>
      <NewsList news={news} isAdmin={isAdmin} currentUserId={user?.id ?? ''} />
    </div>
  );
}
