'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import type { OpsMetrics, OpsPeriodKey } from '@/lib/ops-stats';
import type { OpsData } from './operations-workspace';
import { useLocale, useTranslations } from 'next-intl';
import { localizeMonths } from '@/lib/month-names';
import { dmy, som, useOpsMeta } from './ops-students-meta';
import { OpsHealth } from './ops-health';
import { BarChart, Legend, LineChart } from './ops-charts';

const PERIODS: [OpsPeriodKey, string, string][] = [
  ['day', 'pDay', 'vsDay'],
  ['week', 'pWeek', 'vsWeek'],
  ['month', 'pMonth', 'vsMonth'],
];

type Tr = ReturnType<typeof useTranslations>;
type Tile = { l: string; v: (m: OpsMetrics) => number; money?: boolean; lowerIsBetter?: boolean; d?: (m: OpsMetrics, tr: Tr) => string };
const TILES: Tile[] = [
  { l: 'collected', v: (m) => m.collected, money: true, d: (m, tr) => tr('nPayments', { n: m.payments }) },
  { l: 'charged', v: (m) => m.charged, money: true, d: (m, tr) => tr('nCharges', { n: m.charges }) },
  { l: 'newStudents', v: (m) => m.newStudents },
  { l: 'activated', v: (m) => m.activated, d: (_m, tr) => tr('activatedHint') },
  { l: 'left', v: (m) => m.left, lowerIsBetter: true },
  { l: 'newLeads', v: (m) => m.newLeads },
];

function Delta({ cur, prev, money, lowerIsBetter, vs }: { cur: number; prev: number; money?: boolean; lowerIsBetter?: boolean; vs: string }) {
  const tr = useTranslations('ops.stats');
  const diff = cur - prev;
  if (diff === 0) return <span className="sx-pl mute">{tr('equal', { vs })}</span>;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  const abs = Math.abs(diff);
  return (
    <span className={cn('sx-pl', good ? 'ok' : 'bad')} title={`${vs}: ${money ? som(prev) : prev}`}>
      {diff > 0 ? '↑' : '↓'} {money ? formatUZS(abs) : abs}
      {prev > 0 ? ` · ${Math.round((abs / prev) * 100)}%` : ''}
    </span>
  );
}

export function OpsStats({ data }: { data: OpsData }) {
  const [period, setPeriod] = useState<OpsPeriodKey>('day');
  const tr = useTranslations('ops.stats');
  const to = useTranslations('ops');
  const { METHODS, reasonLabel } = useOpsMeta();
  const s = data.stats;
  const money = data.statsMoney;
  const people = data.statsPeople;
  const tiles = TILES.filter((t) => (t.money ? money : people));
  const p = s.periods[period];
  const vs = tr(PERIODS.find(([k]) => k === period)![2]);
  const today = data.today.day;
  const bars = period === 'week' ? s.series.slice(-7) : s.series;
  const maxBar = Math.max(1, ...bars.map((b) => b.amount));
  const methodMax = Math.max(1, ...p.cur.methods.map((m) => m.amount));
  const span = p.from === p.to ? dmy(p.from) : `${dmy(p.from)} – ${dmy(p.to)}`;
  const prevSpan = p.prevFrom === p.prevTo ? dmy(p.prevFrom) : `${dmy(p.prevFrom)} – ${dmy(p.prevTo)}`;
  const locale = useLocale();
  const t0 = s.trends[period];
  const t = { ...t0, labels: t0.labels.map((l) => localizeMonths(l, locale)) };
  const tSpan = tr(period === 'day' ? 'last31d' : period === 'week' ? 'last12w' : 'last12m');
  const states = [
    { n: tr('sActive'), v: s.snapshot.active, c: 'var(--au-ok)' },
    { n: tr('sOpen'), v: Math.max(0, s.snapshot.open - s.snapshot.active), c: 'var(--au-info)' },
    { n: tr('sFrozen'), v: s.snapshot.frozen, c: 'var(--au-accent)' },
  ];
  const stateTotal = Math.max(1, states.reduce((a, x) => a + x.v, 0));
  const reasonMax = Math.max(1, ...t.reasons.map((r) => r.n));
  const debt = s.debtHistory;

  return (
    <div className="sx-grid">
      <div className="sx-card s12 !pb-2">
        <div className="sx-h !mb-0 flex-wrap">
          <h3>{tr('title')}</h3>
          <small>{tr('compare', { span, prev: prevSpan })}</small>
          <span className="flex-1" />
          <div className="sx-seg">
            {PERIODS.map(([k, n]) => (
              <button key={k} className={cn(period === k && 'on')} onClick={() => setPeriod(k)}>
                {tr(n)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!money && (
        <div className="sx-card s12 text-xs text-au-muted">
          {tr('noMoney')}
        </div>
      )}

      {tiles.map((t) => {
        const cur = t.v(p.cur);
        return (
          <div key={t.l} className="sx-card sx-stat s4">
            <div className="l">{tr(t.l)}</div>
            <div className="v">{t.money ? som(cur) : cur}</div>
            <div className="d flex flex-wrap items-center gap-2">
              <Delta cur={cur} prev={t.v(p.prev)} money={t.money} lowerIsBetter={t.lowerIsBetter} vs={vs} />
              {t.d && <span>{t.d(p.cur, tr)}</span>}
            </div>
          </div>
        );
      })}

      {people && (
      <>
      <div className="sx-card sx-stat dark s4">
        <div className="l">{tr('activeStudents')}</div>
        <div className="v">{s.snapshot.active + s.snapshot.frozen}</div>
        <div className="d">{tr('activeHint', { a: s.snapshot.active, f: s.snapshot.frozen })}</div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">{tr('debtors')}</div>
        <div className="v" style={{ color: s.snapshot.debtors ? 'var(--au-bad)' : undefined }}>{s.snapshot.debtors}</div>
        <div className="d">{money ? tr('totalDebt', { sum: som(s.snapshot.debt) }) : tr('minusNow')}</div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">{tr('frozen')}</div>
        <div className="v">{s.snapshot.frozen}</div>
        <div className="d">{tr('studentsNow')}</div>
      </div>

      <div className="sx-card s8">
        <div className="sx-h">
          <h3>{tr('activeCount')}</h3>
          <small>{tSpan}</small>
        </div>
        <LineChart label={tr('activeCount')} labels={t.labels} series={[{ name: tr('activeSeries'), data: t.active, color: 'var(--au-accent)', area: true }]} floor={Math.min(...t.active)} />
        <div className="text-xs text-au-faint">{tr('activeNote')}</div>
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>{tr('state')}</h3>
          <small>{tr('nStudents', { n: stateTotal })}</small>
        </div>
        <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full">
          {states.map((x) => (x.v ? <i key={x.n} style={{ flex: x.v, background: x.c }} /> : null))}
        </div>
        <div className="mt-3.5 flex flex-col gap-2 text-[13px]">
          {states.map((x) => (
            <div key={x.n} className="grid grid-cols-[10px_1fr_auto] items-center gap-2.5">
              <i className="size-2.5 rounded-[3px]" style={{ background: x.c }} />
              <span className="text-au-ink">{x.n}</span>
              <span className="tabular-nums text-au-muted">
                {x.v} · {Math.round((x.v / stateTotal) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="sx-card s6">
        <div className="sx-h">
          <h3>{tr('inOut')}</h3>
          <small>{tSpan}</small>
        </div>
        <BarChart
          label={tr('inOutLabel')}
          labels={t.labels}
          series={[
            { name: tr('newStudent'), data: t.newStudents, color: 'var(--au-ok)' },
            { name: tr('gone'), data: t.left, color: 'var(--au-bad)' },
          ]}
        />
        <Legend items={[{ name: tr('newStudent'), color: 'var(--au-ok)' }, { name: tr('gone'), color: 'var(--au-bad)' }]} />
      </div>
      <div className="sx-card s6">
        <div className="sx-h">
          <h3>{tr('funnel')}</h3>
          <small>{tSpan}</small>
        </div>
        <LineChart
          label={tr('funnelLabel')}
          height={190}
          labels={t.labels}
          series={[
            { name: tr('newLeads'), data: t.newLeads, color: 'var(--au-info)' },
            { name: tr('activated'), data: t.activated, color: 'var(--au-accent)' },
          ]}
        />
        <Legend items={[{ name: tr('newLeads'), color: 'var(--au-info)' }, { name: tr('activatedFirst'), color: 'var(--au-accent)' }]} />
      </div>

      <div className="sx-card s6">
        <div className="sx-h">
          <h3>{tr('debtorsCount')}</h3>
          <small>{tr('dailySnap')}</small>
        </div>
        {debt.length >= 2 ? (
          <LineChart label={tr('debtorsCount')} height={170} labels={debt.map((d) => d.day.slice(8, 10) + '.' + d.day.slice(5, 7))} series={[{ name: tr('debtors'), data: debt.map((d) => d.debtors), color: 'var(--au-bad)' }]} />
        ) : (
          <div className="py-6 text-center text-2xl font-bold tabular-nums text-au-bad">{s.snapshot.debtors}</div>
        )}
        <div className="text-xs text-au-faint">{tr('debtNote')}</div>
      </div>
      <div className="sx-card s6">
        <div className="sx-h">
          <h3>{tr('why')}</h3>
          <small>{span}</small>
        </div>
        {t.reasons.length ? (
          <div className="flex flex-col gap-2.5">
            {t.reasons.map((r) => (
              <div key={r.reason} className="grid grid-cols-[minmax(110px,200px)_1fr_auto] items-center gap-2.5 text-[13px]">
                <span className="truncate text-au-ink" title={reasonLabel(r.reason)}>{reasonLabel(r.reason)}</span>
                <span className="sx-hb">
                  <i className="bg-au-accent" style={{ width: `${(r.n / reasonMax) * 100}%` }} />
                </span>
                <span className="tabular-nums text-au-muted">{r.n}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-au-faint">{tr('nobodyLeft')}</div>
        )}
      </div>
      </>
      )}

      {money && (
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>{tr('inCharge')}</h3>
          <small>{tSpan}</small>
        </div>
        <LineChart
          label={tr('inChargeLabel')}
          money
          height={210}
          labels={t.labels}
          series={[
            { name: tr('collected'), data: t.collected, color: 'var(--au-ok)', area: true },
            { name: tr('chargedS'), data: t.charged, color: 'var(--au-bad)' },
          ]}
        />
        <Legend items={[{ name: tr('collectedPay'), color: 'var(--au-ok)' }, { name: tr('chargedFull'), color: 'var(--au-bad)' }]} />
      </div>
      )}

      {money && (
      <>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>{to('c.payMethod')}</h3>
          <small>{span}</small>
        </div>
        {p.cur.methods.length ? (
          <div className="flex flex-col gap-2.5">
            {p.cur.methods.map((m) => (
              <div key={m.method} className="grid grid-cols-[minmax(80px,120px)_1fr_auto] items-center gap-2.5 text-[13px]">
                <span className="truncate text-au-ink">{METHODS[m.method] ?? m.method}</span>
                <span className="sx-hb">
                  <i className="bg-au-accent" style={{ width: `${(Math.max(0, m.amount) / methodMax) * 100}%` }} />
                </span>
                <span className="tabular-nums text-au-muted">
                  {formatUZS(m.amount)} · {m.n}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-au-faint">{tr('noPayments')}</div>
        )}
      </div>

      <div className="sx-card s8">
        <div className="sx-h">
          <h3>{tr('dailyIncome')}</h3>
          <small>{tr(period === 'week' ? 'last7d' : 'last31d')}</small>
        </div>
        <div className="flex h-40 items-end gap-1">
          {bars.map((b) => {
            const hot = period === 'day' ? b.day === today : b.day >= p.from && b.day <= p.to;
            return (
              <div
                key={b.day}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                title={`${dmy(b.day)} · ${som(b.amount)}`}
              >
                <i
                  className={cn('block w-full rounded-t-sm', hot ? 'bg-au-accent' : 'bg-au-card-2')}
                  style={{ height: `${Math.max(2, (Math.max(0, b.amount) / maxBar) * 100)}%` }}
                />
                {(bars.length <= 7 || b.day.endsWith('01') || b.day === today) && (
                  <span className="text-[10px] tabular-nums text-au-faint">{b.day.slice(8, 10)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <OpsHealth month={`${today.slice(0, 7)}-01`} />
      </>
      )}
    </div>
  );
}
