'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useFormatter, useTranslations } from 'next-intl';
import { formatUZS } from '@/lib/format-currency';

type Point = { label: string; amount: number; achieved: boolean };

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/20 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-md">
      <div className="font-semibold">{label}</div>
      <div>{formatUZS(payload[0].value)}</div>
    </div>
  );
}

function CustomDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: Point }) {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={4} fill={payload?.achieved ? '#2dd4bf' : 'rgba(255,255,255,0.4)'} />;
}

export function IncomeLineChart({
  baseIncome,
  steps,
}: {
  baseIncome: number;
  steps: { target_month: string; target_amount: number; status: string }[];
}) {
  const t = useTranslations('incomeRoadmap');
  const format = useFormatter();

  const sorted = [...steps].sort((a, b) => a.target_month.localeCompare(b.target_month));
  const data: Point[] = [
    { label: t('baseMonthlyIncome'), amount: baseIncome, achieved: true },
    ...sorted.map((s) => ({
      label: format.dateTime(new Date(s.target_month), { month: 'long', year: 'numeric' }),
      amount: s.target_amount,
      achieved: s.status === 'achieved',
    })),
  ];

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
          <XAxis dataKey="label" stroke="rgba(255,255,255,0.75)" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis
            stroke="rgba(255,255,255,0.75)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={70}
            tickFormatter={(v: number) => formatUZS(v)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="amount"
            stroke="#2dd4bf"
            strokeWidth={2.5}
            dot={<CustomDot />}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
