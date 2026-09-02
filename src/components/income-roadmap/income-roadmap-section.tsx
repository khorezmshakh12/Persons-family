import { getTranslations } from 'next-intl/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import {
  type IncomeRoadmapActionState,
  upsertIncomeRoadmapAction,
  saveMonthlyPlanAction,
  recordMonthActualAction,
  clearMonthActualAction,
  createMilestoneAction,
  setMilestoneStatusAction,
  deleteMilestoneAction,
} from '@/lib/actions/income-roadmap';
import { getIncomeRoadmapData } from './data';

/**
 * PLACEHOLDER RENDERING — deliberately unstyled beyond the shared glass
 * card. The finished UI/UX for this screen is specified in
 * `INCOME_ROADMAP_PROMPT.md` at the repo root and is built separately; this
 * component exists so the route keeps working and so every server-action
 * contract has a live, exercised reference implementation.
 *
 * All the numbers come from `getIncomeRoadmapData()` (see ./data.ts) — this
 * file computes nothing itself.
 *
 * The management forms wrap each action in `submit()` below so they can be
 * plain `<form action={…}>` submissions. That keeps the whole section a
 * server component with no client island; the real UI replaces these with
 * `useActionState` dialogs that surface `{ error }` as a toast.
 */

/**
 * `<form action>` wants a void-returning function, while these actions
 * return `{ error }` for `useActionState`. This placeholder has no toast
 * surface, so the returned code is dropped and the page simply re-renders
 * unchanged on a rejected write. The real UI must NOT do this — it uses
 * `useActionState` and shows `t(\`errors.${state.error}\`)`.
 */
function submit(
  action: (
    prevState: IncomeRoadmapActionState,
    formData: FormData,
  ) => Promise<IncomeRoadmapActionState>,
) {
  return async (formData: FormData) => {
    'use server';
    await action(undefined, formData);
  };
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function pctText(value: number | null): string {
  if (value === null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export async function IncomeRoadmapSection({
  staffId,
  canManage,
  year,
}: {
  staffId: string;
  canManage: boolean;
  /** Omitted → the current Tashkent year, falling back to the most recent
   * year this employee actually has a roadmap for. */
  year?: number;
}) {
  const t = await getTranslations('incomeRoadmap');
  /** New copy lives under `incomeRoadmap.*` but `messages/*.json` is owned by
   * a separate change — fall back to plain English until those keys land. */
  const label = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback);

  const { year: shownYear, availableYears, roadmap, months, milestones, totals } =
    await getIncomeRoadmapData(staffId, year);

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
            {t('title')} · {shownYear}
          </h2>
          <p className="text-sm text-white/60">{t('subtitle')}</p>
        </div>
        {availableYears.length > 0 && (
          <p className="text-xs text-white/50">
            {label('years', 'Years')}: {availableYears.join(', ')}
          </p>
        )}
      </div>

      {!roadmap || !totals ? (
        <>
          <p className="text-sm text-white/60">{canManage ? t('noPlan') : t('noPlanSelf')}</p>
          {canManage && (
            <form
              action={submit(upsertIncomeRoadmapAction)}
              className="flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="staffId" value={staffId} />
              <label className="flex flex-col gap-1 text-xs text-white/60">
                {label('year', 'Year')}
                <input
                  name="year"
                  type="number"
                  defaultValue={shownYear}
                  className="w-24 rounded-lg border border-white/25 bg-white/5 px-2 py-1 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-white/60">
                {label('baselineMonthlyIncome', 'Baseline monthly income')}
                <input
                  name="baselineMonthlyIncome"
                  type="number"
                  min={0}
                  defaultValue={0}
                  className="w-40 rounded-lg border border-white/25 bg-white/5 px-2 py-1 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-white/60">
                {t('targetYearEndIncome')}
                <input
                  name="targetYearEndIncome"
                  type="number"
                  min={0}
                  defaultValue={0}
                  className="w-40 rounded-lg border border-white/25 bg-white/5 px-2 py-1 text-sm text-white"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white"
              >
                {t('save')}
              </button>
            </form>
          )}
        </>
      ) : (
        <>
          {/* Headline figures ------------------------------------------------ */}
          <dl className="flex flex-wrap gap-6">
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-white/60">
                {label('baselineMonthlyIncome', 'Baseline monthly income')}
              </dt>
              <dd className="text-xl font-bold tabular-nums text-white">
                {formatUZS(roadmap.baselineMonthlyIncome)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-white/60">{t('targetYearEndIncome')}</dt>
              <dd className="text-xl font-bold tabular-nums text-emerald-400">
                {formatUZS(roadmap.targetYearEndIncome)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-white/60">{label('attainment', 'Attainment to date')}</dt>
              <dd className="text-xl font-bold tabular-nums text-white">
                {pctText(totals.attainmentPct)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-white/60">
                {label('avgMonthlyGrowth', 'Avg. monthly growth')}
              </dt>
              <dd className="text-xl font-bold tabular-nums text-white">
                {pctText(totals.avgMonthlyGrowthPct)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-white/60">
                {label('projectedYearTotal', 'Projected year total')}
              </dt>
              <dd className="text-xl font-bold tabular-nums text-white">
                {formatUZS(totals.projectedYearTotal)}
              </dd>
            </div>
          </dl>

          {/* Month grid: plan vs actual -------------------------------------- */}
          <div className="overflow-x-auto border-t border-white/10 pt-4">
            <table className="w-full min-w-[46rem] text-left text-sm text-white/80">
              <caption className="pb-2 text-left text-sm font-medium text-white/80">
                {label('monthlyPlan', 'Monthly plan vs actual')}
              </caption>
              <thead className="text-xs text-white/50">
                <tr>
                  <th scope="col" className="py-1 pr-3">
                    {label('month', 'Month')}
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    {label('planned', 'Planned')}
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    {label('actual', 'Actual')}
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    {label('variance', 'Variance')}
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    {label('growth', 'Growth')}
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    {label('cumulativePlanned', 'Cum. plan')}
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    {label('cumulativeActual', 'Cum. actual')}
                  </th>
                  {canManage && <th scope="col" className="py-1" />}
                </tr>
              </thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.monthNumber} className="border-t border-white/5">
                    <th scope="row" className="py-1.5 pr-3 font-normal text-white">
                      {MONTH_LABELS[month.monthNumber - 1]}
                      {month.isCurrent ? ' •' : ''}
                    </th>
                    <td className="py-1.5 pr-3 tabular-nums">{formatUZS(month.planned)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {month.actual === null ? '—' : formatUZS(month.actual)}
                    </td>
                    <td
                      className={cn(
                        'py-1.5 pr-3 tabular-nums',
                        month.variance !== null && month.variance < 0
                          ? 'text-red-300'
                          : month.variance !== null
                            ? 'text-emerald-300'
                            : '',
                      )}
                    >
                      {month.variance === null ? '—' : formatUZS(month.variance)}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{pctText(month.growthPct)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {formatUZS(month.cumulativePlanned)}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatUZS(month.cumulativeActual)}</td>
                    {canManage && (
                      <td className="py-1.5">
                        {month.actual === null ? (
                          <form
                            action={submit(recordMonthActualAction)}
                            className="flex items-center gap-1"
                          >
                            <input type="hidden" name="staffId" value={staffId} />
                            <input type="hidden" name="roadmapId" value={roadmap.id} />
                            <input type="hidden" name="monthNumber" value={month.monthNumber} />
                            <input
                              name="actualIncome"
                              type="number"
                              min={0}
                              defaultValue={0}
                              aria-label={label('actual', 'Actual')}
                              className="w-28 rounded-lg border border-white/25 bg-white/5 px-2 py-1 text-xs text-white"
                            />
                            <button
                              type="submit"
                              className="rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-xs text-white"
                            >
                              {label('recordActual', 'Record')}
                            </button>
                          </form>
                        ) : (
                          <form action={submit(clearMonthActualAction)}>
                            <input type="hidden" name="staffId" value={staffId} />
                            <input type="hidden" name="roadmapId" value={roadmap.id} />
                            <input type="hidden" name="monthNumber" value={month.monthNumber} />
                            <button
                              type="submit"
                              className="rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-xs text-white"
                            >
                              {label('clearActual', 'Clear')}
                            </button>
                          </form>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canManage && (
            <form
              action={submit(saveMonthlyPlanAction)}
              className="flex flex-col gap-2 border-t border-white/10 pt-4"
            >
              <h3 className="text-sm font-medium text-white/80">
                {label('editPlanCurve', 'Edit the 12-month planned curve')}
              </h3>
              <input type="hidden" name="staffId" value={staffId} />
              <input type="hidden" name="roadmapId" value={roadmap.id} />
              <div className="flex flex-wrap gap-2">
                {months.map((month) => (
                  <label
                    key={month.monthNumber}
                    className="flex flex-col gap-1 text-xs text-white/60"
                  >
                    {MONTH_LABELS[month.monthNumber - 1]}
                    <input
                      name={`planned-${month.monthNumber}`}
                      type="number"
                      min={0}
                      defaultValue={month.planned}
                      className="w-28 rounded-lg border border-white/25 bg-white/5 px-2 py-1 text-sm text-white"
                    />
                  </label>
                ))}
              </div>
              <button
                type="submit"
                className="w-fit rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white"
              >
                {t('save')}
              </button>
            </form>
          )}

          {/* Milestones ------------------------------------------------------ */}
          <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
            <h3 className="text-sm font-medium text-white/80">
              {label('milestones', 'Milestones')}
            </h3>
            {milestones.length === 0 ? (
              <p className="text-sm text-white/60">
                {label('noMilestones', 'No milestones yet.')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {milestones.map((milestone) => (
                  <li
                    key={milestone.id}
                    className="flex flex-col gap-1 rounded-xl border border-white/15 bg-white/5 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">{milestone.title}</span>
                      <span className="text-xs text-white/60">
                        {MONTH_LABELS[milestone.targetMonth - 1]} {shownYear}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-white">
                        {formatUZS(milestone.targetIncome)}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
                        {label(`milestoneStatus.${milestone.status}`, milestone.status)}
                      </span>
                    </div>
                    {milestone.criteria && (
                      <p className="text-sm text-white/70">{milestone.criteria}</p>
                    )}
                    {canManage && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <form
                          action={submit(setMilestoneStatusAction)}
                          className="flex items-center gap-1"
                        >
                          <input type="hidden" name="staffId" value={staffId} />
                          <input type="hidden" name="milestoneId" value={milestone.id} />
                          <select
                            name="status"
                            defaultValue={milestone.status}
                            aria-label={label('statusLabel', 'Status')}
                            className="rounded-lg border border-white/25 bg-white/5 px-2 py-1 text-xs text-white"
                          >
                            <option value="planned">planned</option>
                            <option value="in_progress">in_progress</option>
                            <option value="achieved">achieved</option>
                            <option value="missed">missed</option>
                          </select>
                          <button
                            type="submit"
                            className="rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-xs text-white"
                          >
                            {t('save')}
                          </button>
                        </form>
                        <form action={submit(deleteMilestoneAction)}>
                          <input type="hidden" name="staffId" value={staffId} />
                          <input type="hidden" name="milestoneId" value={milestone.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-red-400/30 bg-red-500/10 px-2 py-1 text-xs text-red-200"
                          >
                            {label('deleteMilestone', 'Delete')}
                          </button>
                        </form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canManage && (
              <form
                action={submit(createMilestoneAction)}
                className="flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="staffId" value={staffId} />
                <input type="hidden" name="roadmapId" value={roadmap.id} />
                <label className="flex flex-col gap-1 text-xs text-white/60">
                  {label('milestoneTitle', 'Title')}
                  <input
                    name="title"
                    required
                    maxLength={160}
                    className="w-52 rounded-lg border border-white/25 bg-white/5 px-2 py-1 text-sm text-white"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-white/60">
                  {t('targetMonth')}
                  <input
                    name="targetMonth"
                    type="number"
                    min={1}
                    max={12}
                    defaultValue={1}
                    className="w-20 rounded-lg border border-white/25 bg-white/5 px-2 py-1 text-sm text-white"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-white/60">
                  {label('targetIncome', 'Target income')}
                  <input
                    name="targetIncome"
                    type="number"
                    min={0}
                    defaultValue={0}
                    className="w-40 rounded-lg border border-white/25 bg-white/5 px-2 py-1 text-sm text-white"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-white/60">
                  {label('criteria', 'What it takes')}
                  <input
                    name="criteria"
                    maxLength={2000}
                    className="w-64 rounded-lg border border-white/25 bg-white/5 px-2 py-1 text-sm text-white"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white"
                >
                  {label('addMilestone', 'Add milestone')}
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
