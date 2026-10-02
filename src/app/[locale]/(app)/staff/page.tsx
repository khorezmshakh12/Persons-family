import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { AddStaffDialog } from '@/components/staff/add-staff-dialog';
import { StaffTable } from '@/components/staff/staff-table';
import { AdminManagementSection } from '@/components/staff/admin-management-section';
import { GlassCardSkeleton, GlassTableSkeleton } from '@/components/skeletons/glass-skeletons';
import { can } from '@/lib/permissions';
import { Page, PageHeader } from '@/components/app-shell/page';

export const dynamic = 'force-dynamic';

// CEO or IT Developer — the layout above already redirects anyone else
// away, so this page never renders for another role. AdminManagementSection
// below still hard-gates itself to CEO only, independent of this.
export default async function StaffPage() {
  const t = await getTranslations('staff');
  const { user, profile } = await getAuthState();

  return (
    <Page>
      <PageHeader title={t('title')} actions={<AddStaffDialog canAssignCeo={can(profile!.role, 'staff.manageProtected')} />} />

      <Suspense fallback={<GlassCardSkeleton />}>
        <AdminManagementSection />
      </Suspense>

      <Suspense fallback={<GlassTableSkeleton rows={6} />}>
        <StaffTable currentUserId={user!.id} actingRole={profile!.role} />
      </Suspense>
    </Page>
  );
}
