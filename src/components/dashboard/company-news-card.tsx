import { getFormatter, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
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
  const supabase = await createClient();

  const [{ data: news }, { data: unseenCount }] = await Promise.all([
    supabase
      .from('company_news')
      .select('id, title, content, created_at')
      .gte('created_at', companyNewsCutoff())
      .order('created_at', { ascending: false })
      .limit(3),
    supabase.rpc('unseen_company_news_count'),
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
        {!!unseenCount && unseenCount > 0 && (
          <span className="animate-pop-in flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.85)]">
            {unseenCount}
          </span>
        )}
      </div>
      {isAdmin && <CompanyNewsInlineForm />}
      {!news || news.length === 0 ? (
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
