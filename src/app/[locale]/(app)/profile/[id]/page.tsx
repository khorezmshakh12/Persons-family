import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TeacherLevelBadge } from '@/components/staff/teacher-level-badge';
import { ContactInfoCard } from '@/components/profile/contact-info-card';
import { SelfDevelopmentSection } from '@/components/profile/self-development-section';
import { WarningsCard } from '@/components/profile/warnings-card';
import { MarkWarningsSeen } from '@/components/profile/mark-warnings-seen';
import { BonusesPunishmentsCard } from '@/components/profile/bonuses-punishments-card';
import { DutiesCard } from '@/components/profile/duties-card';
import { ContractsCard } from '@/components/profile/contracts-card';

export const dynamic = 'force-dynamic';

export default async function ProfileDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month } = await searchParams;
  const tStaff = await getTranslations('staff');
  const locale = await getLocale();
  const { user, profile: viewerProfile } = await getAuthState();

  const isSelf = user!.id === id;
  const isCeo = viewerProfile!.role === 'ceo';
  // IT Developer ranks directly below CEO (requireAdmin()) and shares its
  // reach here, short of managing a ceo/admin_manager account itself
  // (isProtectedRole in staff.ts — not relevant on this page, which only
  // ever shows warnings/bonuses/duties/contracts, none of which touch role
  // or account identity).
  const isAdmin = isCeo || viewerProfile!.role === 'it_developer';
  const isAdminManager = viewerProfile!.role === 'admin_manager';
  // Warnings/bonuses/punishments are visible to CEO/IT Developer and
  // Administrative Manager for anyone (mirrors is_ceo_or_admin_manager()
  // RLS); self-development, duties, and contracts stay admin-or-self only
  // (mirrors their own RLS, which never granted admin_manager access to
  // those tables).
  const canView = isSelf || isAdmin || isAdminManager;
  if (!canView) redirect({ href: '/dashboard', locale });

  const canViewCeoScoped = isSelf || isAdmin;
  const canManageWarnings = !isSelf && (isAdmin || isAdminManager);
  const canManage = !isSelf && isAdmin;

  const supabase = await createClient();
  const { data: target } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, phone, emergency_contact, avatar_url, role, teacher_level, telegram_id')
    .eq('id', id)
    .maybeSingle();
  if (!target) notFound();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
      {isSelf && <MarkWarningsSeen />}
      <div className={cn(GLASS_CARD, 'flex items-center gap-4 p-6')}>
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-white/60">{tStaff(`roles.${target.role}`)}</span>
            {target.role === 'teacher' && <TeacherLevelBadge level={target.teacher_level} />}
          </div>
        </div>
      </div>

      <ContactInfoCard profile={target} isSelf={isSelf} />

      {canViewCeoScoped && (
        <SelfDevelopmentSection
          staffId={id}
          isAdmin={isAdmin && !isSelf}
          selectedMonth={month ?? 'all'}
        />
      )}

      <WarningsCard staffId={id} canManage={canManageWarnings} />

      <BonusesPunishmentsCard staffId={id} canManage={canManage} />

      {canViewCeoScoped && (
        <>
          <DutiesCard staffId={id} canManage={canManage} />
          <ContractsCard staffId={id} isSelf={isSelf} canManage={canManage} />
        </>
      )}
    </div>
  );
}
