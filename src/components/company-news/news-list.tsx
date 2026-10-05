'use client';

import { useState, useTransition } from 'react';
import { Pencil } from 'lucide-react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { deleteNewsAction, updateNewsAction } from '@/lib/actions/company-news';
import { DeleteNewsButton } from './delete-news-button';
import { CardCarousel } from '@/components/ui/card-carousel';
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
  const [editing, setEditing] = useState<{ id: string; title: string; content: string } | null>(null);
  const [saving, startSave] = useTransition();
  function saveEdit() {
    if (!editing || !editing.title.trim() || !editing.content.trim()) return;
    const draft = editing;
    startSave(async () => {
      const fd = new FormData();
      fd.set('id', draft.id);
      fd.set('title', draft.title);
      fd.set('content', draft.content);
      const res = await updateNewsAction(fd);
      if (res?.error) return void toast.error(t(`errors.${res.error}`));
      setNews((prev) => prev.map((n) => (n.id === draft.id ? { ...n, title: draft.title.trim(), content: draft.content.trim() } : n)));
      setEditing(null);
      toast.success(t('edited'));
    });
  }
  // CreateNewsDialog lives outside this component and triggers its own
  // revalidatePath — that re-renders the parent server component with a
  // fresh `news` array, but a useState initializer only reads its argument
  // on mount. Adjusting state during render (React's documented pattern for
  // this, rather than a useEffect) re-syncs it so a newly published post
  // shows up without a manual reload. IssuesBoard/TaskBoard predate this
  // component and have the same gap; not touched here since a live-created
  // item on those boards wasn't part of what broke.
  const [prevInitialNews, setPrevInitialNews] = useState(initialNews);
  if (initialNews !== prevInitialNews) {
    setPrevInitialNews(initialNews);
    setNews(initialNews);
  }

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
    return <p className="text-sm text-au-muted">{t('noNews')}</p>;
  }

  const cardItems = news.map((item, index) => {
    const canDelete = isAdmin || item.created_by === currentUserId;
    return (
      <div
        key={item.id}
        data-carousel-item
        style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
        className={cn(
          GLASS_CARD,
          'enter-rise-sm flex flex-col gap-2 p-6 shrink-0 scroll-snap-start w-full sm:w-1/2 lg:w-1/3'
        )}
      >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-heading text-lg font-medium">{item.title}</h2>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-au-muted">
                  {format.dateTime(new Date(item.created_at), { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                {canDelete && (
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-full text-au-muted hover:bg-au-card-2 hover:text-au-ink"
                    aria-label={t('edit')}
                    onClick={() => setEditing({ id: item.id, title: item.title, content: item.content })}
                  >
                    <Pencil className="size-4" />
                  </button>
                )}
                {canDelete && <DeleteNewsButton onConfirm={() => handleRequestDelete(item)} />}
              </div>
            </div>
            {editing?.id === item.id ? (
              <div className="flex flex-col gap-2">
                <input
                  className="rounded-au-ctl border border-au-line bg-au-card px-3 py-2 text-sm font-semibold text-au-ink outline-none focus:border-au-accent"
                  maxLength={200}
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
                <textarea
                  className="min-h-[120px] rounded-au-ctl border border-au-line bg-au-card px-3 py-2 text-sm text-au-ink outline-none focus:border-au-accent"
                  maxLength={5000}
                  value={editing.content}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveEdit}
                    className="rounded-au-ctl bg-au-primary px-4 py-1.5 text-sm font-semibold text-au-primary-ink disabled:opacity-50"
                  >
                    {t('save')}
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="rounded-au-ctl border border-au-line px-4 py-1.5 text-sm font-semibold text-au-ink">
                    {t('cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap text-au-ink">{item.content}</p>
            )}
            {item.author && (
              <span className="text-xs text-au-muted">
                {t('postedBy', { name: `${item.author.first_name} ${item.author.last_name}` })}
              </span>
            )}
      </div>
    );
  });

  return <CardCarousel itemCount={news.length}>{cardItems}</CardCarousel>;
}
