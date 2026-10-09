import { Link } from '@/i18n/navigation';
import { tashkentMonthKey } from '@/lib/time';
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
import { can } from '@/lib/permissions';
import { PayStatement } from '@/components/finance/pay-statement';
import { loadAdvances, loadPayHistory, loadPayLines, loadPayRun } from '@/lib/pay-run-data';

export const dynamic = 'force-dynamic';

const MONTHS_UZ = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const monthLabel = (ym: string) => `${MONTHS_UZ[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

function netTotal(entries: { amount: number }[]) {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

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

  const isSelf = user!.id === staffId;
  // Viewing anyone's pay: finance.viewAll (CEO, COO, Financist). Changing it:
  // finance.manage (CEO, Financist) — the COO reads only.
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

  const [target] = await sql<
    { id: string; first_name: string; last_name: string; avatar_url: string | null; role: string }[]
  >`select id, first_name, last_name, avatar_url, role from profiles where id = ${staffId}`;
  if (!target) notFound();

  const avatarSrc = await resolveAvatarUrl(target.avatar_url);

  const period = `${month}-01`;
  const [entries, lines, run, history, advances] = await Promise.all([
    sql<FinanceEntry[]>`
      select id, title, amount, note, created_at from finance_entries
      where staff_id = ${staffId}
        and coalesce(to_char(period, 'YYYY-MM'), to_char(created_at at time zone 'Asia/Tashkent', 'YYYY-MM')) = ${month}
      order by created_at desc
    `,
    loadPayLines(period, staffId),
    loadPayRun(period),
    loadPayHistory(period, staffId),
    isSelf ? loadAdvances(staffId) : Promise.resolve(null),
  ]);

  const net = netTotal(entries);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-1 pb-8 sm:px-7">
      <div className="animate-fade-in-up flex items-center gap-4">
        <Avatar className="size-14 border border-au-line">
          <AvatarImage src={avatarSrc ?? undefined} alt="" />
          <AvatarFallback className="text-lg">
            {target.first_name[0]}
            {target.last_name[0]}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-[26px] leading-8 font-bold tracking-tight text-au-ink">
            {target.first_name} {target.last_name}
          </h1>
          <span className="text-sm text-au-muted">{roleLabel(tStaff, target.role)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/finance/${staffId}?month=${shift(-1)}`}
          className="rounded-full border border-au-line bg-au-card px-3 py-1.5 text-sm font-semibold text-au-muted hover:text-au-ink"
          aria-label="Oldingi oy"
        >
          ‹
        </Link>
        <span className="text-base font-bold text-au-ink">{monthLabel(month)}</span>
        <Link
          href={`/finance/${staffId}?month=${shift(1)}`}
          className="rounded-full border border-au-line bg-au-card px-3 py-1.5 text-sm font-semibold text-au-muted hover:text-au-ink"
          aria-label="Keyingi oy"
        >
          ›
        </Link>
      </div>
      <PayStatement line={lines[0] ?? null} period={period} status={run.status} history={history} advances={advances} isSelf={isSelf} />

      <div style={{ animationDelay: '70ms' }} className="animate-fade-in-up">
        <SalarySection
          staffId={staffId}
          isSelf={isSelf}
          isCeo={isCeo}
          isAdmin={isAdmin}
          entries={(entries ?? []) as FinanceEntry[]}
          net={net}
          month={month}
        />
      </div>

      <div style={{ animationDelay: '140ms' }} className="animate-fade-in-up">
        <IncomeRoadmapSection staffId={staffId} canManage={isCeo && !isSelf} year={year} />
      </div>
    </div>
  );
}

export default async function StaffFinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ incomeYear?: string }>;
}) {
  const { staffId } = await params;
  return <FinanceDetailContent staffId={staffId} searchParams={searchParams} />;
}
