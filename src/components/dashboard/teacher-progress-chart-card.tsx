'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTranslations, useFormatter } from 'next-intl';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type TeacherSeries = { id: string; name: string };
export type TeacherProgressRow = { month: string } & Record<string, number | null | string>;

const LINE_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#22d3ee', '#fb923c', '#f87171'];

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/20 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-md">
      <div className="mb-1 font-semibold">{label}</div>
      <div className="flex flex-col gap-0.5">
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            <span>
              {p.name}: {p.value}
            </span>
          </div>
        ))}
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

  const chartData = data.map((row) => ({
    ...row,
    label: format.dateTime(new Date(`${row.month}T00:00:00Z`), { month: 'short', year: 'numeric', timeZone: 'UTC' }),
  }));

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
                domain={[0, 100]}
                ticks={[0, 20, 40, 60, 80, 100]}
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
                  dot={{ r: 2 }}
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
