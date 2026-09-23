import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { AddStaffDialog } from '@/components/staff/add-staff-dialog';
import { StaffTable } from '@/components/staff/staff-table';
import { AdminManagementSection } from '@/components/staff/admin-management-section';
import { GlassCardSkeleton, GlassTableSkeleton } from '@/components/skeletons/glass-skeletons';

export const dynamic = 'force-dynamic';

// CEO or IT Developer — the layout above already redirects anyone else
// away, so this page never renders for another role. AdminManagementSection
// below still hard-gates itself to CEO only, independent of this.
export default async function StaffPage() {
  const t = await getTranslations('staff');
  const { user, profile } = await getAuthState();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-1 pb-8 sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3 relative overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px] sm:py-7">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">{t('title')}</h1>
        <AddStaffDialog canAssignCeo={profile!.role === 'ceo'} />
      </div>

      <Suspense fallback={<GlassCardSkeleton />}>
        <AdminManagementSection />
      </Suspense>

      <Suspense fallback={<GlassTableSkeleton rows={6} />}>
        <StaffTable currentUserId={user!.id} actingRole={profile!.role} />
      </Suspense>
    </div>
  );
}
