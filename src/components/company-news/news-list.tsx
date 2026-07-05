import { getFormatter, getTranslations } from 'next-intl/server';

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
    return <p className="text-muted-foreground text-sm">{t('noNews')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {news.map((item) => (
        <div key={item.id} className="bg-card flex flex-col gap-2 rounded-xl border p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-medium">{item.title}</h2>
            <span className="text-muted-foreground shrink-0 text-xs">
              {format.dateTime(new Date(item.created_at), { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{item.content}</p>
          {item.author && (
            <span className="text-muted-foreground text-xs">
              {t('postedBy', { name: `${item.author.first_name} ${item.author.last_name}` })}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
