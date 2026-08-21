import { getFormatter, getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { unseenCompanyNewsCount } from '@/lib/nav-badges';
import { companyNewsCutoff } from '@/lib/company-news';
import { CompanyNewsInlineForm } from '@/components/dashboard/company-news-inline-form';
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
      where created_at >= ${companyNewsCutoff()}
      order by created_at desc limit 3
    `,
    user ? unseenCompanyNewsCount(user.id) : 0,
  ]);

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
        <p className="text-sm text-white/70">{t('companyNews.noNews')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {news.map((item, i) => (
            <div
              key={item.id}
              style={{ animationDelay: `${delayMs + 120 + i * 60}ms` }}
              className="animate-fade-in-up flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.title}</span>
                <span className="shrink-0 text-xs text-white/60">
                  {format.dateTime(new Date(item.created_at), { dateStyle: 'medium' })}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap text-white/70">{item.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
