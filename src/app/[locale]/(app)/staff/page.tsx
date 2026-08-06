import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { AddStaffDialog } from '@/components/staff/add-staff-dialog';
import { AddAdminManagerDialog } from '@/components/staff/add-admin-manager-dialog';
import { StaffTable } from '@/components/staff/staff-table';
import { AdminManagementSection } from '@/components/staff/admin-management-section';
import { GlassCardSkeleton, GlassTableSkeleton } from '@/components/skeletons/glass-skeletons';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const t = await getTranslations('staff');
  const { user, profile } = await getAuthState();
  const isCeo = profile!.role === 'ceo';
  // IT Developer ranks directly below CEO (requireAdmin()) and gets the
  // same staff list + create/edit/deactivate/reset-password powers, short
  // of anything CEO-exclusive: assigning ceo/admin_manager roles
  // (canAssignCeo stays literal isCeo, which AddStaffDialog already
  // filters on), deleting a staff account, and managing an Administrative
  // Manager account itself (AdminManagementSection stays isCeo-gated).
  const isAdmin = isCeo || profile!.role === 'it_developer';

  if (!isAdmin) return null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{t('title')}</h1>
        <div className="flex items-center gap-2">
          {profile!.role === 'it_developer' && <AddAdminManagerDialog />}
          <AddStaffDialog canAssignCeo={isCeo} />
        </div>
      </div>

      {isCeo && (
        <Suspense fallback={<GlassCardSkeleton />}>
          <AdminManagementSection />
        </Suspense>
      )}

      <Suspense fallback={<GlassTableSkeleton rows={6} />}>
        <StaffTable currentUserId={user!.id} actingRole={profile!.role} />
      </Suspense>
    </div>
  );
}
