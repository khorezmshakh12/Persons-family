'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import type { IncomeRoadmapHeader, IncomeRoadmapMonth } from './data';
import { formatUZS } from '@/lib/format-currency';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EditPlanCurveDialog } from './edit-plan-curve-dialog';
import { RecordActualDialog } from './record-actual-dialog';
import { ClearActualDialog } from './clear-actual-dialog';
import { cn } from '@/lib/utils';

export function MonthGridTable({
  months,
  roadmap,
  staffId,
  canManage,
}: {
  months: IncomeRoadmapMonth[];
  roadmap: IncomeRoadmapHeader;
  staffId: string;
  canManage: boolean;
}) {
  const t = useTranslations('incomeRoadmap');
  const format = useFormatter();

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/15 bg-white/5 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">{t('monthlyPlan')}</h3>
          <Badge variant="outline" className="border-white/20 bg-white/10 text-white/70 text-[10px]">
            12 {t('month').toLowerCase()}
          </Badge>
        </div>

        {canManage && (
          <EditPlanCurveDialog
            staffId={staffId}
            roadmapId={roadmap.id}
            months={months}
            baselineMonthlyIncome={roadmap.baselineMonthlyIncome}
            targetYearEndIncome={roadmap.targetYearEndIncome}
          />
        )}
      </div>

      {/* Desktop & Tablet: Semantic HTML Table */}
      <div className="hidden sm:block overflow-x-auto">
        <Table className="w-full text-xs">
          <TableHeader>
            <TableRow className="border-b border-white/15 hover:bg-transparent">
              <TableHead scope="col" className="text-white/70 font-semibold">{t('month')}</TableHead>
              <TableHead scope="col" className="text-right text-white/70 font-semibold">{t('planned')}</TableHead>
              <TableHead scope="col" className="text-right text-white/70 font-semibold">{t('actual')}</TableHead>
              <TableHead scope="col" className="text-right text-white/70 font-semibold">{t('variance')}</TableHead>
              <TableHead scope="col" className="text-right text-white/70 font-semibold">{t('variancePct')}</TableHead>
              <TableHead scope="col" className="text-right text-white/70 font-semibold">{t('growth')}</TableHead>
              <TableHead scope="col" className="text-right text-white/70 font-semibold">{t('cumulativePlanned')}</TableHead>
              <TableHead scope="col" className="text-right text-white/70 font-semibold">{t('cumulativeActual')}</TableHead>
              {canManage && (
                <TableHead scope="col" className="text-right text-white/70 font-semibold pr-2">
                  {t('recordActual')}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {months.map((m) => {
              const date = new Date(`${m.monthKey}-01T00:00:00Z`);
              const monthLabel = format.dateTime(date, { month: 'short' });
              const isUnreported = m.actual === null;
              const isDimmed = !m.isClosed && isUnreported;

              return (
                <TableRow
                  key={m.monthNumber}
                  className={cn(
                    'border-b border-white/10 transition-colors hover:bg-white/5',
                    m.isCurrent && 'border-l-2 border-l-emerald-400 bg-white/[0.04] font-medium',
                    isDimmed && 'opacity-60 hover:opacity-100',
                  )}
                >
                  {/* Month */}
                  <TableCell className="font-medium text-white py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span>{monthLabel}</span>
                      {m.isCurrent && (
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                      )}
                    </div>
                  </TableCell>

                  {/* Planned */}
                  <TableCell className="text-right text-white/80 tabular-nums py-2.5">
                    {formatUZS(m.planned)}
                  </TableCell>

                  {/* Actual */}
                  <TableCell className="text-right tabular-nums py-2.5">
                    {m.actual !== null ? (
                      <div className="inline-flex items-center justify-end gap-1 font-semibold text-emerald-300">
                        <span>{formatUZS(m.actual)}</span>
                        {m.note && (
                          <span title={m.note} className="text-white/40 hover:text-white cursor-help">
                            <Info className="size-3" />
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-white/40">—</span>
                    )}
                  </TableCell>

                  {/* Variance */}
                  <TableCell className="text-right tabular-nums py-2.5">
                    {m.variance !== null ? (
                      <span
                        className={cn(
                          'font-medium',
                          m.variance >= 0 ? 'text-emerald-300' : 'text-red-300',
                        )}
                      >
                        {m.variance >= 0 ? '▲ +' : '▼ '}
                        {formatUZS(Math.abs(m.variance))}
                      </span>
                    ) : (
                      <span className="text-white/40">—</span>
                    )}
                  </TableCell>

                  {/* Variance % */}
                  <TableCell className="text-right tabular-nums py-2.5">
                    {m.variancePct !== null ? (
                      <span
                        className={cn(
                          'font-medium',
                          m.variancePct >= 0 ? 'text-emerald-300' : 'text-red-300',
                        )}
                      >
                        {m.variancePct >= 0 ? '+' : ''}
                        {m.variancePct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-white/40">—</span>
                    )}
                  </TableCell>

                  {/* Growth % */}
                  <TableCell className="text-right tabular-nums py-2.5">
                    {m.growthPct !== null ? (
                      <span
                        className={cn(
                          'font-medium',
                          m.growthPct >= 0 ? 'text-emerald-300' : 'text-red-300',
                        )}
                      >
                        {m.growthPct >= 0 ? '+' : ''}
                        {m.growthPct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-white/40">—</span>
                    )}
                  </TableCell>

                  {/* Cum. Plan */}
                  <TableCell className="text-right text-white/60 tabular-nums py-2.5">
                    {formatUZS(m.cumulativePlanned)}
                  </TableCell>

                  {/* Cum. Actual */}
                  <TableCell className="text-right tabular-nums py-2.5">
                    {m.actual !== null ? (
                      <span className="text-emerald-300 font-medium">
                        {formatUZS(m.cumulativeActual)}
                      </span>
                    ) : (
                      <span className="text-white/40">—</span>
                    )}
                  </TableCell>

                  {/* Actions (CEO only) */}
                  {canManage && (
                    <TableCell className="text-right py-2.5 pr-2">
                      <div className="flex items-center justify-end gap-1">
                        <RecordActualDialog
                          staffId={staffId}
                          roadmapId={roadmap.id}
                          month={m}
                        />
                        {m.actual !== null && (
                          <ClearActualDialog
                            staffId={staffId}
                            roadmapId={roadmap.id}
                            month={m}
                          />
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile view: Stacked Month Cards */}
      <div className="flex flex-col gap-2.5 sm:hidden">
        {months.map((m) => {
          const date = new Date(`${m.monthKey}-01T00:00:00Z`);
          const monthName = format.dateTime(date, { month: 'long' });
          const isDimmed = !m.isClosed && m.actual === null;

          return (
            <div
              key={m.monthNumber}
              className={cn(
                'flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-xs',
                m.isCurrent && 'border-l-2 border-l-emerald-400 bg-white/[0.08]',
                isDimmed && 'opacity-60',
              )}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <span>{monthName}</span>
                  {m.isCurrent && (
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <RecordActualDialog
                      staffId={staffId}
                      roadmapId={roadmap.id}
                      month={m}
                    />
                    {m.actual !== null && (
                      <ClearActualDialog
                        staffId={staffId}
                        roadmapId={roadmap.id}
                        month={m}
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-white/70">
                <div className="flex flex-col">
                  <span className="text-[10px] text-white/50">{t('planned')}</span>
                  <span className="font-medium text-white tabular-nums">{formatUZS(m.planned)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-white/50">{t('actual')}</span>
                  <span className="font-medium text-emerald-300 tabular-nums">
                    {m.actual !== null ? formatUZS(m.actual) : '—'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-white/50">{t('variance')}</span>
                  <span
                    className={cn(
                      'font-medium tabular-nums',
                      m.variance !== null
                        ? m.variance >= 0
                          ? 'text-emerald-300'
                          : 'text-red-300'
                        : 'text-white/40',
                    )}
                  >
                    {m.variance !== null
                      ? `${m.variance >= 0 ? '+' : ''}${formatUZS(m.variance)}`
                      : '—'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-white/50">{t('growth')}</span>
                  <span
                    className={cn(
                      'font-medium tabular-nums',
                      m.growthPct !== null
                        ? m.growthPct >= 0
                          ? 'text-emerald-300'
                          : 'text-red-300'
                        : 'text-white/40',
                    )}
                  >
                    {m.growthPct !== null ? `${m.growthPct >= 0 ? '+' : ''}${m.growthPct.toFixed(1)}%` : '—'}
                  </span>
                </div>
              </div>

              {m.note && (
                <div className="mt-1 rounded bg-white/5 p-1.5 text-[11px] text-white/70">
                  <span className="font-semibold text-white/90">{t('notes')}: </span>
                  {m.note}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
