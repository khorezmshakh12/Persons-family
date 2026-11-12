'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { SURFACE_CARD, BTN_SECONDARY, INPUT } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import type { CadenceStat, TeamItem, TeamStatRow } from '@/lib/checklist-stats';

type StatKey = 'daily' | 'dailyWeek' | 'dailyMonth' | 'weekly' | 'monthly';
type SortKey = 'name' | 'role' | StatKey;

const pctOf = (s: CadenceStat) => (s.total > 0 ? Math.round((s.done / s.total) * 100) : 0);
const CADENCE_LABEL: Record<TeamItem['cadence'], string> = { daily: 'Kunlik', weekly: 'Haftalik', monthly: 'Oylik' };

const shiftDay = (key: string, days: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** CEO/COO team view for a chosen day: each person's (and each position's)
 * daily list that day, the daily list's week/month-to-date %, and the week's
 * weekly + month's monthly list. Rows expand to show every item ✓/✗. Today's
 * view refreshes itself every 20s and on tab focus, so a fresh tick shows up
 * without a reload. Off-lesson teachers show "dars yo'q" instead of 0%. */
export function TeamChecklistTable({
  rows,
  roleLabels,
  periodLabel,
  day,
  today,
}: {
  rows: TeamStatRow[];
  roleLabels: Record<string, string>;
  periodLabel: string;
  day: string;
  today: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('daily');
  const [dir, setDir] = useState<1 | -1>(-1);
  const [open, setOpen] = useState<string | null>(null);
  const roleLabel = (r: string) => roleLabels[r] ?? r;
  const router = useRouter();
  const pathname = usePathname();
  const isToday = day === today;

  // Live: re-fetch while today's view is open. Mount-only effect (router is
  // not stable — see AGENTS.md), reading the latest values through a ref.
  const live = useRef({ router, isToday });
  useEffect(() => {
    live.current = { router, isToday };
  });
  useEffect(() => {
    const tick = () => {
      if (live.current.isToday && document.visibilityState === 'visible') live.current.router.refresh();
    };
    const id = window.setInterval(tick, 20_000);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', tick);
    };
  }, []);

  const goTo = (d: string) => {
    const q = d >= today ? '?tab=team' : `?tab=team&date=${d}`;
    router.push(`${pathname}${q}`);
  };

  const sorted = useMemo(() => {
    // Rows without that list (or off-lesson daily) always go last.
    const rank = (r: TeamStatRow, k: StatKey) =>
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

  // Team totals: summed done/total per column, so the % is item-weighted.
  const sum = (k: StatKey) =>
    rows.reduce(
      (acc, r) => (k === 'daily' && !r.lesson ? acc : { done: acc.done + r[k].done, total: acc.total + r[k].total }),
      { done: 0, total: 0 },
    );
  const withDaily = rows.filter((r) => r.lesson && r.daily.total > 0);
  const fullyDone = withDaily.filter((r) => r.daily.done >= r.daily.total).length;

  const sortBy = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setDir(k === 'name' || k === 'role' ? 1 : -1);
    }
  };

  return (
    <div className={cn(SURFACE_CARD, 'flex flex-col gap-4 p-5')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-au-ink">
          Jamoa · {periodLabel}
          {isToday && <span className="ml-2 align-middle text-xs font-medium text-au-ok">● jonli</span>}
        </h2>
        <div className="flex items-center gap-1.5">
          <button type="button" className={cn(BTN_SECONDARY, 'px-2')} onClick={() => goTo(shiftDay(day, -1))} aria-label="Oldingi kun">
            <ChevronLeft className="size-4" />
          </button>
          <input
            type="date"
            className={cn(INPUT, 'w-40')}
            value={day}
            max={today}
            onChange={(e) => e.target.value && goTo(e.target.value)}
            aria-label="Sana"
          />
          <button
            type="button"
            className={cn(BTN_SECONDARY, 'px-2')}
            onClick={() => goTo(shiftDay(day, 1))}
            disabled={isToday}
            aria-label="Keyingi kun"
          >
            <ChevronRight className="size-4" />
          </button>
          {!isToday && (
            <button type="button" className={BTN_SECONDARY} onClick={() => goTo(today)}>
              Bugun
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Kunlikni to‘liq bajardi" value={`${fullyDone}/${withDaily.length}`} />
        <Kpi label="Kunlik (shu kun)" value={`${pctOf(sum('daily'))}%`} />
        <Kpi label="Kunlik (hafta)" value={`${pctOf(sum('dailyWeek'))}%`} />
        <Kpi label="Kunlik (oy)" value={`${pctOf(sum('dailyMonth'))}%`} />
        <Kpi label="Haftalik" value={`${pctOf(sum('weekly'))}%`} />
        <Kpi label="Oylik" value={`${pctOf(sum('monthly'))}%`} />
      </div>

      <div className="overflow-x-auto rounded-au-ctl border border-au-line">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-au-line text-left text-xs text-au-muted">
              <SortHead k="name" sortKey={sortKey} dir={dir} onSort={sortBy}>Xodim</SortHead>
              <SortHead k="role" sortKey={sortKey} dir={dir} onSort={sortBy}>Rol</SortHead>
              <SortHead k="daily" sortKey={sortKey} dir={dir} onSort={sortBy} className="w-40">Kunlik ({isToday ? 'bugun' : 'shu kun'})</SortHead>
              <SortHead k="dailyWeek" sortKey={sortKey} dir={dir} onSort={sortBy} className="w-36">Kunlik · hafta</SortHead>
              <SortHead k="dailyMonth" sortKey={sortKey} dir={dir} onSort={sortBy} className="w-36">Kunlik · oy</SortHead>
              <SortHead k="weekly" sortKey={sortKey} dir={dir} onSort={sortBy} className="w-36">Haftalik</SortHead>
              <SortHead k="monthly" sortKey={sortKey} dir={dir} onSort={sortBy} className="w-36">Oylik</SortHead>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const expanded = open === r.key;
              return (
                <Fragment key={r.key}>
                  <tr
                    className="cursor-pointer border-b border-au-line last:border-0 hover:bg-au-card-2"
                    onClick={() => setOpen(expanded ? null : r.key)}
                  >
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <ChevronDown className={cn('size-3.5 text-au-faint transition-transform', expanded && 'rotate-180')} />
                        <Link
                          href={`/profile/${r.userId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-au-ink hover:text-au-accent-text"
                        >
                          {r.name}
                        </Link>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-au-muted">{roleLabel(r.role)}</td>
                    <td className="px-3 py-2">
                      {r.lesson ? <StatCell s={r.daily} /> : <span className="text-xs text-au-faint">dars yo‘q</span>}
                    </td>
                    <td className="px-3 py-2"><StatCell s={r.dailyWeek} pctOnly /></td>
                    <td className="px-3 py-2"><StatCell s={r.dailyMonth} pctOnly /></td>
                    <td className="px-3 py-2"><StatCell s={r.weekly} /></td>
                    <td className="px-3 py-2"><StatCell s={r.monthly} /></td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-au-line bg-au-card-2/60">
                      <td colSpan={7} className="px-4 py-3">
                        <ItemList items={r.items} dailyOff={!r.lesson} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-au-muted">
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

function ItemList({ items, dailyOff }: { items: TeamItem[]; dailyOff: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {(['daily', 'weekly', 'monthly'] as const).map((c) => {
        const list = items.filter((i) => i.cadence === c);
        return (
          <div key={c} className="flex flex-col gap-1">
            <div className="text-xs font-semibold text-au-muted">{CADENCE_LABEL[c]}</div>
            {list.length === 0 && <span className="text-xs text-au-faint">—</span>}
            {c === 'daily' && dailyOff && list.length > 0 && <span className="text-xs text-au-faint">Bu kuni dars yo‘q — talab qilinmaydi</span>}
            {list.map((i) => (
              <div key={i.id} className="flex items-start gap-1.5 text-sm">
                {i.done ? (
                  <Check className="mt-0.5 size-3.5 shrink-0 text-au-ok" />
                ) : (
                  <X className="mt-0.5 size-3.5 shrink-0 text-au-bad" />
                )}
                <span className={i.done ? 'text-au-ink' : 'text-au-muted'}>{i.title}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-au-ctl border border-au-line px-3 py-2">
      <div className="text-xs text-au-muted">{label}</div>
      <div className="text-lg font-bold tabular-nums text-au-ink">{value}</div>
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

function StatCell({ s, pctOnly }: { s: CadenceStat; pctOnly?: boolean }) {
  if (s.total === 0) return <span className="text-xs text-au-faint">—</span>;
  const pct = pctOf(s);
  const full = s.done >= s.total;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-au-line">
        <div className={cn('h-full rounded-full', full ? 'bg-au-ok' : 'bg-au-accent')} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('shrink-0 tabular-nums', full ? 'font-semibold text-au-ok' : 'text-au-muted')}>
        {pctOnly ? `${pct}%` : `${s.done}/${s.total} · ${pct}%`}
      </span>
    </div>
  );
}
