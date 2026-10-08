'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SURFACE_CARD } from '@/lib/glass';
import { RUBRIC_KEYS, RUBRIC_LABEL, type Rubric } from '@/lib/self-dev-rubric';
import { SELF_DEV_SAVED_EVENT } from './ceo-evaluation-panel';

/* ------------------------------------------------------------ deadline ring */

/** Days left in the month as a ring that draws to its share; apricot at
 * ≤5 days, red on the last day. */
export function DeadlineRing({ daysLeft, daysInMonth, done }: { daysLeft: number; daysInMonth: number; done: boolean }) {
  const t = useTranslations('selfDevelopment.v2');
  const share = done ? 1 : Math.max(0, Math.min(1, daysLeft / daysInMonth));
  const tone = done ? 'var(--au-ok)' : daysLeft <= 1 ? 'var(--au-bad)' : daysLeft <= 5 ? 'var(--au-accent)' : 'var(--au-info)';
  return (
    <div className="relative grid size-[112px] shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--au-card-2)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={tone}
          strokeWidth="9"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${share} 1`}
          className="ms-arc transition-[stroke] duration-500"
        />
      </svg>
      <div className="text-center">
        <div className="text-2xl leading-7 font-bold text-au-ink tabular-nums">{done ? '✓' : daysLeft}</div>
        <div className="text-[10.5px] font-semibold text-au-muted">{done ? t('ring.done') : t('ring.days')}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ streak */

/** 🔥 streak + the last 12 months as dots (filled = report filed). */
export function StreakCard({ streak, months }: { streak: number; months: { key: string; label: string; filed: boolean; score: number | null }[] }) {
  const t = useTranslations('selfDevelopment.v2');
  return (
    <div className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-5')}>
      <div className="flex items-center gap-3">
        <span key={streak} className={cn('grid size-11 place-items-center rounded-full', streak >= 3 ? 'ms-pop-in bg-au-accent-soft text-au-accent-text' : 'bg-au-card-2 text-au-muted')}>
          <Flame className="size-5" strokeWidth={2} aria-hidden />
        </span>
        <div>
          <div className="text-xl leading-6 font-bold text-au-ink tabular-nums">{t('streak.value', { count: streak })}</div>
          <div className="text-xs text-au-muted">{t('streak.label')}</div>
        </div>
      </div>
      <div className="flex justify-between gap-1">
        {months.map((m, i) => (
          <span key={m.key} className="flex flex-col items-center gap-1" title={`${m.label}${m.score !== null ? ` · ${m.score}` : ''}`}>
            <span
              className={cn('ms-wave size-3.5 rounded-full', m.filed ? (m.score !== null ? 'bg-au-ok' : 'bg-au-accent') : 'border border-dashed border-au-line bg-au-card-2')}
              style={{ ['--i' as string]: i }}
            />
            <span className="text-[9px] text-au-faint">{m.label.slice(0, 1)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ rubric bars */

export function RubricBars({ rubric, className }: { rubric: Partial<Rubric> | null; className?: string }) {
  const t = useTranslations('selfDevelopment.v2');
  if (!rubric || !RUBRIC_KEYS.some((k) => rubric[k])) return null;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="text-xs font-semibold text-au-muted">{t('rubricTitle')}</span>
      {RUBRIC_KEYS.map((k) => (
        <div key={k} className="grid grid-cols-[130px_1fr_24px] items-center gap-2 text-[12.5px]">
          <span className="truncate text-au-ink">{RUBRIC_LABEL[k]}</span>
          <span className="h-2 overflow-hidden rounded-full bg-au-card-2">
            <span className="ms-fill block h-full rounded-full bg-au-accent" style={{ width: `${((rubric[k] ?? 0) / 5) * 100}%` }} />
          </span>
          <b className="text-right text-au-ink tabular-nums">{rubric[k] ?? '–'}</b>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ compliance grid */

export type ComplianceRow = { id: string; name: string; cells: { month: string; filed: boolean; score: number | null }[] };

/** CEO: staff × months — who filed, who was scored, at a glance. */
export function ComplianceGrid({ rows, months }: { rows: ComplianceRow[]; months: { key: string; label: string }[] }) {
  const t = useTranslations('selfDevelopment.v2');
  const max = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.score ?? 0)));
  return (
    <div className={cn(SURFACE_CARD, 'overflow-x-auto p-4')}>
      <table className="w-full min-w-[520px] border-separate border-spacing-1.5 text-sm">
        <thead>
          <tr className="text-[11px] font-semibold tracking-wide text-au-faint uppercase">
            <th className="text-left font-semibold">{t('grid.staff')}</th>
            {months.map((m) => (
              <th key={m.key} className="font-semibold">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.id}>
              <td className="max-w-[180px] truncate pr-2 font-semibold text-au-ink">{r.name}</td>
              {r.cells.map((c, ci) => (
                <td key={c.month} className="p-0">
                  <span
                    className={cn(
                      'ms-wave mx-auto grid h-8 min-w-12 place-items-center rounded-[9px] text-[11px] font-bold tabular-nums',
                      !c.filed && 'border border-dashed border-au-line bg-[repeating-linear-gradient(135deg,transparent_0_5px,var(--au-card-2)_5px_10px)] text-au-faint',
                      c.filed && c.score === null && 'bg-au-accent-soft text-au-accent-text',
                      c.filed && c.score !== null && 'text-au-ink',
                    )}
                    style={{
                      ['--i' as string]: ri + ci,
                      ...(c.filed && c.score !== null
                        ? { background: `color-mix(in oklab, var(--au-ok) ${Math.round(18 + (c.score / max) * 62)}%, var(--au-card))` }
                        : {}),
                    }}
                    title={c.filed ? (c.score === null ? t('grid.unrated') : String(c.score)) : t('grid.missing')}
                  >
                    {c.filed ? (c.score ?? '…') : ''}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-au-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="size-3 rounded-[4px] bg-au-ok" /> {t('grid.scored')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="size-3 rounded-[4px] bg-au-accent-soft" /> {t('grid.unrated')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="size-3 rounded-[4px] border border-dashed border-au-line" /> {t('grid.missing')}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ review queue */

export type QueueItem = { id: string; name: string; meta: string; scored: boolean; ai: boolean };

/**
 * CEO two-pane review: the list on the left, the selected report (server-
 * rendered, passed in by id) on the right. Saving an evaluation fires
 * SELF_DEV_SAVED_EVENT; the queue then slides the next unscored report in.
 */
export function ReviewQueue({ items, details }: { items: QueueItem[]; details: Record<string, ReactNode> }) {
  const t = useTranslations('selfDevelopment.v2');
  const [selected, setSelected] = useState<string | null>(items.find((i) => !i.scored)?.id ?? items[0]?.id ?? null);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    function onSaved(e: Event) {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      setSavedIds((prev) => new Set(prev).add(id));
      setSelected((cur) => {
        if (cur !== id) return cur;
        const i = items.findIndex((x) => x.id === id);
        const rest = [...items.slice(i + 1), ...items.slice(0, Math.max(0, i))];
        return rest.find((x) => !x.scored && x.id !== id)?.id ?? cur;
      });
    }
    window.addEventListener(SELF_DEV_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(SELF_DEV_SAVED_EVENT, onSaved);
  }, [items]);

  const done = items.filter((i) => i.scored || savedIds.has(i.id)).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)] lg:items-start">
      <div className={cn(SURFACE_CARD, 'flex flex-col gap-1 p-2 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto')}>
        <div className="px-2 pt-1 pb-2">
          <div className="mb-1 flex justify-between text-[11px] font-semibold text-au-muted">
            <span>{t('queue.progress')}</span>
            <span className="tabular-nums">
              {done}/{items.length}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-au-card-2">
            <div className="h-full rounded-full bg-au-ok transition-[width] duration-500 ease-out" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
          </div>
        </div>
        {items.map((item, i) => {
          const isDone = item.scored || savedIds.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item.id)}
              aria-current={selected === item.id ? 'true' : undefined}
              className={cn(
                'ms-rise flex items-center gap-3 rounded-au-ctl px-3 py-2.5 text-left transition-colors',
                selected === item.id ? 'bg-au-accent-soft ring-1 ring-au-accent/40' : 'hover:bg-au-card-2',
              )}
              style={{ ['--i' as string]: Math.min(i, 8) }}
            >
              <span className={cn('size-2.5 shrink-0 rounded-full', isDone ? 'bg-au-ok' : 'bg-au-accent')} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-au-ink">{item.name}</span>
                <span className="block truncate text-[11px] text-au-faint">{item.meta}</span>
              </span>
              {item.ai && !isDone && <span className="rounded-full bg-au-info-soft px-1.5 py-0.5 text-[10px] font-bold text-au-info">AI</span>}
            </button>
          );
        })}
      </div>
      <div className="min-w-0">
        {selected && (
          <div key={selected} className="ms-enter-right">
            {details[selected]}
          </div>
        )}
      </div>
    </div>
  );
}
