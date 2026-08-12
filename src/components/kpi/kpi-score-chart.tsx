'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTranslations, useFormatter } from 'next-intl';

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/20 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-md">
      <div className="font-semibold">{label}</div>
      <div>{Math.round(payload[0].value)}</div>
    </div>
  );
}

export function KpiScoreChart({ points }: { points: { month: string; score: number }[] }) {
  const t = useTranslations('kpi');
  const format = useFormatter();

  if (points.length === 0) {
    return <p className="text-sm text-white/60">{t('noScoreHistory')}</p>;
  }

  const data = points.map((p) => ({
    label: format.dateTime(new Date(p.month), { month: 'long', year: 'numeric' }),
    score: p.score,
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
          <XAxis dataKey="label" stroke="rgba(255,255,255,0.75)" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="rgba(255,255,255,0.75)" fontSize={11} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="score" stroke="#34d399" strokeWidth={2.5} dot={{ fill: '#34d399', r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
