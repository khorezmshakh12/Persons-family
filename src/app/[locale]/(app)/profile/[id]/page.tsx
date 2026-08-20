import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TeacherLevelBadge } from '@/components/staff/teacher-level-badge';
import type { TeacherLevel } from '@/lib/teacher-level';
import { ContactInfoCard } from '@/components/profile/contact-info-card';
import { SelfDevelopmentSection } from '@/components/profile/self-development-section';
import { WarningsCard } from '@/components/profile/warnings-card';
import { MarkWarningsSeen } from '@/components/profile/mark-warnings-seen';
import { BonusesPunishmentsCard } from '@/components/profile/bonuses-punishments-card';
import { DutiesCard } from '@/components/profile/duties-card';
import { ContractsCard } from '@/components/profile/contracts-card';
import { SectionErrorBoundary } from '@/components/profile/section-error-boundary';
import { GlassCardSkeleton } from '@/components/skeletons/glass-skeletons';

export const dynamic = 'force-dynamic';

// Every section below fetches its own data independently and streams in
// behind its own Suspense boundary, wrapped in its own error boundary —
// the same resilience pattern the dashboard already uses. Before this
// rewrite, all six sections rendered as one synchronous block with no
// isolation at all: one slow or transiently-failing query in ANY section
// blocked (or crashed) the entire page, which was the actual root cause of
// this page's recurring "sometimes doesn't load / kicks me out" bug —
// wrapping each section individually means a single bad query now only
// degrades that one card instead of taking the whole route down.
//
// Exported (not just the default below) so /profile/page.tsx can render a
// viewer's own profile in place instead of redirect()-ing here — a
// same-segment-tree redirect() out of a route that has a loading.tsx runs
// in Next's "streaming" mode (a client-side meta-redirect rather than a
// clean HTTP 307), which under Next 16's rewritten navigation/prefetch
// layer was intermittently corrupting the client router's cache-node tree
// on soft navigation and surfacing as a React #310 crash (a useMemo
// dependency array changing size) — a white screen with no server-side
// error at all. Same fix applied to /finance and /missions.
export async function ProfileDetailContent({ id, month }: { id: string; month?: string }) {
  const tStaff = await getTranslations('staff');
  const tProfile = await getTranslations('profile');
  const locale = await getLocale();
  const { user, profile: viewerProfile } = await getAuthState();

  const isSelf = user!.id === id;
  const isCeo = viewerProfile!.role === 'ceo';
  // IT Developer has no elevated reach anywhere anymore — plain regular
  // employee, same as any other non-admin role.
  const isAdmin = isCeo;
  const isAdminManager = viewerProfile!.role === 'admin_manager';
  // Warnings/bonuses/punishments are visible to CEO and Administrative
  // Manager for anyone (mirrors is_ceo_or_admin_manager() RLS);
  // self-development, duties, and contracts stay admin-or-self only
  // (mirrors their own RLS, which never granted admin_manager access to
  // those tables).
  const canView = isSelf || isAdmin || isAdminManager;
  if (!canView) redirect({ href: '/dashboard', locale });

  const canViewCeoScoped = isSelf || isAdmin;
  const canManageWarnings = !isSelf && (isAdmin || isAdminManager);
  const canManage = !isSelf && isAdmin;
  const sectionErrorMessage = tProfile('sectionError');

  const [target] = await sql<
    {
      id: string;
      first_name: string;
      last_name: string;
      phone: string;
      emergency_contact: string | null;
      avatar_url: string | null;
      role: string;
      teacher_level: TeacherLevel | null;
      telegram_id: number | null;
    }[]
  >`
    select id, first_name, last_name, phone, emergency_contact, avatar_url, role, teacher_level, telegram_id
    from profiles where id = ${id}
  `;
  if (!target) notFound();
  const avatarSignedUrl = await resolveAvatarUrl(target.avatar_url);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
      {isSelf && <MarkWarningsSeen />}
      <div
        style={{ animationDelay: '0ms' }}
        className={cn(GLASS_CARD, 'animate-fade-in-up flex items-center gap-4 p-6')}
      >
        <Avatar className="size-16 border border-white/30">
          <AvatarImage src={avatarSignedUrl ?? undefined} alt="" />
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
            {target.role === 'teacher' && target.teacher_level && (
              <TeacherLevelBadge level={target.teacher_level} />
            )}
          </div>
        </div>
      </div>

      <div className="animate-fade-in-up" style={{ animationDelay: '70ms' }}>
        <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
          <Suspense fallback={<GlassCardSkeleton />}>
            <ContactInfoCard profile={target} isSelf={isSelf} />
          </Suspense>
        </SectionErrorBoundary>
      </div>

      {canViewCeoScoped && (
        <div className="animate-fade-in-up" style={{ animationDelay: '140ms' }}>
          <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
            <Suspense fallback={<GlassCardSkeleton />}>
              <SelfDevelopmentSection staffId={id} isAdmin={isAdmin && !isSelf} selectedMonth={month ?? 'all'} />
            </Suspense>
          </SectionErrorBoundary>
        </div>
      )}

      <div className="animate-fade-in-up" style={{ animationDelay: '210ms' }}>
        <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
          <Suspense fallback={<GlassCardSkeleton />}>
            <WarningsCard staffId={id} canManage={canManageWarnings} />
          </Suspense>
        </SectionErrorBoundary>
      </div>

      <div className="animate-fade-in-up" style={{ animationDelay: '280ms' }}>
        <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
          <Suspense fallback={<GlassCardSkeleton />}>
            <BonusesPunishmentsCard staffId={id} canManage={canManage} />
          </Suspense>
        </SectionErrorBoundary>
      </div>

      {canViewCeoScoped && (
        <>
          <div className="animate-fade-in-up" style={{ animationDelay: '350ms' }}>
            <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
              <Suspense fallback={<GlassCardSkeleton />}>
                <DutiesCard staffId={id} canManage={canManage} />
              </Suspense>
            </SectionErrorBoundary>
          </div>
          <div className="animate-fade-in-up" style={{ animationDelay: '420ms' }}>
            <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
              <Suspense fallback={<GlassCardSkeleton />}>
                <ContractsCard staffId={id} isSelf={isSelf} canManage={canManage} />
              </Suspense>
            </SectionErrorBoundary>
          </div>
        </>
      )}
    </div>
  );
}

export default async function ProfileDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month } = await searchParams;
  return <ProfileDetailContent id={id} month={month} />;
}
