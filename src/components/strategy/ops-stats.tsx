'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import type { OpsMetrics, OpsPeriodKey } from '@/lib/ops-stats';
import type { OpsData } from './operations-workspace';
import { METHODS, dmy, som } from './ops-students-meta';
import { OpsHealth } from './ops-health';

const PERIODS: [OpsPeriodKey, string, string][] = [
  ['day', 'Kunlik', 'kecha'],
  ['week', 'Haftalik', 'o‘tgan hafta'],
  ['month', 'Oylik', 'o‘tgan oy'],
];

type Tile = { l: string; v: (m: OpsMetrics) => number; money?: boolean; lowerIsBetter?: boolean; d?: (m: OpsMetrics) => string };
const TILES: Tile[] = [
  { l: 'Tushum', v: (m) => m.collected, money: true, d: (m) => `${m.payments} ta to‘lov` },
  { l: 'Hisoblangan to‘lovlar', v: (m) => m.charged, money: true, d: (m) => `${m.charges} ta hisob` },
  { l: 'Yangi o‘quvchilar', v: (m) => m.newStudents },
  { l: 'Faol bo‘ldi', v: (m) => m.activated, d: () => 'birinchi to‘lovni qildi' },
  { l: 'Ketdi (arxiv)', v: (m) => m.left, lowerIsBetter: true },
  { l: 'Yangi lidlar', v: (m) => m.newLeads },
];

function Delta({ cur, prev, money, lowerIsBetter, vs }: { cur: number; prev: number; money?: boolean; lowerIsBetter?: boolean; vs: string }) {
  const diff = cur - prev;
  if (diff === 0) return <span className="sx-pl mute">{vs} bilan teng</span>;
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
  const s = data.stats;
  const p = s.periods[period];
  const vs = PERIODS.find(([k]) => k === period)![2];
  const today = data.today.day;
  const bars = period === 'week' ? s.series.slice(-7) : s.series;
  const maxBar = Math.max(1, ...bars.map((b) => b.amount));
  const methodMax = Math.max(1, ...p.cur.methods.map((m) => m.amount));
  const span = p.from === p.to ? dmy(p.from) : `${dmy(p.from)} – ${dmy(p.to)}`;
  const prevSpan = p.prevFrom === p.prevTo ? dmy(p.prevFrom) : `${dmy(p.prevFrom)} – ${dmy(p.prevTo)}`;

  return (
    <div className="sx-grid">
      <div className="sx-card s12 !pb-2">
        <div className="sx-h !mb-0 flex-wrap">
          <h3>Statistika</h3>
          <small>
            {span} · solishtirish: {prevSpan}
          </small>
          <span className="flex-1" />
          <div className="sx-seg">
            {PERIODS.map(([k, n]) => (
              <button key={k} className={cn(period === k && 'on')} onClick={() => setPeriod(k)}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {TILES.map((t) => {
        const cur = t.v(p.cur);
        return (
          <div key={t.l} className="sx-card sx-stat s4">
            <div className="l">{t.l}</div>
            <div className="v">{t.money ? som(cur) : cur}</div>
            <div className="d flex flex-wrap items-center gap-2">
              <Delta cur={cur} prev={t.v(p.prev)} money={t.money} lowerIsBetter={t.lowerIsBetter} vs={vs} />
              {t.d && <span>{t.d(p.cur)}</span>}
            </div>
          </div>
        );
      })}

      <div className="sx-card sx-stat dark s4">
        <div className="l">Faol o‘quvchilar</div>
        <div className="v">{s.snapshot.active}</div>
        <div className="d">to‘lov qilgan va oylik to‘lovi bor · hozir</div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">Qarzdorlar</div>
        <div className="v" style={{ color: s.snapshot.debtors ? 'var(--au-bad)' : undefined }}>{s.snapshot.debtors}</div>
        <div className="d">jami qarz {som(s.snapshot.debt)}</div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">Muzlatilgan</div>
        <div className="v">{s.snapshot.frozen}</div>
        <div className="d">o‘quvchi · hozir</div>
      </div>

      <div className="sx-card s4">
        <div className="sx-h">
          <h3>To‘lov usuli</h3>
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
          <div className="text-xs text-au-faint">Bu davrda to‘lov yo‘q</div>
        )}
      </div>

      <div className="sx-card s8">
        <div className="sx-h">
          <h3>Kunlik tushum</h3>
          <small>{period === 'week' ? 'oxirgi 7 kun' : 'oxirgi 31 kun'}</small>
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
    </div>
  );
}
