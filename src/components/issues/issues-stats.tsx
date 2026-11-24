'use client';

import { AlertTriangle, CheckCircle2, CircleDot, Clock, Hourglass, Inbox, UserX } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { localizeMonths } from '@/lib/month-names';
import { roleLabel } from '@/lib/roles';
import { cn } from '@/lib/utils';
import type { IssueStats } from '@/lib/actions/issue-stats';

const CATEGORIES = ['sayt_it', 'texnik_jihoz', 'oquv_jarayoni', 'moliya', 'xodimlar', 'boshqa', 'none'];

const CARD = 'rounded-au-card border border-au-line bg-au-card p-5 shadow-au-card';

/**
 * Issues analytics for the CEO (redesigned 2026-10-06). Pure renderer — every
 * number comes pre-computed from getIssueStatsAction.
 */
export function IssuesStats({ stats }: { stats: IssueStats | null }) {
  const tStaff = useTranslations('staff');
  const t = useTranslations('iss.st');
  const tc = useTranslations('iss.cat');
  const locale = useLocale();
  const fmtDays = (d: number | null) => (d == null ? '—' : d < 1 ? t('hours', { n: Math.max(1, Math.round(d * 24)) }) : t('days', { n: d.toLocaleString('en-US') }));
  if (!stats) return <div className={cn(CARD, 'text-sm text-au-muted')}>{t('loadFailed')}</div>;
  const { overall: o, aging, byMonth, byAssignee, byCategory, byReporterRole } = stats;
  const openNow = o.open + o.inProgress;

  const tiles = [
    { n: t('open'), v: o.open, d: t('inReview', { n: o.inProgress }), Icon: CircleDot, tone: 'text-au-accent-text bg-au-accent-soft' },
    { n: t('thisMonth'), v: o.createdThisMonth, d: t('resolvedMonth', { n: o.resolvedThisMonth }), Icon: Inbox, tone: 'text-au-info bg-au-info-soft' },
    { n: t('rate'), v: `${o.resolutionRate}%`, d: t('ofTotal', { a: o.resolved, b: o.total }), Icon: CheckCircle2, tone: 'text-au-ok bg-au-ok-soft' },
    { n: t('avg'), v: fmtDays(o.avgResolutionDays), d: t('median', { n: fmtDays(o.medianResolutionDays) }), Icon: Clock, tone: 'text-au-ink bg-au-card-2' },
    { n: t('stale'), v: o.stale, d: t('notClosed'), Icon: AlertTriangle, tone: o.stale ? 'text-au-bad bg-au-bad-soft' : 'text-au-muted bg-au-card-2' },
    { n: t('unassigned'), v: o.unassigned, d: t('unassignedHint'), Icon: UserX, tone: o.unassigned ? 'text-au-bad bg-au-bad-soft' : 'text-au-muted bg-au-card-2' },
  ];

  const maxM = Math.max(1, ...byMonth.flatMap((m) => [m.created, m.resolved]));
  const ageRows = [
    { n: t('lt1'), v: aging.lt1, c: 'bg-au-ok' },
    { n: t('d13'), v: aging.d1to3, c: 'bg-au-info' },
    { n: t('d37'), v: aging.d3to7, c: 'bg-au-accent' },
    { n: t('gt7'), v: aging.gt7, c: 'bg-au-bad' },
  ];
  const maxCat = Math.max(1, ...byCategory.map((c) => c.total));
  const maxRole = Math.max(1, ...byReporterRole.map((r) => r.raised));

  return (
    <section className="flex flex-col gap-[18px]" aria-label={t('aria')}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map(({ n, v, d, Icon, tone }) => (
          <div key={n} className={cn(CARD, 'flex flex-col gap-2 p-4')}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-au-muted">{n}</span>
              <span className={cn('grid size-7 place-items-center rounded-full', tone)}>
                <Icon className="size-3.5" />
              </span>
            </div>
            <span className="text-2xl font-bold tracking-tight text-au-ink tabular-nums">{v}</span>
            <span className="text-[11px] leading-snug text-au-faint">{d}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-12">
        <div className={cn(CARD, 'lg:col-span-8')}>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
            <h3 className="text-sm font-bold text-au-ink">{t('sixMonths')}</h3>
            <span className="ml-auto flex items-center gap-3 text-[11px] text-au-muted">
              <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-au-line" />{t('received')}</span>
              <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-au-ok" />{t('resolved')}</span>
            </span>
          </div>
          <div className="grid h-[190px] grid-cols-6 items-end gap-3">
            {byMonth.map((m) => (
              <div key={m.monthKey} className="flex h-full flex-col items-center justify-end gap-1.5">
                <div className="flex h-full w-full items-end justify-center gap-1">
                  {(
                    [
                      [m.created, 'bg-au-line', t('receivedL')],
                      [m.resolved, 'bg-au-ok', t('resolvedL')],
                    ] as const
                  ).map(([v, c, n]) => (
                    <div key={n} className="flex h-full w-full max-w-[26px] flex-col items-center justify-end gap-1">
                      <span className="text-[10px] font-semibold text-au-muted tabular-nums">{v || ''}</span>
                      <div
                        className={cn('w-full rounded-t-md transition-[height] duration-500', c)}
                        style={{ height: `${Math.max(v ? 4 : 0, (v / maxM) * 150)}px` }}
                        title={t('barTip', { m: localizeMonths(m.label, locale), v, n })}
                      />
                    </div>
                  ))}
                </div>
                <span className="text-[11px] font-medium text-au-muted capitalize">{localizeMonths(m.label, locale)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={cn(CARD, 'lg:col-span-4')}>
          <div className="mb-4 flex items-center gap-2">
            <Hourglass className="size-4 text-au-muted" />
            <h3 className="text-sm font-bold text-au-ink">{t('age')}</h3>
            <span className="ml-auto text-xs text-au-muted">{t('count', { n: openNow })}</span>
          </div>
          {openNow === 0 ? (
            <p className="py-8 text-center text-sm text-au-muted">{t('noneOpen')}</p>
          ) : (
            <>
              <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-au-card-2">
                {ageRows.map((r) => (r.v ? <div key={r.n} className={r.c} style={{ flex: r.v }} title={`${r.n}: ${r.v}`} /> : null))}
              </div>
              <ul className="flex flex-col gap-2.5">
                {ageRows.map((r) => (
                  <li key={r.n} className="flex items-center gap-2 text-sm">
                    <i className={cn('size-2.5 shrink-0 rounded-full', r.c)} />
                    <span className="flex-1 text-au-ink">{r.n}</span>
                    <b className="tabular-nums text-au-ink">{r.v}</b>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className={cn(CARD, 'lg:col-span-6')}>
          <h3 className="mb-3 text-sm font-bold text-au-ink">{t('byOwner')}</h3>
          {byAssignee.length === 0 ? (
            <p className="text-sm text-au-muted">{t('noData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold tracking-wide text-au-faint uppercase">
                    <th className="pb-2">{t('staff')}</th>
                    <th className="pb-2 text-right">{t('open')}</th>
                    <th className="pb-2 text-right">{t('solved')}</th>
                    <th className="pb-2 text-right">{t('avgShort')}</th>
                  </tr>
                </thead>
                <tbody>
                  {byAssignee.map((a) => (
                    <tr key={a.id ?? 'none'} className="border-t border-au-line">
                      <td className="py-2 font-medium text-au-ink">{a.id ? a.name : <span className="text-au-bad">{t('noOwner')}</span>}</td>
                      <td className={cn('py-2 text-right tabular-nums', a.open ? 'font-bold text-au-accent-text' : 'text-au-muted')}>{a.open}</td>
                      <td className="py-2 text-right text-au-ink tabular-nums">{a.resolved}</td>
                      <td className="py-2 text-right text-au-muted tabular-nums">{fmtDays(a.avgDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={cn(CARD, 'lg:col-span-3')}>
          <h3 className="mb-3 text-sm font-bold text-au-ink">{t('categories')}</h3>
          <ul className="flex flex-col gap-2.5">
            {byCategory.map((c) => (
              <li key={c.category} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-au-ink">{CATEGORIES.includes(c.category) ? tc(c.category) : c.category}</span>
                  <span className="shrink-0 text-au-muted tabular-nums">
                    {c.total}
                    {c.open ? <b className="ml-1 text-au-accent-text">{t('nOpen', { n: c.open })}</b> : null}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-au-card-2">
                  <div className="h-full rounded-full bg-au-accent" style={{ width: `${(c.total / maxCat) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className={cn(CARD, 'lg:col-span-3')}>
          <h3 className="mb-3 text-sm font-bold text-au-ink">{t('raisedBy')}</h3>
          <ul className="flex flex-col gap-2.5">
            {byReporterRole.map((r) => (
              <li key={r.role} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-au-ink">{roleLabel(tStaff, r.role)}</span>
                  <span className="shrink-0 text-au-muted tabular-nums">
                    {r.raised} · <b className={r.resolutionRate >= 80 ? 'text-au-ok' : 'text-au-accent-text'}>{r.resolutionRate}%</b>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-au-card-2">
                  <div className="h-full rounded-full bg-au-info" style={{ width: `${(r.raised / maxRole) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
