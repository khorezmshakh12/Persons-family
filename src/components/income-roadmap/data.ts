import 'server-only';
import { sql } from '@/lib/db/client';
import { tashkentYmd } from '@/lib/time';

/**
 * Read layer for the Income Roadmap.
 *
 * The database stores only two numbers per month — `planned_income` and
 * `actual_income`. Everything the UI shows (variance, month-over-month
 * growth %, cumulative plan vs cumulative actual, attainment, the run-rate
 * projection) is derived here, so there is exactly one definition of each
 * metric and no denormalised column can go stale.
 *
 * "Now" is Asia/Tashkent (`src/lib/time.ts`), never the server's UTC clock —
 * that is what decides which months count as closed.
 */

export type RoadmapStatus = 'draft' | 'active' | 'archived';
export type MilestoneStatus = 'planned' | 'in_progress' | 'achieved' | 'missed';

export type IncomeRoadmapHeader = {
  id: string;
  year: number;
  baselineMonthlyIncome: number;
  targetYearEndIncome: number;
  status: RoadmapStatus;
  notes: string | null;
};

export type IncomeRoadmapMonth = {
  monthNumber: number;
  /** 'YYYY-MM' — safe to hand to a date formatter as `${monthKey}-01`. */
  monthKey: string;
  planned: number;
  /** null = the month has not been reported yet (0 is a real reported zero). */
  actual: number | null;
  note: string | null;
  recordedAt: string | null;
  /** The month is over (or is the current month of a past year). */
  isClosed: boolean;
  isCurrent: boolean;
  /** actual − planned; null while the month is unreported. */
  variance: number | null;
  /** variance as a share of planned, in %; null if planned is 0. */
  variancePct: number | null;
  /** Growth vs the previous month, on the same series (actual where both
   * months are reported, otherwise plan vs plan). null for January. */
  growthPct: number | null;
  cumulativePlanned: number;
  /** Cumulative actual, counting only reported months. */
  cumulativeActual: number;
};

export type IncomeRoadmapMilestone = {
  id: string;
  title: string;
  targetMonth: number;
  targetIncome: number;
  criteria: string | null;
  status: MilestoneStatus;
  achievedAt: string | null;
};

export type IncomeRoadmapTotals = {
  /** Sum of all 12 planned months. */
  plannedYear: number;
  /** Sum of planned for reported months only — the fair comparison base. */
  plannedToDate: number;
  actualToDate: number;
  /** actualToDate / plannedToDate, in %; null when nothing is reported. */
  attainmentPct: number | null;
  reportedMonths: number;
  /** Average month-over-month growth across reported months, in %. */
  avgMonthlyGrowthPct: number | null;
  /** Growth from the baseline to the December plan, in %. */
  plannedYearGrowthPct: number | null;
  /** Latest reported month's income, or null. */
  latestActual: number | null;
  /** actualToDate + the plan for the months not yet reported. */
  projectedYearTotal: number;
};

export type IncomeRoadmapData = {
  /** The year being displayed. */
  year: number;
  /** Every year this employee has a roadmap for, newest first. */
  availableYears: number[];
  roadmap: IncomeRoadmapHeader | null;
  /** Always 12 entries when `roadmap` is set, otherwise empty. */
  months: IncomeRoadmapMonth[];
  milestones: IncomeRoadmapMilestone[];
  totals: IncomeRoadmapTotals | null;
};

type MonthRow = {
  month_number: number;
  planned_income: number;
  actual_income: number | null;
  note: string | null;
  actual_recorded_at: string | null;
};

function pct(from: number, to: number): number | null {
  if (from === 0) return null;
  return ((to - from) / from) * 100;
}

/**
 * Resolves which year to show: an explicit `year`, else the current Tashkent
 * year if a roadmap exists for it, else the most recent year that does. That
 * last fallback is what keeps history reachable — the old code derived the
 * year from "now" and simply showed nothing once January rolled around.
 */
export async function getIncomeRoadmapData(
  staffId: string,
  requestedYear?: number,
): Promise<IncomeRoadmapData> {
  const currentYear = tashkentYmd().year;
  const currentMonth = tashkentYmd().month;

  const yearRows = await sql<{ year: number }[]>`
    select year from income_roadmaps where staff_id = ${staffId} order by year desc
  `;
  const availableYears = yearRows.map((r) => r.year);

  const year =
    requestedYear ??
    (availableYears.includes(currentYear) ? currentYear : (availableYears[0] ?? currentYear));

  const [header] = await sql<
    {
      id: string;
      year: number;
      baseline_monthly_income: number;
      target_year_end_income: number;
      status: RoadmapStatus;
      notes: string | null;
    }[]
  >`
    select id, year, baseline_monthly_income, target_year_end_income, status, notes
    from income_roadmaps
    where staff_id = ${staffId} and year = ${year}
  `;

  if (!header) {
    return { year, availableYears, roadmap: null, months: [], milestones: [], totals: null };
  }

  // generate_series left-joined rather than trusting the seed: a roadmap
  // always renders all 12 slots even if a month row is somehow missing.
  const monthRows = await sql<MonthRow[]>`
    select g.n                          as month_number,
           coalesce(m.planned_income, 0) as planned_income,
           m.actual_income,
           m.note,
           m.actual_recorded_at
    from generate_series(1, 12) as g(n)
    left join income_roadmap_months m
      on m.roadmap_id = ${header.id} and m.month_number = g.n
    order by g.n
  `;

  const milestoneRows = await sql<
    {
      id: string;
      title: string;
      target_month: number;
      target_income: number;
      criteria: string | null;
      status: MilestoneStatus;
      achieved_at: string | null;
    }[]
  >`
    select id, title, target_month, target_income, criteria, status, achieved_at
    from income_roadmap_milestones
    where roadmap_id = ${header.id}
    order by target_month asc, sort_order asc, created_at asc
  `;

  const roadmap: IncomeRoadmapHeader = {
    id: header.id,
    year: header.year,
    baselineMonthlyIncome: header.baseline_monthly_income,
    targetYearEndIncome: header.target_year_end_income,
    status: header.status,
    notes: header.notes,
  };

  let cumulativePlanned = 0;
  let cumulativeActual = 0;
  const growthSamples: number[] = [];

  const months: IncomeRoadmapMonth[] = monthRows.map((row, index) => {
    const prev = index > 0 ? monthRows[index - 1] : null;
    cumulativePlanned += row.planned_income;
    if (row.actual_income !== null) cumulativeActual += row.actual_income;

    const bothActual = prev !== null && prev.actual_income !== null && row.actual_income !== null;
    const growthPct = bothActual
      ? pct(prev.actual_income as number, row.actual_income as number)
      : prev !== null
        ? pct(prev.planned_income, row.planned_income)
        : null;
    if (bothActual && growthPct !== null) growthSamples.push(growthPct);

    return {
      monthNumber: row.month_number,
      monthKey: `${year}-${String(row.month_number).padStart(2, '0')}`,
      planned: row.planned_income,
      actual: row.actual_income,
      note: row.note,
      recordedAt: row.actual_recorded_at,
      isClosed: year < currentYear || (year === currentYear && row.month_number < currentMonth),
      isCurrent: year === currentYear && row.month_number === currentMonth,
      variance: row.actual_income === null ? null : row.actual_income - row.planned_income,
      variancePct:
        row.actual_income === null ? null : pct(row.planned_income, row.actual_income),
      growthPct,
      cumulativePlanned,
      cumulativeActual,
    };
  });

  const reported = months.filter((m) => m.actual !== null);
  const plannedToDate = reported.reduce((sum, m) => sum + m.planned, 0);
  const actualToDate = reported.reduce((sum, m) => sum + (m.actual ?? 0), 0);
  const plannedYear = months.reduce((sum, m) => sum + m.planned, 0);
  const december = months[11];

  const totals: IncomeRoadmapTotals = {
    plannedYear,
    plannedToDate,
    actualToDate,
    attainmentPct: plannedToDate === 0 ? null : (actualToDate / plannedToDate) * 100,
    reportedMonths: reported.length,
    avgMonthlyGrowthPct:
      growthSamples.length === 0
        ? null
        : growthSamples.reduce((sum, g) => sum + g, 0) / growthSamples.length,
    plannedYearGrowthPct: december
      ? pct(roadmap.baselineMonthlyIncome, december.planned)
      : null,
    latestActual: reported.length === 0 ? null : (reported[reported.length - 1].actual ?? null),
    projectedYearTotal:
      actualToDate + months.filter((m) => m.actual === null).reduce((sum, m) => sum + m.planned, 0),
  };

  const milestones: IncomeRoadmapMilestone[] = milestoneRows.map((row) => ({
    id: row.id,
    title: row.title,
    targetMonth: row.target_month,
    targetIncome: row.target_income,
    criteria: row.criteria,
    status: row.status,
    achievedAt: row.achieved_at,
  }));

  return { year, availableYears, roadmap, months, milestones, totals };
}
