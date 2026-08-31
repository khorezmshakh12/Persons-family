'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTranslations, useFormatter } from 'next-intl';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type ScorePoint = { month: string; ceoScore: number | null };

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/20 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-md">
      <div className="font-semibold">{label}</div>
      <div>{payload[0].value}</div>
    </div>
  );
}

export function SelfDevelopmentChart({ points, title }: { points: ScorePoint[]; title?: string }) {
  const t = useTranslations('selfDevelopment');
  const format = useFormatter();

  const data = points
    .filter((p) => p.ceoScore !== null)
    .map((p) => ({
      label: format.dateTime(new Date(p.month), { month: 'long', year: 'numeric' }),
      score: p.ceoScore as number,
    }));

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        {title ?? t('progressChart.title')}
      </h2>
      {data.length === 0 ? (
        <p className="text-sm text-white/70">{t('progressChart.noData')}</p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="selfDevScoreFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis dataKey="label" stroke="rgba(255,255,255,0.5)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis
                domain={[0, (dataMax: number) => Math.max(100, Math.ceil(dataMax / 20) * 20)]}
                stroke="rgba(255,255,255,0.5)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#2dd4bf"
                strokeWidth={2.5}
                fill="url(#selfDevScoreFill)"
                dot={{ fill: '#2dd4bf', r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
