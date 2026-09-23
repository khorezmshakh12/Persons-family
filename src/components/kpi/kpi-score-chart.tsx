'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useChartAnimation } from '@/lib/use-enter-progress';
import { useTranslations, useFormatter } from 'next-intl';

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-au-line bg-au-card px-3 py-2 text-xs text-au-ink shadow-au-card">
      <div className="font-semibold">{label}</div>
      <div>{Math.round(payload[0].value)}</div>
    </div>
  );
}

export function KpiScoreChart({ points }: { points: { month: string; score: number }[] }) {
  const t = useTranslations('kpi');
  const format = useFormatter();
  const anim = useChartAnimation();

  if (points.length === 0) {
    return <p className="text-sm text-au-muted">{t('noScoreHistory')}</p>;
  }

  const data = points.map((p) => ({
    label: format.dateTime(new Date(`${p.month}T00:00:00Z`), { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    score: p.score,
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--au-line)" vertical={false} />
          <XAxis dataKey="label" stroke="var(--au-muted)" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="var(--au-muted)" fontSize={11} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="var(--au-ok)"
            strokeWidth={2.5}
            dot={{ fill: 'var(--au-ok)', r: 3 }}
            {...anim}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
