import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { tashkentMonthKey, tashkentYmd } from '@/lib/time';
import { BpointCard } from '@/components/finance/bpoint-card';
import { BpointProgress } from '@/components/finance/bpoint-progress';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import { roleLabel } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { type FinanceEntry } from '@/components/finance/finance-entries-list';
import { SalarySection } from '@/components/salary/salary-section';
import { IncomeRoadmapSection } from '@/components/income-roadmap/income-roadmap-section';
import { can, canSeeFor } from '@/lib/permissions';
import { FinanceTabs } from '@/components/finance/finance-tabs';
import { AdvancePanel, PayHistoryCard, PayStatementCard } from '@/components/finance/pay-statement';
import { loadAdvances, loadMyPayments, loadPayByMonth, loadPayHistory, loadPayLines, loadReimbursements } from '@/lib/pay-run-data';
import { MyPaymentsPanel, ReimbursePanel } from '@/components/finance/my-money';

export const dynamic = 'force-dynamic';

const MONTHS_UZ = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const SHORT_UZ = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const monthLabel = (ym: string) => `${MONTHS_UZ[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

// Exported so /finance/page.tsx can render a non-admin viewer's own finance
// page in place instead of redirect()-ing here — see the matching comment
// on ProfileDetailContent (profile/[id]/page.tsx) for why that redirect
// was crashing the client router under Next 16.
export async function FinanceDetailContent({
  staffId,
  searchParams,
}: {
  staffId: string;
  searchParams?: Promise<{ incomeYear?: string; month?: string }> | { incomeYear?: string; month?: string };
}) {
  const tStaff = await getTranslations('staff');
  const locale = await getLocale();
  const { user, profile } = await getAuthState();
  if (!user || !profile) return null; // layout redirects to /login

  const isSelf = user!.id === staffId;
  // Viewing anyone's pay: finance.viewAll; changing it: finance.manage. Who
  // holds each lives in CAP_ROLES (lib/permissions.ts) — today the CEO only.
  const isCeo = can(profile!.role, 'finance.manage');
  const isAdmin = isCeo;
  if (!isSelf && !can(profile!.role, 'finance.viewAll')) redirect({ href: '/dashboard', locale });

  const sp = searchParams instanceof Promise ? await searchParams : searchParams;
  const yearParam = sp?.incomeYear ? Number(sp.incomeYear) : undefined;
  const year = Number.isFinite(yearParam) ? yearParam : undefined;
  // Finance is read one month at a time (owner, 2026-10-04): every number and
  // list below is scoped to this Tashkent month; ‹ › moves between months.
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp?.month ?? '') ? sp!.month! : tashkentMonthKey();
  const shift = (d: number) => {
    const [y, m] = month.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + d, 1));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  // Month arrows keep the Income Roadmap year the viewer picked.
  const monthHref = (d: number) => `/finance/${staffId}?month=${shift(d)}${year ? `&incomeYear=${year}` : ''}`;

  const [target] = await sql<
    { id: string; first_name: string; last_name: string; avatar_url: string | null; role: string }[]
  >`select id, first_name, last_name, avatar_url, role from profiles where id = ${staffId}`;
  if (!target) notFound();

  const avatarSrc = await resolveAvatarUrl(target.avatar_url);

  const period = `${month}-01`;
  const [entries, lines, history, advances, myPayments, reimbursements] = await Promise.all([
    sql<FinanceEntry[]>`
      select id, title, amount, note, kind, source, created_at from finance_entries
      where staff_id = ${staffId} and period = ${period}
      order by created_at desc
    `,
    loadPayLines(period, staffId),
    loadPayHistory(period, staffId),
    isSelf ? loadAdvances(staffId) : Promise.resolve(null),
    isSelf ? loadMyPayments(staffId).catch(() => []) : Promise.resolve([]),
    isSelf ? loadReimbursements(staffId).catch(() => []) : Promise.resolve([]),
  ]);

  // B-nuqta (yillik maosh maqsadi): topilgan = har oyning hisoblangan oyligi
  // (pay run payable) yanvardan joriy oygacha, oyma-oy — bir oyning summasi
  // boshqa oyga aralashmaydi (finance audit 2026-10-22).
  const nowYmd = tashkentYmd();
  const bYear = nowYmd.year;
  const upToMonth = nowYmd.month;
  const [bpRows, ytd] = await Promise.all([
    sql<{ amount: number; note: string | null }[]>`select amount, note from staff_bpoint where user_id = ${staffId} and year = ${bYear}`,
    loadPayByMonth(`${bYear}-01-01`, `${bYear}-${String(upToMonth).padStart(2, '0')}-01`, staffId),
  ]);
  const bpoint = bpRows[0] ?? null;
  const byMonth = new Array(12).fill(0) as number[];
  for (const m of ytd) byMonth[Number(m.period.slice(5, 7)) - 1] = m.planned;
  const earnedYtd = byMonth.reduce((a, v) => a + v, 0);
  const bTarget = bpoint?.amount ?? 0;
  // All 12 months, so the planned path to the B-nuqta shows ahead of today;
  // months not reached yet carry no cumulative.
  const bMonths: { label: string; cumulative: number | null; amount: number | null }[] = [];
  for (let i = 0, cum = 0; i < 12; i++) {
    cum += byMonth[i];
    bMonths.push({ label: SHORT_UZ[i], cumulative: i < upToMonth ? Math.round(cum) : null, amount: i < upToMonth ? Math.round(byMonth[i]) : null });
  }
  const line = lines[0] ?? null;
  const roleName = roleLabel(tStaff, target.role);

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-3 pt-1 pb-10 sm:px-6">
      <FinanceTabs meId={user!.id} payroll={can(profile!.role, 'finance.viewAll')} accounting={canSeeFor(profile!, 'accounting')} />

      {/* Header: who + month navigator */}
      <div className="animate-fade-in-up flex flex-wrap items-center justify-between gap-4 rounded-au-card border border-au-line bg-au-card p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3.5">
          <Avatar className="size-12 border border-au-line">
            <AvatarImage src={avatarSrc ?? undefined} alt="" />
            <AvatarFallback className="text-base">
              {target.first_name[0]}
              {target.last_name[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-au-ink">
                {target.first_name} {target.last_name}
              </h1>
              <span className="fp-chip fp-chip-accent">{roleName}</span>
            </div>
            <span className="text-xs text-au-muted">Shaxsiy hisob varaqasi, avanslar va B-nuqta {bYear} daromad xaritasi</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={monthHref(-1)}
            className="inline-flex size-8 items-center justify-center rounded-au-ctl border border-au-line bg-au-card-2 text-au-ink transition hover:bg-au-accent-soft"
            aria-label="Oldingi oy"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-32 text-center text-base font-bold text-au-ink">{monthLabel(month)}</span>
          <Link
            href={monthHref(1)}
            className="inline-flex size-8 items-center justify-center rounded-au-ctl border border-au-line bg-au-card-2 text-au-ink transition hover:bg-au-accent-soft"
            aria-label="Keyingi oy"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      {/* Left 7: statement + ledger; right 5: B-nuqta, advance, 12 months */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-7">
          <PayStatementCard line={line} period={period} />
          {isSelf && <MyPaymentsPanel payments={myPayments} />}
          <div style={{ animationDelay: '70ms' }} className="animate-fade-in-up">
            <SalarySection
              staffId={staffId}
              isSelf={isSelf}
              isCeo={isCeo}
              isAdmin={isAdmin}
              entries={(entries ?? []) as FinanceEntry[]}
              month={month}
              line={line}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5 lg:col-span-5">
          <div style={{ animationDelay: '140ms' }} className="animate-fade-in-up">
            <BpointCard
              year={bYear}
              amount={bTarget}
              note={bpoint?.note ?? null}
              earnedYtd={earnedYtd}
              monthsElapsed={Math.max(1, upToMonth)}
              canEdit={isSelf || isCeo}
              staffId={staffId}
            />
          </div>
          <div style={{ animationDelay: '180ms' }} className="animate-fade-in-up">
            <BpointProgress year={bYear} target={bTarget} months={bMonths} />
          </div>
          {isSelf && advances && <AdvancePanel advances={advances} />}
          {isSelf && <ReimbursePanel items={reimbursements} />}
          <PayHistoryCard history={history} period={period} />
        </div>
      </div>

      {/* Income roadmap spans the full width */}
      <div style={{ animationDelay: '210ms' }} className="animate-fade-in-up">
        <IncomeRoadmapSection staffId={staffId} canManage={isCeo && !isSelf} year={year} bpoint={bTarget} bpointYear={bYear} />
      </div>
    </div>
  );
}

export default async function StaffFinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ incomeYear?: string; month?: string }>;
}) {
  const { staffId } = await params;
  return <FinanceDetailContent staffId={staffId} searchParams={searchParams} />;
}
