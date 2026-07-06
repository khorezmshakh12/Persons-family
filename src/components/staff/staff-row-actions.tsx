'use client';

import dynamic from 'next/dynamic';
import type { Profile } from '@/lib/auth/session';
import type { Database } from '@/lib/supabase/types';
import { ToggleActiveButton } from './toggle-active-button';
import { ResetPasswordDialog } from './reset-password-dialog';

// Code-split: the heaviest dialog in the app (tabs, avatar upload, the A/B/C
// performance form) only needs to load once someone actually opens it,
// instead of shipping in every staff-page bundle up front.
const EditStaffDialog = dynamic(() => import('./edit-staff-dialog').then((mod) => mod.EditStaffDialog));

type StaffPerformance = Database['public']['Tables']['staff_performance']['Row'];

export function StaffRowActions({
  target,
  currentUserId,
  actingRole,
  performance,
}: {
  target: Profile;
  currentUserId: string;
  actingRole: Profile['role'];
  performance: StaffPerformance | null;
}) {
  const isSelf = target.id === currentUserId;
  // CEO and Admin Manager are equal for day-to-day operations, but managing
  // another CEO or Admin account (not your own) is reserved to the CEO.
  const isProtectedRole = target.role === 'ceo' || target.role === 'admin_manager';
  const canManage = isSelf || !(isProtectedRole && actingRole !== 'ceo');
  const canAssignCeo = actingRole === 'ceo';

  if (!canManage) return <span className="text-muted-foreground text-sm">—</span>;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <EditStaffDialog profile={target} canAssignCeo={canAssignCeo} performance={performance} />
      <ResetPasswordDialog staffId={target.id} />
      {!isSelf && <ToggleActiveButton staffId={target.id} isActive={target.is_active} />}
    </div>
  );
}
