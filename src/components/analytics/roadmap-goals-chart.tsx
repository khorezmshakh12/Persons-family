'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { useTranslations } from 'next-intl';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type RoadmapGoalPoint = { name: string; progress: number; status: 'pending' | 'done' | 'failed' };

const STATUS_COLOR: Record<RoadmapGoalPoint['status'], string> = {
  done: '#34d399',
  pending: '#38bdf8',
  failed: '#f87171',
};

export function RoadmapGoalsChart({ data }: { data: RoadmapGoalPoint[] }) {
  const t = useTranslations('analytics');

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        {t('roadmapGoals.title')}
      </h2>
      {data.length === 0 ? (
        <p className="text-sm text-white/70">{t('roadmapGoals.noData')}</p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} stroke="rgba(255,255,255,0.5)" fontSize={11} />
              <YAxis type="category" dataKey="name" width={110} stroke="rgba(255,255,255,0.6)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15,23,42,0.9)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="progress" radius={[0, 6, 6, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={STATUS_COLOR[d.status]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
