'use client';

import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTranslations, useFormatter } from 'next-intl';
import { Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type TeacherSeries = { id: string; name: string };
export type TeacherProgressRow = { month: string } & Record<string, number | null | string>;

const LINE_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#22d3ee', '#fb923c', '#f87171'];

/** Suffix for the month-over-month delta carried alongside each person's
 * score on the same row (see `chartData`). Not plotted — read back by the
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
  // Someone with no score in this month is a gap, not a "— :" row.
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

/** The chart body itself, rendered both inside the dashboard card and — at a
 * much larger size — inside the expand dialog. Pure renderer: it takes the
 * already-computed rows/domain so the two mount points can't disagree. */
function GrowthChart({
  chartData,
  teachers,
  yDomain,
}: {
  chartData: TeacherProgressRow[];
  teachers: TeacherSeries[];
  yDomain: [number, number];
}) {
  return (
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
            // Filled and large enough to read on its own: someone with a
            // single scored month draws no line segment at all, so the dot
            // is the entire data point.
            dot={{ r: 3, fill: LINE_COLORS[i % LINE_COLORS.length], strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function Legend({ teachers }: { teachers: TeacherSeries[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
      {teachers.map((teacher, i) => (
        <div key={teacher.id} className="flex items-center gap-1.5 text-xs text-white/80">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}
          />
          <span>{teacher.name}</span>
        </div>
      ))}
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
  const [expanded, setExpanded] = useState(false);

  /** Builds the axis label from the year+month parts instead of parsing the
   * whole value: `month` should arrive as `YYYY-MM-01`, but anything else
   * (a full timestamp, an empty string) would otherwise reach
   * `format.dateTime` as an Invalid Date and throw "Invalid time value",
   * blanking the entire card. Unparseable values fall back to the raw text. */
  const chartData = useMemo(() => {
    function monthLabel(month: string) {
      const parts = /^(\d{4})-(\d{2})/.exec(month);
      if (!parts) return month;
      return format.dateTime(new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, 1)), {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
    }
    // Month-over-month delta per person, measured against that person's own
    // previous *scored* month, so a gap doesn't reset the comparison.
    const lastScore = new Map<string, number>();
    return data.map((row) => {
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
  }, [data, teachers, format]);

  // A fixed 0..100 floor flattened every real month-to-month move into a
  // straight line (and the score is uncapped since the CHECK constraint was
  // dropped). Frame the actual range instead, padded so the top and bottom
  // points aren't glued to the axis.
  const yDomain = useMemo<[number, number]>(() => {
    const values = data.flatMap((row) =>
      teachers.map((teacher) => row[teacher.id]).filter((v): v is number => typeof v === 'number'),
    );
    const dataMin = values.length ? Math.min(...values) : 0;
    const dataMax = values.length ? Math.max(...values) : 100;
    const pad = Math.max(5, Math.round((dataMax - dataMin) * 0.2));
    return [
      Math.max(0, Math.floor((dataMin - pad) / 5) * 5),
      Math.ceil((dataMax + pad) / 5) * 5,
    ];
  }, [data, teachers]);

  const hasChart = teachers.length > 0 && chartData.length > 0;

  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-4 p-6')}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('title')}
        </h2>
        {hasChart && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={t('expand')}
            className="-mt-1 -mr-1 shrink-0 rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Maximize2 className="size-4" />
          </button>
        )}
      </div>

      {teachers.length === 0 ? (
        <p className="text-sm text-white/70">{t('noTeachers')}</p>
      ) : chartData.length === 0 ? (
        <p className="text-sm text-white/70">{t('noData')}</p>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="h-64 w-full cursor-zoom-in"
          aria-label={t('expand')}
        >
          <GrowthChart chartData={chartData} teachers={teachers} yDomain={yDomain} />
        </button>
      )}

      {teachers.length > 0 && <Legend teachers={teachers} />}

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="bg-slate-900 text-white ring-white/10 sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-white">{t('title')}</DialogTitle>
          </DialogHeader>
          {hasChart && (
            <>
              <div className="h-[65vh] w-full">
                <GrowthChart chartData={chartData} teachers={teachers} yDomain={yDomain} />
              </div>
              <Legend teachers={teachers} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
