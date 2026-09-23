'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { useTranslations } from 'next-intl';
import { useChartAnimation } from '@/lib/use-enter-progress';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type StaffPerformancePoint = { name: string; score: number };

const TIER_COLOR = (score: number) => (score >= 70 ? 'var(--au-ok)' : score >= 40 ? '#fbbf24' : '#f87171');

export function StaffPerformanceChart({ data }: { data: StaffPerformancePoint[] }) {
  const t = useTranslations('analytics');
  const anim = useChartAnimation();

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <h2 className="font-heading text-lg font-semibold text-au-ink">
        {t('staffPerformance.title')}
      </h2>
      {data.length === 0 ? (
        <p className="text-sm text-au-muted">{t('staffPerformance.noData')}</p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--au-line)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} stroke="var(--au-muted)" fontSize={11} />
              <YAxis type="category" dataKey="name" width={110} stroke="var(--au-muted)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: 'var(--au-card)',
                  border: '1px solid var(--au-faint)',
                  borderRadius: 8,
                  color: 'var(--au-ink)',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="score" radius={[0, 6, 6, 0]} {...anim}>
                {data.map((d, i) => (
                  <Cell key={i} fill={TIER_COLOR(d.score)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
