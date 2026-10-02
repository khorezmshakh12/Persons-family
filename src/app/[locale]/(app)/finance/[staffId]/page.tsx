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
import { Page, PageHeader } from '@/components/app-shell/page';

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

  const entries = await sql<FinanceEntry[]>`
    select id, title, amount, note, created_at from finance_entries
    where staff_id = ${staffId} order by created_at desc
  `;

  const net = netTotal(entries);

  return (
    <Page width="narrow">
      <PageHeader
        title={`${target.first_name} ${target.last_name}`}
        subtitle={roleLabel(tStaff, target.role)}
        leading={
          <Avatar className="size-12 border border-au-line">
            <AvatarImage src={avatarSrc ?? undefined} alt="" />
            <AvatarFallback>
              {target.first_name[0]}
              {target.last_name[0]}
            </AvatarFallback>
          </Avatar>
        }
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
    </Page>
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
