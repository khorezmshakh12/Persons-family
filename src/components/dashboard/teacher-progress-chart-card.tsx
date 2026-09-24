'use client';

import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTranslations, useFormatter } from 'next-intl';
import { Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GLASS_CARD } from '@/lib/glass';
import { useChartAnimation } from '@/lib/use-enter-progress';
import { cn } from '@/lib/utils';

export type TeacherSeries = { id: string; name: string };
export type TeacherProgressRow = { month: string } & Record<string, number | null | string>;

const LINE_COLORS = ['var(--au-ok)', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#22d3ee', '#fb923c', '#f87171'];

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
  hidden,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  hidden?: ReadonlySet<string>;
}) {
  // Someone with no score in this month is a gap, not a "— :" row; a line
  // switched off in the legend stays out of the tooltip too.
  const entries =
    payload?.filter((p) => typeof p.value === 'number' && !hidden?.has(String(p.dataKey))) ?? [];
  if (!active || entries.length === 0) return null;
  return (
    <div className="rounded-lg border border-au-line bg-au-card px-3 py-2 text-xs text-au-ink shadow-au-card">
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
                <span className={(delta as number) > 0 ? 'text-emerald-600' : 'text-rose-600'}>
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
  hidden,
}: {
  chartData: TeacherProgressRow[];
  teachers: TeacherSeries[];
  yDomain: [number, number];
  hidden: ReadonlySet<string>;
}) {
  const anim = useChartAnimation();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--au-line)" vertical={false} />
        <XAxis dataKey="label" stroke="var(--au-muted)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis
          domain={yDomain}
          allowDecimals={false}
          stroke="var(--au-muted)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip content={<CustomTooltip hidden={hidden} />} />
        {teachers.map((teacher, i) => (
          <Line
            key={teacher.id}
            type="monotone"
            dataKey={teacher.id}
            name={teacher.name}
            hide={hidden.has(teacher.id)}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={2}
            // Filled and large enough to read on its own: someone with a
            // single scored month draws no line segment at all, so the dot
            // is the entire data point.
            dot={{ r: 3, fill: LINE_COLORS[i % LINE_COLORS.length], strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            {...anim}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Clickable legend: each name toggles its own line on/off, so one
 * person's growth can be read without the rest of the team in the way. */
function Legend({
  teachers,
  hidden,
  onToggle,
}: {
  teachers: TeacherSeries[];
  hidden: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-1 gap-y-1">
      {teachers.map((teacher, i) => {
        const off = hidden.has(teacher.id);
        return (
          <button
            key={teacher.id}
            type="button"
            onClick={() => onToggle(teacher.id)}
            aria-pressed={!off}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-au-card-2',
              off ? 'text-au-faint line-through' : 'text-au-ink',
            )}
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: off ? 'var(--au-line)' : LINE_COLORS[i % LINE_COLORS.length] }}
            />
            <span>{teacher.name}</span>
          </button>
        );
      })}
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
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
    const visible = teachers.filter((teacher) => !hidden.has(teacher.id));
    const values = data.flatMap((row) =>
      visible.map((teacher) => row[teacher.id]).filter((v): v is number => typeof v === 'number'),
    );
    const dataMin = values.length ? Math.min(...values) : 0;
    const dataMax = values.length ? Math.max(...values) : 100;
    const pad = Math.max(5, Math.round((dataMax - dataMin) * 0.2));
    return [
      Math.max(0, Math.floor((dataMin - pad) / 5) * 5),
      Math.ceil((dataMax + pad) / 5) * 5,
    ];
  }, [data, teachers, hidden]);

  const hasChart = teachers.length > 0 && chartData.length > 0;

  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-4 p-6')}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-au-ink">
          {t('title')}
        </h2>
        {hasChart && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={t('expand')}
            className="-mt-1 -mr-1 shrink-0 rounded-lg p-1.5 text-au-muted transition-colors hover:bg-au-card-2 hover:text-au-ink"
          >
            <Maximize2 className="size-4" />
          </button>
        )}
      </div>

      {teachers.length === 0 ? (
        <p className="text-sm text-au-muted">{t('noTeachers')}</p>
      ) : chartData.length === 0 ? (
        <p className="text-sm text-au-muted">{t('noData')}</p>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="h-64 w-full cursor-zoom-in"
          aria-label={t('expand')}
        >
          <GrowthChart chartData={chartData} teachers={teachers} yDomain={yDomain} hidden={hidden} />
        </button>
      )}

      {teachers.length > 0 && (
        <div className="flex flex-col gap-1">
          <Legend teachers={teachers} hidden={hidden} onToggle={toggle} />
          {hasChart && teachers.length > 1 && <p className="px-1.5 text-[11px] text-au-muted">{t('legendHint')}</p>}
        </div>
      )}

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="bg-au-card text-au-ink ring-au-line sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-au-ink">{t('title')}</DialogTitle>
          </DialogHeader>
          {hasChart && (
            <>
              <div className="h-[65vh] w-full">
                <GrowthChart chartData={chartData} teachers={teachers} yDomain={yDomain} hidden={hidden} />
              </div>
              <Legend teachers={teachers} hidden={hidden} onToggle={toggle} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
