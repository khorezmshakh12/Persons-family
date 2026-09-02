import { getTranslations } from 'next-intl/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { getIncomeRoadmapData } from './data';
import { YearSwitcher } from './year-switcher';
import { UpsertRoadmapDialog } from './upsert-roadmap-dialog';
import { DeleteRoadmapDialog } from './delete-roadmap-dialog';
import { EmptyRoadmapState } from './empty-roadmap-state';
import { IncomeKpiStrip } from './income-kpi-strip';
import { IncomeChartsTabs } from './income-charts-tabs';
import { MonthGridTable } from './month-grid-table';
import { MilestoneRail } from './milestone-rail';

export async function IncomeRoadmapSection({
  staffId,
  canManage,
  year,
}: {
  staffId: string;
  canManage: boolean;
  year?: number;
}) {
  const t = await getTranslations('incomeRoadmap');

  const {
    year: shownYear,
    availableYears,
    roadmap,
    months,
    milestones,
    totals,
  } = await getIncomeRoadmapData(staffId, year);

  return (
    <section
      aria-label={t('title')}
      className={cn(GLASS_CARD, 'flex flex-col gap-6 p-6 sm:p-8')}
    >
      {/* 5.1 Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-heading text-xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
              {t('title')} · {shownYear}
            </h2>

            {roadmap && roadmap.status !== 'active' && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[11px] font-medium border',
                  roadmap.status === 'draft'
                    ? 'border-amber-400/30 bg-amber-500/15 text-amber-200'
                    : 'border-white/20 bg-white/10 text-white/70',
                )}
              >
                {t(`status.${roadmap.status}`)}
              </Badge>
            )}
          </div>
          <p className="text-xs text-white/60">{t('subtitle')}</p>
        </div>

        {/* Year switcher & management buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <YearSwitcher currentYear={shownYear} availableYears={availableYears} />

          {canManage && roadmap && (
            <div className="flex items-center gap-2">
              <UpsertRoadmapDialog staffId={staffId} year={shownYear} roadmap={roadmap} />
              <DeleteRoadmapDialog
                staffId={staffId}
                roadmapId={roadmap.id}
                year={shownYear}
              />
            </div>
          )}
        </div>
      </div>

      {/* 5.2 Empty state or full dashboard */}
      {roadmap === null ? (
        <EmptyRoadmapState canManage={canManage} staffId={staffId} year={shownYear} />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Notes callout if present */}
          {roadmap.notes && (
            <div className="rounded-xl border border-white/15 bg-white/5 p-3.5 text-xs text-white/80 backdrop-blur-sm">
              <span className="font-semibold text-white">{t('notes')}: </span>
              {roadmap.notes}
            </div>
          )}

          {/* 5.3 5-tile KPI strip */}
          <IncomeKpiStrip roadmap={roadmap} totals={totals} />

          {/* 5.4 Recharts Monthly & Cumulative tabs */}
          <IncomeChartsTabs
            months={months}
            targetYearEndIncome={roadmap.targetYearEndIncome}
            milestones={milestones}
          />

          {/* 5.5 12-month Grid */}
          <MonthGridTable
            months={months}
            roadmap={roadmap}
            staffId={staffId}
            canManage={canManage}
          />

          {/* 5.6 Milestone rail */}
          <MilestoneRail
            milestones={milestones}
            roadmapId={roadmap.id}
            staffId={staffId}
            canManage={canManage}
          />
        </div>
      )}
    </section>
  );
}
