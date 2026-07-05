import { getFormatter, getTranslations } from 'next-intl/server';

type NewsItem = { id: string; title: string; content: string; created_at: string };

export async function CompanyNewsCard({ news }: { news: NewsItem[] }) {
  const t = await getTranslations('dashboard');
  const format = await getFormatter();

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-medium">{t('companyNews.title')}</h2>
      {news.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('companyNews.noNews')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {news.map((item) => (
            <div key={item.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.title}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {format.dateTime(new Date(item.created_at), { dateStyle: 'medium' })}
                </span>
              </div>
              <p className="text-muted-foreground line-clamp-2 text-sm">{item.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
