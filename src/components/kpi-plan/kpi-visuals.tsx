'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { SCENARIO_LABEL, SCENARIOS, monthName, type KpiPlan, type Scenario } from '@/lib/kpi-plan';
import type { Forecast } from '@/lib/kpi-forecast';

/* ------------------------------------------------------------ stepper */

const STEPS = ['Reja', 'Topshirildi', 'Tasdiqlandi', 'O‘z bahom', 'CEO bahosi', 'Maosh'] as const;

/** 0-based index of the step a plan is on (the first step not yet done). */
export function planStep(plan: KpiPlan | undefined): number {
  if (!plan || plan.status === 'draft' || plan.status === 'returned') return 0;
  if (plan.status === 'submitted') return 1;
  if (!plan.self_result && !plan.grade) return 3;
  if (!plan.grade) return 4;
  return plan.grade_amount != null ? 6 : 5;
}

/** Six-step lifecycle rail; the line fills up to the current step, which pulses. */
export function KpiStepper({ plan, className }: { plan: KpiPlan | undefined; className?: string }) {
  const at = planStep(plan);
  const pct = (Math.min(at, STEPS.length - 1) / (STEPS.length - 1)) * 100;
  return (
    <ol className={cn('relative grid grid-cols-6 gap-1', className)} aria-label="KPI bosqichlari">
      <span aria-hidden className="absolute top-[13px] right-[8.33%] left-[8.33%] h-[3px] rounded-full bg-au-card-2">
        <span className="ms-fill block h-full rounded-full bg-au-accent" style={{ width: `${pct}%` }} />
      </span>
      {STEPS.map((label, i) => {
        const done = i < at;
        const current = i === at;
        return (
          <li key={label} className="relative flex flex-col items-center gap-1.5 text-center" aria-current={current ? 'step' : undefined}>
            <span
              className={cn(
                'relative z-10 grid size-7 place-items-center rounded-full border-2 text-[11px] font-bold transition-colors',
                done && 'border-au-accent bg-au-accent text-au-accent-ink',
                current && 'ms-pulse border-au-accent bg-au-card text-au-accent-text',
                !done && !current && 'border-au-line bg-au-card text-au-faint',
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn('text-[10.5px] leading-tight font-semibold sm:text-xs', current ? 'text-au-ink' : done ? 'text-au-muted' : 'text-au-faint')}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------ gauge */

/** Half-circle gauge with three zones; the needle springs to the forecast. */
export function ForecastGauge({ value, className }: { value: Forecast | null; className?: string }) {
  // score 0..2 → angle -90..90
  const angle = value ? -90 + (value.score / 2) * 180 : -90;
  const arc = (from: number, to: number) => {
    const p = (deg: number) => {
      const r = ((deg - 90) * Math.PI) / 180;
      return `${60 + 50 * Math.cos(r)} ${60 + 50 * Math.sin(r)}`;
    };
    return `M ${p(from)} A 50 50 0 0 1 ${p(to)}`;
  };
  return (
    <figure className={cn('flex flex-col items-center', className)}>
      <svg viewBox="0 0 120 68" className="w-full max-w-[220px]" role="img" aria-label={value ? `Bashorat: ${SCENARIO_LABEL[value.scenario]}` : 'Bashorat yo‘q'}>
        <path d={arc(-90, -27)} stroke="var(--au-bad)" strokeWidth="10" fill="none" strokeLinecap="round" opacity=".85" />
        <path d={arc(-21, 39)} stroke="var(--au-accent)" strokeWidth="10" fill="none" strokeLinecap="round" opacity=".85" />
        <path d={arc(45, 90)} stroke="var(--au-ok)" strokeWidth="10" fill="none" strokeLinecap="round" opacity=".85" />
        <g className="ms-needle" style={{ transform: `rotate(${angle}deg)`, transformOrigin: '60px 60px' }}>
          <line x1="60" y1="60" x2="60" y2="18" stroke="var(--au-ink)" strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx="60" cy="60" r="5" fill="var(--au-ink)" />
      </svg>
      <figcaption className="-mt-1 text-center">
        <span className={cn('block text-lg font-bold', value ? (value.scenario === 'bad' ? 'text-au-bad' : value.scenario === 'great' ? 'text-au-ok' : 'text-au-accent-text') : 'text-au-faint')}>
          {value ? SCENARIO_LABEL[value.scenario] : '—'}
        </span>
        <span className="text-[11px] text-au-muted">{value ? `${value.scored} ta ko‘rsatkich bo‘yicha` : 'Haqiqiy natijalarni kiriting'}</span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------ history */

const LEVEL: Record<Scenario, number> = { bad: 0, good: 1, great: 2 };
const DOT: Record<Scenario, string> = { bad: 'var(--au-bad)', good: 'var(--au-accent)', great: 'var(--au-ok)' };

/** Grades over the months as a stepped line that draws itself in. */
export function GradeHistory({ plans }: { plans: KpiPlan[] }) {
  const graded = plans.filter((p) => p.grade).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  if (graded.length < 2) return null;
  const W = 600;
  const H = 150;
  const x = (i: number) => 40 + (i * (W - 70)) / (graded.length - 1);
  const y = (s: Scenario) => 20 + (2 - LEVEL[s]) * 50;
  const d = graded.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.grade!)}`).join(' ');
  return (
    <div className="rounded-au-card border border-au-line bg-au-card p-4 shadow-au-card">
      <h3 className="mb-2 text-sm font-bold text-au-ink">Baholar dinamikasi</h3>
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full" role="img" aria-label="Oylar bo‘yicha KPI baholari">
        {SCENARIOS.map((s) => (
          <g key={s}>
            <line x1="40" x2={W - 30} y1={y(s)} y2={y(s)} stroke="var(--au-line)" strokeDasharray="3 5" />
            <text x="0" y={y(s) + 4} fontSize="11" fill="var(--au-faint)">
              {SCENARIO_LABEL[s].split(' ')[0]}
            </text>
          </g>
        ))}
        <path d={d} pathLength={1} className="ms-draw" fill="none" stroke="var(--au-accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {graded.map((p, i) => (
          <g key={p.id} className="ms-wave" style={{ ['--i' as string]: i * 3, transformOrigin: `${x(i)}px ${y(p.grade!)}px`, transformBox: 'view-box' }}>
            <circle cx={x(i)} cy={y(p.grade!)} r="6" fill={DOT[p.grade!]} stroke="var(--au-card)" strokeWidth="2">
              <title>
                {monthName(p.month)}: {SCENARIO_LABEL[p.grade!]}
                {p.grade_amount != null ? ` · ${formatUZS(Math.round(p.grade_amount))} so‘m` : ''}
              </title>
            </circle>
            <text x={x(i)} y={H + 18} textAnchor="middle" fontSize="11" fill="var(--au-muted)">
              {monthName(p.month).slice(0, 3)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------ heat map */

type HeatMember = { id: string; first_name: string; last_name: string };

const CELL: Record<string, string> = {
  great: 'bg-au-ok text-white',
  good: 'bg-au-accent text-au-accent-ink',
  bad: 'bg-au-bad text-white',
  approved: 'bg-au-ok-soft text-au-ok',
  submitted: 'bg-au-accent-soft text-au-accent-text',
  returned: 'bg-au-bad-soft text-au-bad',
};

/** Staff × months. Colour = grade (or status when not graded yet); a
 * hatched cell = nothing filed. Cells arrive as a diagonal wave. */
export function KpiHeatmap({ team, plans, months }: { team: HeatMember[]; plans: KpiPlan[]; months: string[] }) {
  const key = (uid: string, m: string) => plans.find((p) => p.user_id === uid && p.month === m);
  return (
    <div className="overflow-x-auto rounded-au-card border border-au-line bg-au-card p-4 shadow-au-card">
      <table className="w-full min-w-[560px] border-separate border-spacing-1.5 text-sm">
        <thead>
          <tr className="text-[11px] font-semibold tracking-wide text-au-faint uppercase">
            <th className="text-left font-semibold">Xodim</th>
            {months.map((m) => (
              <th key={m} className="font-semibold">
                {monthName(m).slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {team.map((member, r) => (
            <tr key={member.id}>
              <td className="max-w-[180px] truncate pr-2 font-semibold text-au-ink">
                {member.first_name} {member.last_name}
              </td>
              {months.map((m, c) => {
                const p = key(member.id, m);
                const state = p?.grade ?? (p && p.status !== 'draft' ? p.status : null);
                return (
                  <td key={m} className="p-0">
                    <span
                      title={`${monthName(m)}: ${p?.grade ? SCENARIO_LABEL[p.grade] : state ?? 'topshirilmagan'}`}
                      className={cn(
                        'ms-wave mx-auto grid h-8 min-w-12 place-items-center rounded-[9px] text-[11px] font-bold',
                        state ? CELL[state] : 'border border-dashed border-au-line bg-[repeating-linear-gradient(135deg,transparent_0_5px,var(--au-card-2)_5px_10px)] text-au-faint',
                      )}
                      style={{ ['--i' as string]: r + c }}
                    >
                      {p?.grade ? SCENARIO_LABEL[p.grade].split(' ')[0] : state === 'approved' ? '✓' : state === 'submitted' ? '…' : state === 'returned' ? '↩' : ''}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-au-muted">
        {(['great', 'good', 'bad'] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <i className={cn('size-3 rounded-[4px]', CELL[s].split(' ')[0])} />
            {SCENARIO_LABEL[s]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <i className="size-3 rounded-[4px] bg-au-ok-soft" /> Tasdiqlangan
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="size-3 rounded-[4px] bg-au-accent-soft" /> Kutilmoqda
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ calibration */

/** Grade distribution + total salary effect; warns when grades bunch at the top. */
export function GradeCalibration({ plans }: { plans: KpiPlan[] }) {
  const graded = plans.filter((p) => p.grade);
  if (graded.length === 0) return null;
  const count = (s: Scenario) => graded.filter((p) => p.grade === s).length;
  const total = graded.reduce((sum, p) => sum + (p.grade_amount ?? 0), 0);
  const greatShare = count('great') / graded.length;
  return (
    <div className="grid gap-3 rounded-au-card border border-au-line bg-au-card p-4 shadow-au-card sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-au-muted">
          <span>Baholar taqsimoti · {graded.length} ta</span>
          {greatShare > 0.6 && graded.length >= 4 && <span className="text-au-bad">Ko‘pchilik “Juda yaxshi” — kalibrlashni tekshiring</span>}
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-au-card-2">
          {(['bad', 'good', 'great'] as const).map((s) =>
            count(s) ? (
              <span key={s} className="ms-fill h-full" style={{ width: `${(count(s) / graded.length) * 100}%`, background: DOT[s] }} title={`${SCENARIO_LABEL[s]}: ${count(s)}`} />
            ) : null,
          )}
        </div>
        <div className="mt-1.5 flex gap-4 text-[11px] text-au-muted">
          {(['bad', 'good', 'great'] as const).map((s) => (
            <span key={s}>
              {SCENARIO_LABEL[s]}: <b className="text-au-ink">{count(s)}</b>
            </span>
          ))}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[11px] font-semibold text-au-muted">Maoshga umumiy ta’sir</div>
        <div className={cn('text-xl font-bold tabular-nums', total < 0 ? 'text-au-bad' : total > 0 ? 'text-au-ok' : 'text-au-ink')}>
          {total < 0 ? '−' : total > 0 ? '+' : ''}
          {formatUZS(Math.abs(Math.round(total)))} so‘m
        </div>
      </div>
    </div>
  );
}
