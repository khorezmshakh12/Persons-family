import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ManageStaffFinanceDialog } from '@/components/finance/manage-staff-finance-dialog';
import { FinanceEntriesList, type FinanceEntry } from '@/components/finance/finance-entries-list';
import { KpiSection } from '@/components/kpi/kpi-section';
import { IncomeRoadmapSection } from '@/components/income-roadmap/income-roadmap-section';

export const dynamic = 'force-dynamic';

function netTotal(entries: { amount: number }[]) {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

export default async function StaffFinancePage({ params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params;
  const t = await getTranslations('finance');
  const tStaff = await getTranslations('staff');
  const locale = await getLocale();
  const { user, profile } = await getAuthState();

  const isSelf = user!.id === staffId;
  const isAdmin = profile!.role === 'ceo' || profile!.role === 'it_developer';
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

      <div style={{ animationDelay: '70ms' }} className={cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-4 p-6')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
              {t('history')}
            </h2>
            <span
              className={cn('text-lg font-bold tabular-nums', net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : 'text-white/70')}
            >
              {net >= 0 ? '+' : ''}
              {formatUZS(net)}
            </span>
          </div>
          {isAdmin && <ManageStaffFinanceDialog staffId={staffId} />}
        </div>
        <FinanceEntriesList entries={(entries ?? []) as FinanceEntry[]} isAdmin={isAdmin} />
      </div>

      <div style={{ animationDelay: '140ms' }} className="animate-fade-in-up">
        <KpiSection staffId={staffId} canManage={isAdmin} />
      </div>

      <div style={{ animationDelay: '210ms' }} className="animate-fade-in-up">
        <IncomeRoadmapSection staffId={staffId} canManage={isAdmin} />
      </div>
    </div>
  );
}
