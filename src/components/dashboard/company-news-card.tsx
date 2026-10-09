import { getFormatter, getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { unseenCompanyNewsCount } from '@/lib/nav-badges';
import { companyNewsCutoff } from '@/lib/company-news';
import { CompanyNewsInlineForm } from '@/components/dashboard/company-news-inline-form';
import { CompanyNewsCarouselInner } from '@/components/dashboard/company-news-carousel-inner';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export async function CompanyNewsCard({
  isAdmin = false,
  delayMs = 0,
}: {
  isAdmin?: boolean;
  delayMs?: number;
}) {
  const t = await getTranslations('dashboard');
  const format = await getFormatter();
  const { user } = await getAuthState();

  const [news, unseenCount] = await Promise.all([
    sql<{ id: string; title: string; content: string; created_at: string }[]>`
      select id, title, content, created_at from company_news
      where created_at >= ${companyNewsCutoff()} and deleted_at is null and (publish_at is null or publish_at <= now())
      order by created_at desc limit 3
    `,
    user ? unseenCompanyNewsCount(user.id) : 0,
  ]);

  const formattedNews = news.map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
    formattedDate: format.dateTime(new Date(item.created_at), { dateStyle: 'medium' }),
  }));

  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-4 p-6')}
    >
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-lg font-medium">{t('companyNews.title')}</h2>
        {/* Server-rendered fresh per visit, so "pop" on every load with
         * something unseen reads the same as "a new one just landed" —
         * no client-side realtime subscription needed for this card. */}
        {unseenCount > 0 && (
          <span className="animate-pop-in flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.85)]">
            {unseenCount}
          </span>
        )}
      </div>
      {isAdmin && <CompanyNewsInlineForm />}
      {news.length === 0 ? (
        <p className="text-sm text-au-muted">{t('companyNews.noNews')}</p>
      ) : (
        <CompanyNewsCarouselInner news={formattedNews} delayMs={delayMs} />
      )}
    </div>
  );
}
