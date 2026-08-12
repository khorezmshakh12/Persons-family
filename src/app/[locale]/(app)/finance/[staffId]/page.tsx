import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { type FinanceEntry } from '@/components/finance/finance-entries-list';
import { SalarySection } from '@/components/salary/salary-section';
import { IncomeRoadmapSection } from '@/components/income-roadmap/income-roadmap-section';

export const dynamic = 'force-dynamic';

function netTotal(entries: { amount: number }[]) {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

// Exported so /finance/page.tsx can render a non-admin viewer's own finance
// page in place instead of redirect()-ing here — see the matching comment
// on ProfileDetailContent (profile/[id]/page.tsx) for why that redirect
// was crashing the client router under Next 16.
export async function FinanceDetailContent({ staffId }: { staffId: string }) {
  const tStaff = await getTranslations('staff');
  const locale = await getLocale();
  const { user, profile } = await getAuthState();

  const isSelf = user!.id === staffId;
  const isCeo = profile!.role === 'ceo';
  const isAdmin = isCeo;
  if (!isSelf && !isAdmin) redirect({ href: '/dashboard', locale });

  const supabase = await createClient();
  const { data: target } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, avatar_url, role')
    .eq('id', staffId)
    .maybeSingle();
  if (!target) notFound();

  const { data: entries } = await supabase
    .from('finance_entries')
    .select('*')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });

  const net = netTotal(entries ?? []);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
      <div
        style={{ animationDelay: '0ms' }}
        className={cn(GLASS_CARD, 'animate-fade-in-up flex items-center gap-4 p-6')}
      >
        <Avatar className="size-16 border border-white/30">
          <AvatarImage src={target.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="text-lg">
            {target.first_name[0]}
            {target.last_name[0]}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
            {target.first_name} {target.last_name}
          </h1>
          <span className="text-sm text-white/60">{tStaff(`roles.${target.role}`)}</span>
        </div>
      </div>

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
        <IncomeRoadmapSection staffId={staffId} canManage={isCeo && !isSelf} />
      </div>
    </div>
  );
}

export default async function StaffFinancePage({ params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params;
  return <FinanceDetailContent staffId={staffId} />;
}
