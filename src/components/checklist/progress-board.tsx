'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Check, Flame, Plus, RotateCw } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { toggleTemplateTickAction } from '@/lib/actions/checklist-templates';
import { addGoalAction, toggleGoalAction } from '@/lib/actions/goals';
import {
  checklistDay,
  checklistStreak,
  dayGoals,
  dayLabel,
  goalCell,
  goalSummary,
  isWorkDay,
  openToday,
  spline,
  tickKey,
  type BoardDay,
  type BoardGoal,
  type GoalCell,
  type GoalScope,
  type ProgressBoardData,
} from '@/lib/progress-board';

/* The old Task Tracker's "Quiet Progress" boards, rebuilt on live data
 * (owner, 2026-10-21): a month matrix, a line that moves with every tick,
 * this week's bars, today's ring and an analysis column — once for the
 * role checklist and once for personal goals. Always dark (qp-* tokens). */

const CARD = 'rounded-[18px] border border-qp-line bg-qp-card text-qp-ink';
const TILE = 'rounded-[14px] bg-qp-card-2 p-3.5';
const MONO = 'font-mono tabular-nums';
const SCOPES: { k: GoalScope; n: string }[] = [
  { k: 'day', n: 'Kunlik' },
  { k: 'week', n: 'Haftalik' },
  { k: 'month', n: 'Oylik' },
];

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Shared live state: ticks and goals change optimistically, then save. */
function useBoard(data: ProgressBoardData) {
  const [ticks, setTicks] = useState(() => new Set(data.ticks));
  const [goals, setGoals] = useState<BoardGoal[]>(data.goals);
  const [, start] = useTransition();

  const tick = (itemId: string, day: string) => {
    const k = tickKey(itemId, day);
    const next = !ticks.has(k);
    const apply = (on: boolean) =>
      setTicks((prev) => {
        const s = new Set(prev);
        if (on) s.add(k);
        else s.delete(k);
        return s;
      });
    apply(next);
    start(async () => {
      const res = await toggleTemplateTickAction(itemId, 'daily', next, day);
      if ('error' in res) {
        apply(!next);
        toast.error('Saqlab bo‘lmadi');
      }
    });
  };

  const toggleGoal = (id: string) => {
    const g = goals.find((x) => x.id === id);
    if (!g) return;
    const next = !g.doneDay;
    const set = (doneDay: string | null) => setGoals((p) => p.map((x) => (x.id === id ? { ...x, doneDay } : x)));
    set(next ? data.today : null);
    start(async () => {
      const res = await toggleGoalAction(id, next);
      if ('error' in res) {
        set(g.doneDay);
        toast.error('Saqlab bo‘lmadi');
      }
    });
  };

  const addGoal = (scope: GoalScope, title: string) =>
    start(async () => {
      const periodKey = data.periodKeys[scope];
      const res = await addGoalAction(scope, periodKey, title);
      if ('error' in res || !res.id) return void toast.error('Qo‘shib bo‘lmadi');
      const dueDay = scope === 'day' ? data.today : scope === 'week' ? addDays(periodKey, 6) : data.days[data.days.length - 1].key;
      setGoals((p) => [...p, { id: res.id!, scope, title, periodKey, startDay: data.today, dueDay, doneDay: null }]);
    });

  return { ticks, goals, tick, toggleGoal, addGoal };
}

/* ------------------------------------------------------------ small parts */

function Ring({ pct, size = 150, label }: { pct: number; size?: number; label: ReactNode }) {
  const r = size * 0.4;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--qp-track)" strokeWidth={size * 0.087} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--qp-mint)"
          strokeWidth={size * 0.087}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, pct) / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn(MONO, 'font-bold')} style={{ fontSize: size * 0.2 }}>
          {pct}%
        </span>
        <span className="text-[11px] font-semibold text-qp-muted">{label}</span>
      </div>
    </div>
  );
}

function WeekBars({ week, today, value }: { week: BoardDay[]; today: string; value: (d: BoardDay) => number | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-[110px] items-end gap-3 border-b border-qp-line pb-2">
        {week.map((d) => {
          const v = d.key <= today ? value(d) : null;
          return (
            <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className={cn(MONO, 'text-[10px] text-qp-muted')}>{v === null ? '' : `${v}%`}</span>
              <i
                className={cn('block w-full max-w-[30px] rounded-t-[5px] transition-[height] duration-500', d.key === today ? 'qp-glow bg-qp-mint' : v === null ? 'bg-qp-track' : 'bg-qp-ink')}
                style={{ height: Math.max(4, Math.round((v ?? 0) * 0.8)) }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 pt-1.5">
        {week.map((d) => (
          <span key={d.key} className={cn('flex-1 text-center text-[11px] font-semibold', d.key === today ? 'text-qp-mint' : 'text-qp-muted')}>
            {d.w}
          </span>
        ))}
      </div>
    </div>
  );
}

type Series = { values: (number | null)[]; color: string; dashed?: boolean; area?: boolean };

/** Month line: one point per day that has a value; moves as data changes. */
function MonthLine({ days, series, height = 200, label }: { days: BoardDay[]; series: Series[]; height?: number; label: string }) {
  const W = 1000;
  const base = height - 40;
  const x = (i: number) => 34 + (i * (W - 50)) / Math.max(1, days.length - 1);
  const y = (v: number) => base - (v * (base - 20)) / 100;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full" role="img" aria-label={label}>
      <defs>
        <linearGradient id="qp-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--qp-mint)" stopOpacity=".36" />
          <stop offset="100%" stopColor="var(--qp-mint)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1="34" x2={W - 16} y1={y(v)} y2={y(v)} stroke="var(--qp-line)" />
          <text x="0" y={y(v) + 4} fill="var(--qp-muted)" fontSize="11" className="font-mono">
            {v}
          </text>
        </g>
      ))}
      {series.map((s, si) => {
        const pts = s.values.flatMap((v, i) => (v === null ? [] : [[x(i), y(v)] as [number, number]]));
        if (!pts.length) return null;
        const d = spline(pts);
        const last = pts[pts.length - 1];
        return (
          <g key={si}>
            {s.area && <path d={`${d} L${last[0].toFixed(1)},${base} L${pts[0][0].toFixed(1)},${base} Z`} fill="url(#qp-area)" />}
            <path d={d} fill="none" stroke={s.color} strokeWidth={s.dashed ? 2 : 3} strokeDasharray={s.dashed ? '6 6' : undefined} strokeLinecap="round" strokeLinejoin="round" />
            {!s.dashed && <circle cx={last[0]} cy={last[1]} r="6" fill="var(--qp-bg)" stroke={s.color} strokeWidth="3" />}
          </g>
        );
      })}
      {[0, Math.floor((days.length - 1) / 2), days.length - 1].map((i) => (
        <text key={i} x={x(i) - 20} y={height - 10} fill="var(--qp-muted)" fontSize="11" className="font-mono">
          {dayLabel(days[i].key)}
        </text>
      ))}
    </svg>
  );
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'mint' | 'cyan' | 'red' }) {
  return (
    <div className={TILE}>
      <div className="text-[11px] font-semibold text-qp-muted">{label}</div>
      <div className={cn(MONO, 'text-xl font-bold', tone === 'mint' && 'text-qp-mint', tone === 'cyan' && 'text-qp-cyan', tone === 'red' && 'text-qp-red')}>{value}</div>
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-3.5 text-xs text-qp-muted">
      {items.map(([cls, n]) => (
        <span key={n} className="inline-flex items-center gap-1.5">
          <i className={cn('inline-block size-3 rounded-[4px] border', cls)} />
          {n}
        </span>
      ))}
    </div>
  );
}

const DAY_HEAD = (d: BoardDay, today: string) =>
  cn('grid h-[34px] w-7 place-items-center rounded-lg text-center leading-tight', d.key === today ? 'bg-qp-mint-soft text-qp-mint' : d.off ? 'text-qp-dim' : 'text-qp-muted');
const FOOT = cn(MONO, 'h-6 w-7 rounded-md text-center text-[11px] leading-6 font-bold');

/* ------------------------------------------------------------ boards */

export function ProgressBoard({ data, roleLabel }: { data: ProgressBoardData; roleLabel: string }) {
  const [view, setView] = useState<'checklist' | 'goals'>('checklist');
  const board = useBoard(data);
  return (
    <section className="flex flex-col gap-4 rounded-[24px] bg-qp-bg p-4 text-qp-ink sm:p-6" aria-label="Statistika">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className={cn(MONO, 'text-[11px] tracking-[.16em] text-qp-mint')}>STATISTIKA · {roleLabel.toUpperCase()}</span>
          <h2 className="text-2xl font-extrabold tracking-tight">{data.monthTitle}</h2>
          <p className="text-[13px] text-qp-muted">Belgi qo‘ysangiz — chiziq, foizlar va tahlil darhol o‘zgaradi.</p>
        </div>
        <div className="flex gap-1 rounded-full border border-qp-line p-1">
          {(
            [
              ['checklist', 'Checklist'],
              ['goals', 'Maqsadlar'],
            ] as const
          ).map(([k, n]) => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              aria-pressed={view === k}
              className={cn('h-10 rounded-full px-5 text-[13px] font-bold transition', view === k ? 'bg-qp-mint text-qp-mint-ink' : 'text-qp-muted hover:text-qp-ink')}
            >
              {n}
            </button>
          ))}
        </div>
      </header>
      {view === 'checklist' ? <ChecklistBoard data={data} board={board} onGoals={() => setView('goals')} /> : <GoalsBoard data={data} board={board} />}
    </section>
  );
}

type Board = ReturnType<typeof useBoard>;

function ChecklistBoard({ data, board, onGoals }: { data: ProgressBoardData; board: Board; onGoals: () => void }) {
  const { ticks, goals } = board;
  const { today, items, days } = data;
  const work = days.filter((d) => isWorkDay(d, today));
  const day = (k: string) => checklistDay(items, ticks, k);
  const todayDay = days.find((d) => d.key === today);
  const t = day(today);
  const avg = work.length ? Math.round(work.reduce((s, d) => s + day(d.key).pct, 0) / work.length) : 0;
  const best = work.reduce<BoardDay | null>((b, d) => (!b || day(d.key).pct > day(b.key).pct ? d : b), null);
  const streak = checklistStreak(days, today, (k) => items.length > 0 && day(k).done >= items.length);
  const todayGoals = openToday(goals, 'day', today);

  if (!items.length)
    return <p className={cn(CARD, 'p-6 text-sm text-qp-muted')}>Rolingiz uchun kunlik checklist hali yo‘q — CEO/COO qo‘shganda statistika shu yerda chiqadi.</p>;

  return (
    <>
      <div className="flex flex-wrap gap-4">
        <div className={cn(CARD, 'flex flex-[1_1_300px] flex-col justify-between gap-4 p-5')}>
          <div>
            <h3 className="text-lg font-bold">Bugun · {dayLabel(today)}</h3>
            <p className="text-[13px] text-qp-muted">{todayDay?.off ? 'Bugun dam olish (yoki dars yo‘q) kuni.' : 'Kunlik vazifalar, maqsadlar va odatlar bir joyda.'}</p>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat label="Ketma-ket" value={`${streak} kun`} tone="mint" />
            <Stat label="Oy o‘rtachasi" value={`${avg}%`} />
            <Stat label="Eng yaxshi kun" value={best ? `${best.n} · ${day(best.key).pct}%` : '—'} />
          </div>
        </div>
        <div className={cn(CARD, 'flex flex-[2_1_560px] flex-wrap items-center gap-8 p-5')}>
          <div className="flex min-w-[280px] flex-1 flex-col gap-3">
            <h3 className="text-lg font-bold">Umumiy bajarilish · shu hafta</h3>
            <WeekBars week={data.week} today={today} value={(d) => (d.off ? null : day(d.key).pct)} />
          </div>
          <Ring pct={t.pct} label={`${t.done}/${t.total} bajarildi`} />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[999_1_760px] flex-col gap-4">
          <div className={cn(CARD, 'flex flex-col gap-3.5 p-5')}>
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <h3 className="text-lg font-bold">Kunlik checklist jadvali</h3>
              <Legend
                items={[
                  ['border-qp-mint bg-qp-mint', 'Bajarildi'],
                  ['border-qp-red/50 bg-qp-red-soft', 'Bajarilmadi'],
                  ['qp-hatch border-transparent', 'Dam olish / dars yo‘q'],
                ]}
              />
            </div>
            <div className="overflow-x-auto pb-1">
              <table className="border-separate border-spacing-[3px] text-xs">
                <thead>
                  <tr>
                    <th className="w-[230px] min-w-[230px] pr-2.5 text-left font-semibold text-qp-muted">Vazifa</th>
                    {days.map((d) => (
                      <th key={d.key} className="p-0 font-semibold">
                        <div className={DAY_HEAD(d, today)}>
                          <span className={cn(MONO, 'text-[11px]')}>{d.n}</span>
                          <span className="text-[9px]">{d.w}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td className="max-w-[230px] truncate pr-2.5 font-semibold" title={it.title}>
                        {it.title}
                      </td>
                      {days.map((d) => {
                        const on = ticks.has(tickKey(it.id, d.key));
                        const can = !d.off && d.key <= today && d.key >= data.editableFrom;
                        const state = d.off ? (on ? 'done' : 'off') : d.key > today ? 'future' : on ? 'done' : 'miss';
                        return (
                          <td key={d.key} className="p-0">
                            <button
                              type="button"
                              disabled={!can}
                              onClick={() => board.tick(it.id, d.key)}
                              aria-pressed={on}
                              aria-label={`${it.title}, ${dayLabel(d.key)}`}
                              title={can ? undefined : d.key > today ? 'Hali kelmagan kun' : d.off ? 'Dam olish kuni' : 'Faqat bugun va kecha belgilanadi'}
                              className={cn(
                                'grid size-7 place-items-center rounded-[7px] border transition enabled:hover:scale-110 disabled:cursor-default',
                                state === 'done' && 'qp-glow border-qp-mint bg-qp-mint',
                                state === 'miss' && 'border-qp-red/40 bg-qp-red-soft',
                                state === 'future' && 'border-dashed border-qp-line',
                                state === 'off' && 'qp-hatch border-transparent',
                                d.key === today && 'outline-2 outline-offset-1 outline-qp-mint',
                              )}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td className="pr-2.5 font-semibold text-qp-cyan">Kunlik maqsadlar</td>
                    {days.map((d) => {
                      const g = dayGoals(goals, d.key);
                      return (
                        <td key={d.key} className="p-0">
                          <span
                            className={cn(
                              MONO,
                              'grid size-7 place-items-center rounded-[7px] text-[10px] font-bold',
                              !g.total ? 'bg-qp-card-2 text-qp-dim' : g.done === g.total ? 'bg-qp-cyan-soft text-qp-cyan' : 'bg-qp-yellow-soft text-qp-yellow',
                            )}
                            title={g.total ? `${g.done} / ${g.total} maqsad bajarildi` : undefined}
                          >
                            {g.total ? `${g.done}/${g.total}` : ''}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
                <tfoot>
                  <FootRow label="Progress %" days={days} today={today} value={(d) => (isWorkDay(d, today) ? day(d.key).pct : null)} pct />
                  <FootRow label="Bajarildi" tone="mint" days={days} today={today} value={(d) => (isWorkDay(d, today) ? day(d.key).done : null)} />
                  <FootRow label="Bajarilmadi" tone="red" days={days} today={today} value={(d) => (isWorkDay(d, today) ? items.length - day(d.key).done : null)} />
                </tfoot>
              </table>
            </div>
            <p className="text-[11px] text-qp-muted">Bugungi va kechagi kataklarni shu yerda belgilash mumkin; oldingi kunlar faqat ko‘rish uchun.</p>
          </div>

          <div className={cn(CARD, 'flex flex-col gap-2.5 p-5')}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-bold">Kunlik bajarilish dinamikasi</h3>
              <span className={cn(MONO, 'text-[13px] font-bold text-qp-mint')}>O‘rtacha: {avg}%</span>
            </div>
            <MonthLine
              days={days}
              label="Kunlar bo‘yicha checklist foizi"
              series={[
                { values: days.map((d) => (isWorkDay(d, today) ? day(d.key).pct : null)), color: 'var(--qp-mint)', area: true },
                { values: days.map((d) => (d.key <= today && dayGoals(goals, d.key).total ? dayGoals(goals, d.key).pct : null)), color: 'var(--qp-cyan)', dashed: true },
              ]}
            />
            <div className="flex gap-4 text-[11px] font-semibold">
              <span className="text-qp-mint">— Checklist %</span>
              <span className="text-qp-cyan">- - Kunlik maqsadlar %</span>
            </div>
          </div>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <div className={cn(CARD, 'flex flex-col gap-3.5 p-5')}>
            <h3 className="text-lg font-bold">Tahlil</h3>
            {items.map((it) => {
              const done = work.filter((d) => ticks.has(tickKey(it.id, d.key))).length;
              const pct = work.length ? Math.round((done / work.length) * 100) : 0;
              const tone = pct >= 80 ? 'bg-qp-mint text-qp-mint' : pct >= 60 ? 'bg-qp-yellow text-qp-yellow' : 'bg-qp-red text-qp-red';
              return (
                <div key={it.id} className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2.5 text-xs">
                    <span className="truncate font-semibold">{it.title}</span>
                    <span className={cn(MONO, 'font-bold', tone.split(' ')[1])}>{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-qp-track">
                    <div className={cn('h-full rounded-full transition-[width] duration-500', tone.split(' ')[0])} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] text-qp-muted">
                    {done} / {work.length} ish kuni
                  </span>
                </div>
              );
            })}
          </div>
          <div className={cn(CARD, 'grid grid-cols-2 gap-2.5 p-5')}>
            <h3 className="col-span-2 text-lg font-bold">Davr bo‘yicha</h3>
            <Stat label="Haftalik checklist" value={`${data.weekly.done}/${data.weekly.total}`} />
            <Stat label="Oylik checklist" value={`${data.monthly.done}/${data.monthly.total}`} />
            <button type="button" onClick={onGoals} className={cn(TILE, 'col-span-2 flex items-center justify-between text-left transition hover:bg-qp-track')}>
              <span>
                <span className="block text-[11px] font-semibold text-qp-muted">Bugungi maqsadlar</span>
                <span className={cn(MONO, 'text-xl font-bold text-qp-cyan')}>
                  {todayGoals.filter((g) => g.doneDay).length}/{todayGoals.length}
                </span>
              </span>
              <ArrowRight className="size-4 text-qp-muted" />
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

function FootRow({
  label,
  days,
  today,
  value,
  pct,
  tone,
}: {
  label: string;
  days: BoardDay[];
  today: string;
  value: (d: BoardDay) => number | null;
  pct?: boolean;
  tone?: 'mint' | 'red';
}) {
  return (
    <tr>
      <td className={cn('pt-1 pr-2.5 font-semibold', tone === 'mint' && 'text-qp-mint', tone === 'red' && 'text-qp-red')}>{label}</td>
      {days.map((d) => {
        const v = value(d);
        return (
          <td key={d.key} className="p-0 pt-1">
            <div
              className={cn(
                FOOT,
                pct && v !== null && 'bg-qp-card-2',
                pct && v !== null && (v >= 80 ? 'text-qp-mint' : v < 50 ? 'text-qp-red' : 'text-qp-ink'),
                !pct && (tone === 'mint' ? 'text-qp-mint' : 'text-qp-red'),
                v === null && 'text-qp-dim',
                d.key === today && 'ring-1 ring-qp-mint/40',
              )}
            >
              {v === null ? (pct ? '·' : '') : v}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

const CELL_CLS: Record<GoalCell, string> = {
  none: 'border-transparent bg-transparent',
  done: 'qp-glow border-qp-mint bg-qp-mint',
  open: 'border-qp-yellow/40 bg-qp-yellow-soft',
  late: 'border-qp-red/40 bg-qp-red-soft',
  future: 'border-dashed border-qp-line',
};

function GoalsBoard({ data, board }: { data: ProgressBoardData; board: Board }) {
  const { goals } = board;
  const { today, days } = data;
  const [scope, setScope] = useState<GoalScope>('day');
  const [draft, setDraft] = useState('');
  const todays = openToday(goals, 'day', today);
  const tDone = todays.filter((g) => g.doneDay).length;
  const tPct = todays.length ? Math.round((tDone / todays.length) * 100) : 0;
  const late = goals.filter((g) => !g.doneDay && g.dueDay < today).length;
  const doneAll = goals.filter((g) => g.doneDay);
  const onTimePct = doneAll.length ? Math.round((doneAll.filter((g) => g.doneDay! <= g.dueDay).length / doneAll.length) * 100) : 0;
  const goalDays = days.filter((d) => d.key <= today && dayGoals(goals, d.key).total > 0);
  const avg = goalDays.length ? Math.round(goalDays.reduce((s, d) => s + dayGoals(goals, d.key).pct, 0) / goalDays.length) : 0;
  const sorted = useMemo(() => {
    const order: Record<GoalScope, number> = { month: 0, week: 1, day: 2 };
    return [...goals].sort((a, b) => order[a.scope] - order[b.scope] || a.startDay.localeCompare(b.startDay));
  }, [goals]);
  const list = openToday(goals, scope, data.periodKeys[scope]);

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    board.addGoal(scope, t);
  };

  return (
    <>
      <div className="flex flex-wrap gap-4">
        <div className={cn(CARD, 'flex flex-[1_1_300px] flex-col justify-between gap-4 p-5')}>
          <div>
            <h3 className="text-lg font-bold">Maqsadlar · {dayLabel(today)}</h3>
            <p className="text-[13px] text-qp-muted">Bajarilmagan maqsad o‘chmaydi — bajarilguncha keyingi kunlarga ko‘chadi.</p>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat label="Bugun" value={`${tDone}/${todays.length}`} tone="cyan" />
            <Stat label="Kechikkan" value={late} tone={late ? 'red' : undefined} />
            <Stat label="Vaqtida bajarilgan" value={`${onTimePct}%`} tone="mint" />
          </div>
        </div>
        <div className={cn(CARD, 'flex flex-[2_1_560px] flex-wrap items-center gap-8 p-5')}>
          <div className="flex min-w-[280px] flex-1 flex-col gap-3">
            <h3 className="text-lg font-bold">Kunlik maqsadlar · shu hafta</h3>
            <WeekBars
              week={data.week}
              today={today}
              value={(d) => {
                const g = dayGoals(goals, d.key);
                return g.total ? g.pct : null;
              }}
            />
          </div>
          <Ring pct={tPct} label={`${tDone}/${todays.length} bajarildi`} />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[999_1_760px] flex-col gap-4">
          <div className={cn(CARD, 'flex flex-col gap-3.5 p-5')}>
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <h3 className="text-lg font-bold">Maqsadlar jadvali</h3>
              <Legend
                items={[
                  ['border-qp-mint bg-qp-mint', 'Bajarildi'],
                  ['border-qp-yellow/40 bg-qp-yellow-soft', 'Ochiq'],
                  ['border-qp-red/40 bg-qp-red-soft', 'Kechikkan'],
                ]}
              />
            </div>
            {sorted.length === 0 ? (
              <p className="py-6 text-center text-sm text-qp-muted">Bu oyda maqsad yo‘q — o‘ngdagi maydondan qo‘shing.</p>
            ) : (
              <div className="overflow-x-auto pb-1">
                <table className="border-separate border-spacing-[3px] text-xs">
                  <thead>
                    <tr>
                      <th className="w-[230px] min-w-[230px] pr-2.5 text-left font-semibold text-qp-muted">Maqsad</th>
                      {days.map((d) => (
                        <th key={d.key} className="p-0 font-semibold">
                          <div className={DAY_HEAD({ ...d, off: false }, today)}>
                            <span className={cn(MONO, 'text-[11px]')}>{d.n}</span>
                            <span className="text-[9px]">{d.w}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((g) => (
                      <tr key={g.id}>
                        <td className="max-w-[230px] pr-2.5" title={g.title}>
                          <span className={cn('block truncate font-semibold', g.doneDay && 'text-qp-muted line-through')}>{g.title}</span>
                          <span className="text-[10px] text-qp-muted">{SCOPES.find((s) => s.k === g.scope)?.n}</span>
                        </td>
                        {days.map((d) => {
                          const c = goalCell(g, d.key, today);
                          return (
                            <td key={d.key} className="p-0">
                              <span className={cn('block size-7 rounded-[7px] border', CELL_CLS[c], d.key === today && 'outline-2 outline-offset-1 outline-qp-mint')} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <FootRow label="Kunlik maqsad %" days={days} today={today} pct value={(d) => (d.key <= today && dayGoals(goals, d.key).total ? dayGoals(goals, d.key).pct : null)} />
                    <FootRow label="Bajarildi" tone="mint" days={days} today={today} value={(d) => (dayGoals(goals, d.key).total ? dayGoals(goals, d.key).done : null)} />
                    <FootRow
                      label="Bajarilmadi"
                      tone="red"
                      days={days}
                      today={today}
                      value={(d) => {
                        const g = dayGoals(goals, d.key);
                        return g.total ? g.total - g.done : null;
                      }}
                    />
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className={cn(CARD, 'flex flex-col gap-2.5 p-5')}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-bold">Maqsadlar dinamikasi</h3>
              <span className={cn(MONO, 'text-[13px] font-bold text-qp-cyan')}>O‘rtacha: {avg}%</span>
            </div>
            <MonthLine
              days={days}
              label="Kunlar bo‘yicha kunlik maqsadlar foizi"
              series={[{ values: days.map((d) => (d.key <= today && dayGoals(goals, d.key).total ? dayGoals(goals, d.key).pct : null)), color: 'var(--qp-cyan)', area: true }]}
            />
          </div>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <div className={cn(CARD, 'flex flex-col gap-3.5 p-5')}>
            <h3 className="text-lg font-bold">Bajarish kerak</h3>
            <div className="flex gap-1 rounded-xl bg-qp-bg p-1">
              {SCOPES.map((s) => (
                <button
                  key={s.k}
                  type="button"
                  onClick={() => setScope(s.k)}
                  aria-pressed={scope === s.k}
                  className={cn('h-9 flex-1 rounded-[9px] text-xs font-semibold', scope === s.k ? 'bg-qp-card-2 text-qp-ink' : 'text-qp-muted')}
                >
                  {s.n}
                </button>
              ))}
            </div>
            <GoalList goals={list} periodKey={data.periodKeys[scope]} onToggle={board.toggleGoal} />
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
                maxLength={160}
                placeholder="Yangi maqsad…"
                aria-label="Yangi maqsad"
                className="h-10 min-w-0 flex-1 rounded-[10px] border border-qp-line bg-qp-bg px-3 text-[13px] text-qp-ink outline-none placeholder:text-qp-muted focus:border-qp-mint"
              />
              <button type="button" onClick={add} disabled={!draft.trim()} aria-label="Qo‘shish" className="grid size-10 place-items-center rounded-[10px] bg-qp-mint text-qp-mint-ink disabled:opacity-40">
                <Plus className="size-4" />
              </button>
            </div>
          </div>
          <div className={cn(CARD, 'flex flex-col gap-3.5 p-5')}>
            <h3 className="text-lg font-bold">Tahlil</h3>
            {SCOPES.map((s) => {
              const m = goalSummary(goals, s.k);
              return (
                <div key={s.k} className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold">{s.n}</span>
                    <span className={cn(MONO, 'font-bold text-qp-cyan')}>
                      {m.done}/{m.total} · {m.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-qp-track">
                    <div className="h-full rounded-full bg-qp-cyan transition-[width] duration-500" style={{ width: `${m.pct}%` }} />
                  </div>
                  <span className="text-[11px] text-qp-muted">
                    Vaqtida: {m.onTime} · Kechikib: {m.late} · Ochiq: {m.total - m.done}
                  </span>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </>
  );
}

function GoalList({ goals, periodKey, onToggle }: { goals: BoardGoal[]; periodKey: string; onToggle: (id: string) => void }) {
  if (!goals.length) return <p className="text-xs text-qp-muted">Bu davr uchun maqsad yo‘q.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {goals.map((g) => (
        <li key={g.id} className="flex items-start gap-2.5 rounded-xl bg-qp-card-2 px-3 py-2.5">
          <button
            type="button"
            onClick={() => onToggle(g.id)}
            aria-pressed={!!g.doneDay}
            aria-label="Bajarildi deb belgilash"
            className={cn('grid size-[22px] shrink-0 place-items-center rounded-[7px] border-[1.5px]', g.doneDay ? 'border-qp-mint bg-qp-mint text-qp-mint-ink' : 'border-qp-muted/50')}
          >
            {g.doneDay && <Check className="size-3.5" strokeWidth={3.5} />}
          </button>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={cn('text-[13px] font-semibold', g.doneDay && 'text-qp-muted line-through')}>{g.title}</span>
            {g.periodKey < periodKey && (
              <span className={cn(MONO, 'inline-flex items-center gap-1 text-[10px] text-qp-yellow')}>
                <RotateCw className="size-3" /> {g.scope === 'month' ? g.periodKey : dayLabel(g.periodKey)} dan ko‘chdi
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Dashboard, bottom, full width: today, this week and the month at a glance. */
export function DashboardProgress({ data }: { data: ProgressBoardData }) {
  const board = useBoard(data);
  const { ticks, goals } = board;
  const { today, items, days } = data;
  const day = (k: string) => checklistDay(items, ticks, k);
  const t = day(today);
  const work = days.filter((d) => isWorkDay(d, today));
  const avg = work.length ? Math.round(work.reduce((s, d) => s + day(d.key).pct, 0) / work.length) : 0;
  const streak = checklistStreak(days, today, (k) => items.length > 0 && day(k).done >= items.length);
  const todays = openToday(goals, 'day', today);
  const tDone = todays.filter((g) => g.doneDay).length;
  const wk = goalSummary(openToday(goals, 'week', data.periodKeys.week), 'week');
  const mo = goalSummary(openToday(goals, 'month', data.periodKeys.month), 'month');

  return (
    <section className="flex flex-col gap-4 rounded-[24px] bg-qp-bg p-4 text-qp-ink sm:p-6" aria-label="Checklist va maqsadlar">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className={cn(MONO, 'text-[11px] tracking-[.16em] text-qp-mint')}>CHECKLIST VA MAQSADLAR</span>
          <h2 className="text-[22px] font-extrabold tracking-tight">Bugungi holat va oy dinamikasi</h2>
        </div>
        <Link href="/task-tracker" className="inline-flex h-10 items-center gap-2 rounded-full border border-qp-mint/40 px-4 text-[13px] font-bold text-qp-mint hover:bg-qp-mint-soft">
          To‘liq statistika <ArrowRight className="size-4" />
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <div className={cn(TILE, 'flex items-center gap-4')}>
          <Ring pct={t.pct} size={104} label="" />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-qp-muted">Bugungi checklist</span>
            <span className={cn(MONO, 'text-lg font-bold')}>
              {t.done}/{t.total}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-qp-mint">
              <Flame className="size-3.5" /> {streak} kun ketma-ket
            </span>
          </div>
        </div>
        <Stat label="Checklist · oy o‘rtachasi" value={`${avg}%`} />
        <Stat label="Maqsadlar · bugun" value={`${tDone}/${todays.length}`} tone="cyan" />
        <Stat label="Haftalik · oylik maqsadlar" value={`${wk.done}/${wk.total} · ${mo.done}/${mo.total}`} />
      </div>

      <div className="flex flex-wrap items-stretch gap-3.5">
        <div className={cn(TILE, 'flex flex-[1_1_260px] flex-col gap-2')}>
          <span className="text-sm font-bold">Shu hafta</span>
          <WeekBars week={data.week} today={today} value={(d) => (d.off || !items.length ? null : day(d.key).pct)} />
        </div>
        <div className={cn(TILE, 'flex min-w-0 flex-[2_1_420px] flex-col gap-2')}>
          <span className="text-sm font-bold">{data.monthTitle} dinamikasi</span>
          <MonthLine
            days={days}
            height={170}
            label="Kunlar bo‘yicha checklist va maqsadlar foizi"
            series={[
              { values: days.map((d) => (isWorkDay(d, today) && items.length ? day(d.key).pct : null)), color: 'var(--qp-mint)', area: true },
              { values: days.map((d) => (d.key <= today && dayGoals(goals, d.key).total ? dayGoals(goals, d.key).pct : null)), color: 'var(--qp-cyan)', dashed: true },
            ]}
          />
          <div className="flex gap-4 text-[11px] font-semibold">
            <span className="text-qp-mint">— Checklist %</span>
            <span className="text-qp-cyan">- - Maqsadlar %</span>
          </div>
        </div>
        <div className={cn(TILE, 'flex flex-[1_1_300px] flex-col gap-2')}>
          <span className="text-sm font-bold">Bugungi maqsadlar</span>
          <GoalList goals={todays} periodKey={today} onToggle={board.toggleGoal} />
          <span className="text-[11px] text-qp-muted">Bajarilmagan maqsad ertaga ham shu yerda turadi.</span>
        </div>
      </div>
    </section>
  );
}
