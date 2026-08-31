'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList } from 'recharts';
import { useTranslations } from 'next-intl';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type StaffScorePoint = { name: string; score: number };

function scoreColor(score: number) {
  if (score >= 80) return '#34d399'; // emerald-400
  if (score >= 60) return '#2dd4bf'; // teal-400
  if (score >= 40) return '#fbbf24'; // amber-400
  return '#f87171'; // red-400
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/20 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-md">
      <div className="font-semibold">{label}</div>
      <div>{payload[0].value}</div>
    </div>
  );
}

function ScoreLabel({ x, y, width, value }: { x?: number; width?: number; y?: number; value?: number }) {
  if (!value || x === undefined || y === undefined || width === undefined) return null;
  return (
    <text x={x + width / 2} y={y - 10} textAnchor="middle" fill="#ffffff" fontSize={13} fontWeight={700}>
      {value}
    </text>
  );
}

export function LastMonthScoresChart({ points }: { points: StaffScorePoint[] }) {
  const t = useTranslations('selfDevelopment.lastMonthChart');
  // Mount with every bar at 0, then flip to the real scores on the next
  // frame — Recharts tweens the height change, so the bars visibly rise
  // from the baseline instead of appearing already-filled on paint.
  const [data, setData] = useState(() => points.map((p) => ({ ...p, score: 0 })));

  useEffect(() => {
    setData(points.map((p) => ({ ...p, score: 0 })));
    const frame = requestAnimationFrame(() => setData(points));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points)]);

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('title')}</h2>
      {points.length === 0 ? (
        <p className="text-sm text-white/70">{t('noData')}</p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 28, right: 20, left: 10, bottom: 10 }} barCategoryGap="32%">
              <defs>
                {data.map((d, i) => (
                  <linearGradient key={i} id={`lastMonthBar-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={scoreColor(points[i]?.score ?? 0)} stopOpacity={1} />
                    <stop offset="100%" stopColor={scoreColor(points[i]?.score ?? 0)} stopOpacity={0.45} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.75)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis
                domain={[0, (dataMax: number) => Math.max(100, Math.ceil(dataMax / 20) * 20)]}
                stroke="rgba(255,255,255,0.75)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.06)' }} />
              <Bar
                dataKey="score"
                radius={[8, 8, 0, 0]}
                maxBarSize={72}
                isAnimationActive
                animationDuration={900}
                animationEasing="ease-out"
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={`url(#lastMonthBar-${i})`} />
                ))}
                <LabelList dataKey="score" content={<ScoreLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
