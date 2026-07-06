import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { AddStaffDialog } from '@/components/staff/add-staff-dialog';
import { StaffTable } from '@/components/staff/staff-table';
import { AdminManagementSection } from '@/components/staff/admin-management-section';
import { GlassCardSkeleton, GlassTableSkeleton } from '@/components/skeletons/glass-skeletons';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const t = await getTranslations('staff');
  const { user, profile } = await getAuthState();
  const isCeo = profile!.role === 'ceo';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <AddStaffDialog canAssignCeo={isCeo} />
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
