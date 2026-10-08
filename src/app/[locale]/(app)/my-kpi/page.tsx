import { notFound } from 'next/navigation';
import { getAuthState } from '@/lib/auth/session';
import { canFor, canSeeFor, type Role } from '@/lib/permissions';
import { tashkentMonthKey } from '@/lib/time';
import { shiftMonth } from '@/lib/kpi-plan';
import { loadMyPlans, loadMySalary, loadPlansFor, loadTeam } from '@/lib/kpi-plan-data';
import { MyKpi, TeamKpi } from '@/components/kpi-plan/kpi-workspace';
import { BgVideo } from '@/components/motion/bg-video';

export const dynamic = 'force-dynamic';

/** My KPI — monthly plan in three scenarios; the CEO approves and grades. */
export default async function MyKpiPage() {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'kpi')) notFound();
  const reviewer = canFor(profile, 'kpi.review');
  const thisMonth = `${tashkentMonthKey()}-01`;
  const nextMonth = shiftMonth(thisMonth, 1);
  const prevMonth = shiftMonth(thisMonth, -1);
  // Heat map: four months back, this month and next.
  const heatMonths = [-4, -3, -2, -1, 0, 1].map((o) => shiftMonth(thisMonth, o));

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 pt-1 pb-8 sm:px-7">
      <div className="relative flex flex-col gap-1 overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px] sm:py-7">
        <BgVideo variant="hero" />
        <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">{reviewer ? 'Jamoa KPI' : 'Mening KPI'}</h1>
        <p className="max-w-2xl text-au-muted">
          {reviewer
            ? 'Keyingi oy rejalarini tasdiqlang, tugagan oyni baholang — baho oylikka bonus yoki ushlab qolish bo‘lib tushadi.'
            : 'Har oy oxirgi kuni 23:59 gacha keyingi oy rejangizni uch ssenariyda topshiring: yomon, yaxshi va juda yaxshi.'}
        </p>
      </div>
      {reviewer ? (
        <TeamKpi
          team={await loadTeam()}
          plans={await loadPlansFor(heatMonths)}
          thisMonth={thisMonth}
          nextMonth={nextMonth}
          prevMonth={prevMonth}
          heatMonths={heatMonths}
        />
      ) : (
        <MyKpi
          plans={await loadMyPlans(profile.id)}
          role={profile.role as Role}
          thisMonth={thisMonth}
          nextMonth={nextMonth}
          salary={await loadMySalary(profile.id)}
        />
      )}
    </div>
  );
}
