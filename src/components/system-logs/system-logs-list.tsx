'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { fetchSystemLogsPageAction, type SystemLogRow } from '@/lib/actions/system-logs';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 30;

export function SystemLogsList({ initialLogs }: { initialLogs: SystemLogRow[] }) {
  const t = useTranslations('systemLogs');
  const format = useFormatter();
  const [logs, setLogs] = useState(initialLogs);
  const [hasMore, setHasMore] = useState(initialLogs.length === PAGE_SIZE);
  const [isPending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isPending) {
          startTransition(async () => {
            const next = await fetchSystemLogsPageAction(logs.length);
            setLogs((prev) => [...prev, ...next]);
            setHasMore(next.length === PAGE_SIZE);
          });
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs.length, hasMore, isPending]);

  if (logs.length === 0) {
    return <p className="text-sm text-white/70">{t('noLogs')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {logs.map((log) => (
        <div key={log.id} className={cn(GLASS_CARD, 'flex items-start justify-between gap-4 p-4')}>
          <div className="flex flex-col gap-1">
            <span className="inline-flex w-fit rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-teal-200 uppercase">
              {log.action_type}
            </span>
            <p className="text-sm text-white">{log.description}</p>
            <span className="text-xs text-white/50">
              {log.author ? `${log.author.first_name} ${log.author.last_name}` : t('unknownUser')}
            </span>
          </div>
          <span className="shrink-0 text-xs text-white/50">
            {format.dateTime(new Date(log.created_at), { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        </div>
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-4">
          <Loader2 className="size-5 animate-spin text-white/50" />
        </div>
      )}
    </div>
  );
}
