import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { roleLabel } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { type FinanceEntry } from '@/components/finance/finance-entries-list';
import { SalarySection } from '@/components/salary/salary-section';
import { IncomeRoadmapSection } from '@/components/income-roadmap/income-roadmap-section';
import { can } from '@/lib/permissions';
import { getNetEarningEntries, netEarnings } from '@/lib/finance-net';
import { formatUZS } from '@/lib/format-currency';
import { CountUp } from '@/components/motion/count-up';
import { EarningsWaterfall } from '@/components/finance/earnings-waterfall';

export const dynamic = 'force-dynamic';

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
  searchParams?: Promise<{ incomeYear?: string }> | { incomeYear?: string };
}) {
  const tStaff = await getTranslations('staff');
  const tSum = await getTranslations('finance.summary');
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

  const [target] = await sql<
    { id: string; first_name: string; last_name: string; avatar_url: string | null; role: string }[]
  >`select id, first_name, last_name, avatar_url, role from profiles where id = ${staffId}`;
  if (!target) notFound();

  const avatarSrc = await resolveAvatarUrl(target.avatar_url);

  const [entries, earnings, [pen]] = await Promise.all([
    sql<FinanceEntry[]>`
      select id, title, amount, note, created_at from finance_entries
      where staff_id = ${staffId} order by created_at desc
    `,
    getNetEarningEntries(staffId),
    sql<{ penalties: number }[]>`
      select coalesce(sum(amount) filter (where entry_type = 'penalty'), 0) as penalties
      from performance_entries where staff_id = ${staffId}
    `,
  ]);

  const net = netTotal(entries);
  // The four numbers that answer "what did I get": same totals SalaryTotal
  // shows (finance-net.ts), split so bonuses and penalties are visible.
  const total = netEarnings(earnings);
  const penalties = Math.round(Number(pen?.penalties) || 0);
  const bonuses = total - net + penalties;
  const summary = [
    { key: 'salary', value: formatUZS(net), tone: 'text-au-ink' },
    { key: 'bonuses', value: `+${formatUZS(bonuses)}`, tone: 'text-au-ok' },
    { key: 'penalties', value: `−${formatUZS(penalties)}`, tone: 'text-au-bad' },
    { key: 'total', value: formatUZS(total), tone: 'text-au-ink' },
  ] as const;

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((k, i) => (
          <div
            key={k.key}
            style={{ animationDelay: `${i * 50}ms` }}
            className={cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-1 p-4', k.key === 'total' && 'bg-au-card-2')}
          >
            <span className="text-xs font-medium text-au-muted">{tSum(k.key)}</span>
            <span className={cn('text-xl font-bold tabular-nums sm:text-2xl', k.tone)}>
              <CountUp value={k.value} />
            </span>
          </div>
        ))}
      </div>

      <EarningsWaterfall
        salary={net}
        bonuses={bonuses}
        penalties={penalties}
        total={total}
        labels={{ salary: tSum('salary'), bonuses: tSum('bonuses'), penalties: tSum('penalties'), total: tSum('total') }}
      />

      <div style={{ animationDelay: '70ms' }} className="animate-fade-in-up">
        <SalarySection
          staffId={staffId}
          isSelf={isSelf}
          isCeo={isCeo}
          isAdmin={isAdmin}
          entries={(entries ?? []) as FinanceEntry[]}
          net={net}
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
