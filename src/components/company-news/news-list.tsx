'use client';

import { useState } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { deleteNewsAction } from '@/lib/actions/company-news';
import { DeleteNewsButton } from './delete-news-button';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

type NewsItem = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  created_by: string | null;
  author: { first_name: string; last_name: string } | null;
};

export function NewsList({
  news: initialNews,
  isAdmin,
  currentUserId,
}: {
  news: NewsItem[];
  isAdmin: boolean;
  currentUserId: string;
}) {
  const t = useTranslations('companyNews');
  const format = useFormatter();
  const [news, setNews] = useState(initialNews);

  // Same optimistic pattern as IssuesBoard/TaskBoard: remove immediately,
  // put it back and surface a toast only if the delete actually fails.
  function handleRequestDelete(item: NewsItem) {
    const previousNews = news;
    setNews((prev) => prev.filter((n) => n.id !== item.id));

    (async () => {
      const formData = new FormData();
      formData.set('id', item.id);
      const result = await deleteNewsAction(formData);
      if (result?.error) {
        setNews(previousNews);
        toast.error(t(`errors.${result.error}`));
      }
    })();
  }

  if (news.length === 0) {
    return <p className="text-sm text-white/70">{t('noNews')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {news.map((item) => {
        const canDelete = isAdmin || item.created_by === currentUserId;
        return (
          <div key={item.id} className={cn(GLASS_CARD, 'flex flex-col gap-2 p-6')}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-medium">{item.title}</h2>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-white/60">
                  {format.dateTime(new Date(item.created_at), { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                {canDelete && <DeleteNewsButton onConfirm={() => handleRequestDelete(item)} />}
              </div>
            </div>
            <p className="text-sm whitespace-pre-wrap text-white/80">{item.content}</p>
            {item.author && (
              <span className="text-xs text-white/60">
                {t('postedBy', { name: `${item.author.first_name} ${item.author.last_name}` })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
