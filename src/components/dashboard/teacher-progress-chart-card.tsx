'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTranslations, useFormatter } from 'next-intl';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type TeacherSeries = { id: string; name: string };
export type TeacherProgressRow = { month: string } & Record<string, number | null | string>;

const LINE_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#22d3ee', '#fb923c', '#f87171'];

/** Suffix for the month-over-month delta carried alongside each teacher's
 * score on the same row (see `withDeltas`). Not plotted — read back by the
 * tooltip so "Growth" is an actual number, not just a slope. */
const DELTA_SUFFIX = '__delta';

type TooltipEntry = {
  value: number;
  name: string;
  color: string;
  dataKey?: string | number;
  payload?: Record<string, number | null | string>;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  // A teacher with no score in this month is a gap, not a "— :" row.
  const entries = payload?.filter((p) => typeof p.value === 'number') ?? [];
  if (!active || entries.length === 0) return null;
  return (
    <div className="rounded-lg border border-white/20 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-md">
      <div className="mb-1 font-semibold">{label}</div>
      <div className="flex flex-col gap-0.5">
        {entries.map((p) => {
          const delta = p.payload?.[`${String(p.dataKey)}${DELTA_SUFFIX}`];
          const hasDelta = typeof delta === 'number' && delta !== 0;
          return (
            <div key={p.name} className="flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
              <span>
                {p.name}: {p.value}
              </span>
              {hasDelta && (
                <span className={(delta as number) > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {(delta as number) > 0 ? '+' : '−'}
                  {Math.abs(delta as number)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TeacherProgressChartCard({
  teachers,
  data,
  delayMs = 0,
}: {
  teachers: TeacherSeries[];
  data: TeacherProgressRow[];
  delayMs?: number;
}) {
  const t = useTranslations('dashboard.employeeGrowth');
  const format = useFormatter();

  if (teachers.length === 0) {
    return (
      <div
        style={{ animationDelay: `${delayMs}ms` }}
        className={cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-4 p-6')}
      >
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('title')}</h2>
        <p className="text-sm text-white/70">{t('noTeachers')}</p>
      </div>
    );
  }

  /** Builds the axis label from the year+month parts instead of parsing the
   * whole value: `month` should arrive as `YYYY-MM-01`, but anything else
   * (a full timestamp, an empty string) would otherwise reach
   * `format.dateTime` as an Invalid Date and throw "Invalid time value",
   * blanking the entire card. Unparseable values fall back to the raw text. */
  function monthLabel(month: string) {
    const parts = /^(\d{4})-(\d{2})/.exec(month);
    if (!parts) return month;
    return format.dateTime(new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, 1)), {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  // Month-over-month delta per teacher, measured against that teacher's own
  // previous *scored* month, so a gap doesn't reset the comparison.
  const lastScore = new Map<string, number>();
  const chartData = data.map((row) => {
    const deltas: Record<string, number | null> = {};
    for (const teacher of teachers) {
      const value = row[teacher.id];
      if (typeof value !== 'number') continue;
      const previous = lastScore.get(teacher.id);
      deltas[`${teacher.id}${DELTA_SUFFIX}`] = previous === undefined ? null : value - previous;
      lastScore.set(teacher.id, value);
    }
    return { ...row, ...deltas, label: monthLabel(String(row.month)) };
  });

  // A fixed 0..100 floor flattened every real month-to-month move into a
  // straight line (and the score is uncapped since the CHECK constraint was
  // dropped). Frame the actual range instead, padded so the top and bottom
  // points aren't glued to the axis.
  const values = data.flatMap((row) =>
    teachers.map((teacher) => row[teacher.id]).filter((v): v is number => typeof v === 'number'),
  );
  const dataMin = values.length ? Math.min(...values) : 0;
  const dataMax = values.length ? Math.max(...values) : 100;
  const pad = Math.max(5, Math.round((dataMax - dataMin) * 0.2));
  const yDomain: [number, number] = [
    Math.max(0, Math.floor((dataMin - pad) / 5) * 5),
    Math.ceil((dataMax + pad) / 5) * 5,
  ];

  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-4 p-6')}
    >
      <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('title')}</h2>

      {chartData.length === 0 ? (
        <p className="text-sm text-white/70">{t('noData')}</p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis dataKey="label" stroke="rgba(255,255,255,0.75)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis
                domain={yDomain}
                allowDecimals={false}
                stroke="rgba(255,255,255,0.75)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />
              {teachers.map((teacher, i) => (
                <Line
                  key={teacher.id}
                  type="monotone"
                  dataKey={teacher.id}
                  name={teacher.name}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  // Filled and large enough to read on its own: a teacher
                  // with a single scored month draws no line segment at
                  // all, so the dot is the entire data point.
                  dot={{ r: 3, fill: LINE_COLORS[i % LINE_COLORS.length], strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {teachers.map((teacher, i) => (
          <div key={teacher.id} className="flex items-center gap-1.5 text-xs text-white/80">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }} />
            <span>{teacher.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
