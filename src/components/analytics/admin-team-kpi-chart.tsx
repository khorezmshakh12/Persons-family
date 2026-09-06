'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useTranslations } from 'next-intl';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { AdminTeamKpiMonth } from '@/lib/actions/analytics';

const COLORS = {
  onTime: '#34d399',
  late: '#fbbf24',
  notDone: '#f87171',
  efficiency: '#60a5fa',
} as const;

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/20 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-md">
      <div className="mb-1 font-semibold">{label}</div>
      <div className="flex flex-col gap-0.5">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            <span>
              {p.name}: {p.value}
              {p.dataKey === 'efficiency' ? '%' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Dumb renderer for the Administration team's monthly task KPI — the page
 * fetches the months (getAdminTeamKpiAction) and hands them over already
 * localised, so nothing here re-derives a date or a percentage.
 */
export function AdminTeamKpiChart({ data }: { data: AdminTeamKpiMonth[] }) {
  const t = useTranslations('analytics');

  const legend = [
    { label: t('adminKpi.onTime'), color: COLORS.onTime },
    { label: t('adminKpi.late'), color: COLORS.late },
    { label: t('adminKpi.notDone'), color: COLORS.notDone },
    { label: t('adminKpi.efficiency'), color: COLORS.efficiency },
  ];

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div>
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('adminKpi.title')}
        </h2>
        <p className="mt-1 text-sm text-white/70">{t('adminKpi.subtitle')}</p>
      </div>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 16, left: 4, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="rgba(255,255,255,0.75)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="tasks"
              allowDecimals={false}
              stroke="rgba(255,255,255,0.75)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <YAxis
              yAxisId="efficiency"
              orientation="right"
              domain={[0, 100]}
              unit="%"
              stroke="rgba(255,255,255,0.75)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.06)' }} />
            <Bar
              yAxisId="tasks"
              dataKey="onTime"
              name={t('adminKpi.onTime')}
              stackId="tasks"
              fill={COLORS.onTime}
            />
            <Bar
              yAxisId="tasks"
              dataKey="late"
              name={t('adminKpi.late')}
              stackId="tasks"
              fill={COLORS.late}
            />
            <Bar
              yAxisId="tasks"
              dataKey="notDone"
              name={t('adminKpi.notDone')}
              stackId="tasks"
              fill={COLORS.notDone}
              radius={[6, 6, 0, 0]}
            />
            <Line
              yAxisId="efficiency"
              type="monotone"
              dataKey="efficiency"
              name={t('adminKpi.efficiency')}
              stroke={COLORS.efficiency}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {legend.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-white/80">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
