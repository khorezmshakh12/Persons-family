'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { CARD_TITLE, SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { EmployeeTaskStat } from '@/lib/aurora-dashboard';

type SortKey = 'name' | 'assigned' | 'done' | 'onTimeRate' | 'overdue' | 'stars';

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'name', label: 'colName', numeric: false },
  { key: 'assigned', label: 'colAssigned', numeric: true },
  { key: 'done', label: 'colDone', numeric: true },
  { key: 'onTimeRate', label: 'colOnTime', numeric: true },
  { key: 'overdue', label: 'colOverdue', numeric: true },
  { key: 'stars', label: 'colStars', numeric: true },
];

/**
 * CEO panel: the CEO doesn't assign tasks to themself, so instead of a "my
 * tasks" block the dashboard shows per-employee task statistics. Every column
 * header sorts (click again to flip the direction).
 */
export function EmployeeStatsTable({ rows, className }: { rows: EmployeeTaskStat[] | null; className?: string }) {
  const t = useTranslations('aurora');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'done', dir: 'desc' });

  const sorted = useMemo(() => {
    if (!rows) return [];
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name) * dir;
      // "No done tasks yet" (null on-time rate) always sinks to the bottom.
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === null && bv === null) return a.name.localeCompare(b.name);
      if (av === null) return 1;
      if (bv === null) return -1;
      return ((av as number) - (bv as number)) * dir || a.name.localeCompare(b.name);
    });
  }, [rows, sort]);

  const onSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );

  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col p-5', className)}>
      <div className="mb-3">
        <h2 className={CARD_TITLE}>{t('empStatsTitle')}</h2>
        <p className="text-xs text-au-muted">{t('empStatsSub')}</p>
      </div>

      {!rows ? (
        <p className="py-10 text-center text-sm text-au-muted">{t('noData')}</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-au-muted">{t('empStatsEmpty')}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-au-line">
                {COLUMNS.map((c) => {
                  const active = sort.key === c.key;
                  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={cn('py-2 font-medium', c.numeric ? 'text-right' : 'text-left')}
                    >
                      <button
                        type="button"
                        onClick={() => onSort(c.key)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-1 text-xs transition-colors hover:text-au-ink',
                          active ? 'text-au-ink' : 'text-au-muted',
                        )}
                      >
                        {t(c.label)}
                        <Icon className={cn('size-3', !active && 'text-au-faint')} aria-hidden />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const rate = r.onTimeRate;
                return (
                  <tr key={r.id} className="border-b border-au-line last:border-0">
                    <td className="py-2.5 pr-3 font-semibold text-au-ink">{r.name}</td>
                    <td className="py-2.5 text-right tabular-nums text-au-ink">{r.assigned}</td>
                    <td className="py-2.5 text-right tabular-nums text-au-ink">{r.done}</td>
                    <td className="py-2.5 text-right">
                      {rate === null ? (
                        <span className="text-au-faint">—</span>
                      ) : (
                        <span className="inline-flex items-center justify-end gap-2">
                          <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-au-card-2 sm:block" aria-hidden>
                            <span
                              className={cn(
                                'block h-full rounded-full',
                                rate >= 80 ? 'bg-au-ok' : rate >= 50 ? 'bg-au-accent' : 'bg-au-bad',
                              )}
                              style={{ width: `${rate}%` }}
                            />
                          </span>
                          <span className="w-10 tabular-nums text-au-ink">{rate}%</span>
                        </span>
                      )}
                    </td>
                    <td
                      className={cn(
                        'py-2.5 text-right tabular-nums',
                        r.overdue > 0 ? 'font-bold text-au-bad' : 'text-au-ink',
                      )}
                    >
                      {r.overdue}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-au-accent-text">{r.stars} ★</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
