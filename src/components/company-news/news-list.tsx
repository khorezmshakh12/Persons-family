import { getFormatter, getTranslations } from 'next-intl/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

type NewsItem = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author: { first_name: string; last_name: string } | null;
};

export async function NewsList({ news }: { news: NewsItem[] }) {
  const t = await getTranslations('companyNews');
  const format = await getFormatter();

  if (news.length === 0) {
    return <p className="text-sm text-white/70">{t('noNews')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {news.map((item) => (
        <div key={item.id} className={cn(GLASS_CARD, 'flex flex-col gap-2 p-6')}>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-medium">{item.title}</h2>
            <span className="shrink-0 text-xs text-white/60">
              {format.dateTime(new Date(item.created_at), { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap text-white/80">{item.content}</p>
          {item.author && (
            <span className="text-xs text-white/60">
              {t('postedBy', { name: `${item.author.first_name} ${item.author.last_name}` })}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
