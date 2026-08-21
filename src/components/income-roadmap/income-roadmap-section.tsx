import { getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { IncomePlanDialog } from './income-plan-dialog';
import { AddStepDialog } from './add-step-dialog';
import { RoadmapStepCard } from './roadmap-step-card';
import { IncomeLineChart } from './income-line-chart';

export async function IncomeRoadmapSection({ staffId, canManage }: { staffId: string; canManage: boolean }) {
  const t = await getTranslations('incomeRoadmap');
  const year = new Date().getFullYear();

  const [plan] = await sql<
    { id: string; year: number; base_monthly_income: number; target_year_end_income: number }[]
  >`
    select id, year, base_monthly_income, target_year_end_income from staff_income_plans
    where staff_id = ${staffId} and year = ${year}
  `;

  const steps = plan
    ? await sql<{ id: string; target_amount: number; target_month: string; benefit_description: string | null; status: string }[]>`
        select id, target_amount, target_month, benefit_description, status from income_roadmap_steps
        where plan_id = ${plan.id} order by target_month asc
      `
    : [];

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
            {t('title')}
          </h2>
          <p className="text-sm text-white/60">{t('subtitle')}</p>
        </div>
        {canManage && <IncomePlanDialog staffId={staffId} plan={plan ?? undefined} />}
      </div>

      {!plan ? (
        <p className="text-sm text-white/60">{canManage ? t('noPlan') : t('noPlanSelf')}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/60">{t('baseMonthlyIncome')}</span>
              <span className="text-2xl font-bold tabular-nums text-white">{formatUZS(plan.base_monthly_income)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/60">{t('targetYearEndIncome')}</span>
              <span className="text-2xl font-bold tabular-nums text-emerald-400">
                {formatUZS(plan.target_year_end_income)}
              </span>
            </div>
          </div>

          <IncomeLineChart baseIncome={plan.base_monthly_income} steps={steps} />

          <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-white/80">{t('steps')}</h3>
              {canManage && <AddStepDialog staffId={staffId} planId={plan.id} />}
            </div>
            {steps.length === 0 ? (
              <p className="text-sm text-white/60">{t('noSteps')}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {steps.map((step) => (
                  <RoadmapStepCard key={step.id} staffId={staffId} step={step} canManage={canManage} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
