import { getFormatter, getTranslations } from 'next-intl/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

type NewsItem = { id: string; title: string; content: string; created_at: string };

export async function CompanyNewsCard({ news }: { news: NewsItem[] }) {
  const t = await getTranslations('dashboard');
  const format = await getFormatter();

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <h2 className="text-lg font-medium">{t('companyNews.title')}</h2>
      {news.length === 0 ? (
        <p className="text-sm text-white/70">{t('companyNews.noNews')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {news.map((item) => (
            <div key={item.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.title}</span>
                <span className="shrink-0 text-xs text-white/60">
                  {format.dateTime(new Date(item.created_at), { dateStyle: 'medium' })}
                </span>
              </div>
              <p className="line-clamp-2 text-sm text-white/70">{item.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
