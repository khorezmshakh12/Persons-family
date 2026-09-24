import type { ReactNode } from 'react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Check, CircleAlert, Clock, Hourglass } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { CARD_LINK, CARD_TITLE, CHIP_BAD, CHIP_INFO, CHIP_NEUTRAL, CHIP_OK, SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { isTaskUnderReview } from '@/lib/task-status';
import type { TaskFeedItem } from '@/lib/aurora-dashboard';

/**
 * CEO: "xodimlar bajargan vazifalar" — what employees recently handed in
 * (who, what, when, on time or late).
 * Everyone else: the tasks assigned to them that are still open, with their
 * status and deadline.
 */
export async function TaskFeed({
  items,
  mode,
  className,
}: {
  items: TaskFeedItem[] | null;
  mode: 'ceo' | 'self';
  className?: string;
}) {
  const t = await getTranslations('aurora');
  const format = await getFormatter();
  const now = new Date();
  const b = (chunks: ReactNode) => <b className="font-semibold text-au-ink">{chunks}</b>;

  const statusChip = (item: TaskFeedItem) => {
    if (isTaskUnderReview(item.status)) return <span className={CHIP_INFO}>{t('underReview')}</span>;
    const overdue = item.deadline && new Date(item.deadline).getTime() < now.getTime();
    if (overdue) return <span className={CHIP_BAD}>{t('statusOverdue')}</span>;
    if (item.status === 'pending') return <span className={CHIP_NEUTRAL}>{t('statusTodo')}</span>;
    return <span className={CHIP_NEUTRAL}>{t('statusInProgress')}</span>;
  };

  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col p-5', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className={CARD_TITLE}>{mode === 'ceo' ? t('feedCeoTitle') : t('feedSelfTitle')}</h2>
        <Link href="/tasks" className={cn(CARD_LINK, 'shrink-0')}>
          {t('all')}
        </Link>
      </div>

      {!items || items.length === 0 ? (
        <p className="py-10 text-center text-sm text-au-muted">
          {!items ? t('noData') : mode === 'ceo' ? t('feedEmpty') : t('feedSelfEmpty')}
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-au-line">
          {items.map((item) => {
            if (mode === 'ceo') {
              const Icon = isTaskUnderReview(item.status) ? Hourglass : Check;
              return (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      'grid size-[31px] shrink-0 place-items-center rounded-full border border-au-line bg-au-card-2',
                      item.onTime ? 'text-au-ok' : 'text-au-bad',
                    )}
                  >
                    <Icon className="size-[15px]" strokeWidth={1.75} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] leading-[19px] text-au-ink">
                      {t.rich(item.status === 'done' ? 'feedDone' : 'feedSubmitted', { b, name: item.name ?? '—' })}
                      {': '}
                      {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-au-muted">
                      {item.at ? format.relativeTime(new Date(item.at), now) : '—'}
                    </p>
                  </div>
                  <span className={cn(item.onTime ? CHIP_OK : CHIP_BAD, 'shrink-0')}>
                    {item.onTime ? t('onTime') : t('late')}
                  </span>
                </li>
              );
            }
            const overdue = item.deadline && new Date(item.deadline).getTime() < now.getTime();
            const Icon = overdue ? CircleAlert : Clock;
            return (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <span
                  className={cn(
                    'grid size-[31px] shrink-0 place-items-center rounded-full border border-au-line bg-au-card-2',
                    overdue ? 'text-au-bad' : 'text-au-muted',
                  )}
                >
                  <Icon className="size-[15px]" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] leading-[19px] font-semibold text-au-ink">{item.title}</p>
                  <p className={cn('mt-0.5 truncate text-xs', overdue ? 'text-au-bad' : 'text-au-muted')}>
                    {item.deadline
                      ? t('due', {
                          when: format.dateTime(new Date(item.deadline), {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Asia/Tashkent',
                          }),
                        })
                      : t('noDeadline')}
                    {item.deadline ? ` · ${format.relativeTime(new Date(item.deadline), now)}` : ''}
                  </p>
                </div>
                <span className="shrink-0">{statusChip(item)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
