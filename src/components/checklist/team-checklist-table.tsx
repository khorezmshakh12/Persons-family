'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/navigation';
import type { CadenceStat, TeamStatRow } from '@/lib/checklist-stats';

type SortKey = 'name' | 'role' | 'daily' | 'weekly' | 'monthly';

const pctOf = (s: CadenceStat) => (s.total > 0 ? Math.round((s.done / s.total) * 100) : 0);

/** CEO/COO team view: every employee's checklist completion for today (daily),
 * this week (weekly) and this month (monthly), as done/total. Any column header
 * sorts. Off-lesson teachers show "dars yo'q" for daily instead of a false 0%. */
export function TeamChecklistTable({
  rows,
  roleLabels,
  periodLabel,
}: {
  rows: TeamStatRow[];
  roleLabels: Record<string, string>;
  periodLabel: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('daily');
  const [dir, setDir] = useState<1 | -1>(-1);
  const roleLabel = (r: string) => roleLabels[r] ?? r;

  const sorted = useMemo(() => {
    // Ranks a cell for sorting: rows without that list (or off-lesson daily)
    // always go last, whichever direction is chosen.
    const rank = (r: TeamStatRow, k: 'daily' | 'weekly' | 'monthly') =>
      r[k].total === 0 || (k === 'daily' && !r.lesson) ? null : pctOf(r[k]);
    return [...rows].sort((a, b) => {
      if (sortKey === 'name' || sortKey === 'role') {
        const x = sortKey === 'name' ? a.name : roleLabel(a.role);
        const y = sortKey === 'name' ? b.name : roleLabel(b.role);
        return x.localeCompare(y) * dir || a.name.localeCompare(b.name);
      }
      const x = rank(a, sortKey);
      const y = rank(b, sortKey);
      if (x === null || y === null) return x === y ? a.name.localeCompare(b.name) : x === null ? 1 : -1;
      return (x - y) * dir || a.name.localeCompare(b.name);
    });
    // roleLabel derives from roleLabels
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, dir, roleLabels]);

  const withDaily = rows.filter((r) => r.lesson && r.daily.total > 0);
  const fullyDone = withDaily.filter((r) => r.daily.done >= r.daily.total).length;
  const avg = withDaily.length ? Math.round(withDaily.reduce((s, r) => s + pctOf(r.daily), 0) / withDaily.length) : 0;

  const sortBy = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setDir(k === 'name' || k === 'role' ? 1 : -1);
    }
  };

  return (
    <div className={cn(SURFACE_CARD, 'flex flex-col gap-4 p-5')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-au-ink">Jamoa · {periodLabel}</h2>
        <div className="flex flex-wrap items-center gap-4 text-sm text-au-muted">
          <span>
            Kunlikni to‘liq bajardi: <b className="tabular-nums text-au-ink">{fullyDone}/{withDaily.length}</b>
          </span>
          <span>
            O‘rtacha (kunlik): <b className="tabular-nums text-au-ink">{avg}%</b>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-au-ctl border border-au-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-au-line text-left text-xs text-au-muted">
              <SortHead k="name" sortKey={sortKey} dir={dir} onSort={sortBy}>Xodim</SortHead>
              <SortHead k="role" sortKey={sortKey} dir={dir} onSort={sortBy}>Rol</SortHead>
              <SortHead k="daily" sortKey={sortKey} dir={dir} onSort={sortBy} className="w-44">Kunlik (bugun)</SortHead>
              <SortHead k="weekly" sortKey={sortKey} dir={dir} onSort={sortBy} className="w-44">Haftalik (shu hafta)</SortHead>
              <SortHead k="monthly" sortKey={sortKey} dir={dir} onSort={sortBy} className="w-44">Oylik (shu oy)</SortHead>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.userId} className="border-b border-au-line last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/profile/${r.userId}`} className="font-medium text-au-ink hover:text-au-accent-text">
                    {r.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-au-muted">{roleLabel(r.role)}</td>
                <td className="px-3 py-2">
                  {r.lesson ? <StatCell s={r.daily} /> : <span className="text-xs text-au-faint">dars yo‘q</span>}
                </td>
                <td className="px-3 py-2">
                  <StatCell s={r.weekly} />
                </td>
                <td className="px-3 py-2">
                  <StatCell s={r.monthly} />
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-au-muted">
                  Checklistli xodim topilmadi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHead({
  k,
  sortKey,
  dir,
  onSort,
  children,
  className,
}: {
  k: SortKey;
  sortKey: SortKey;
  dir: 1 | -1;
  onSort: (k: SortKey) => void;
  children: ReactNode;
  className?: string;
}) {
  const on = sortKey === k;
  return (
    <th className={cn('px-3 py-2 font-semibold', className)} aria-sort={on ? (dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-au-ink">
        {children}
        {on && (dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );
}

function StatCell({ s }: { s: CadenceStat }) {
  if (s.total === 0) return <span className="text-xs text-au-faint">—</span>;
  const pct = pctOf(s);
  const full = s.done >= s.total;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-au-line">
        <div className={cn('h-full rounded-full', full ? 'bg-au-ok' : 'bg-au-accent')} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('shrink-0 tabular-nums', full ? 'font-semibold text-au-ok' : 'text-au-muted')}>
        {s.done}/{s.total}
      </span>
    </div>
  );
}
