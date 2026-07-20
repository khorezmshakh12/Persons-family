'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTranslations, useFormatter } from 'next-intl';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { ScorePoint } from './self-development-chart';

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/20 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-md">
      <div className="font-semibold">{label}</div>
      <div>{payload[0].value}</div>
    </div>
  );
}

export function SelfDevelopmentLineChart({
  points,
  title,
  bare = false,
}: {
  points: ScorePoint[];
  title?: string;
  /** Skip the card wrapper + heading — for callers (e.g. the dashboard
   * widget) that already render their own GLASS_CARD + title/picker row. */
  bare?: boolean;
}) {
  const t = useTranslations('selfDevelopment');
  const format = useFormatter();

  const data = points
    .filter((p) => p.ceoScore !== null)
    .map((p) => ({
      label: format.dateTime(new Date(p.month), { month: 'long', year: 'numeric' }),
      score: p.ceoScore as number,
    }));

  const chart =
    data.length === 0 ? (
      <p className="text-sm text-white/70">{t('progressChart.noData')}</p>
    ) : (
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
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
            <Line type="monotone" dataKey="score" stroke="#2dd4bf" strokeWidth={2.5} dot={{ fill: '#2dd4bf', r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );

  if (bare) return chart;

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        {title ?? t('progressChart.title')}
      </h2>
      {chart}
    </div>
  );
}
