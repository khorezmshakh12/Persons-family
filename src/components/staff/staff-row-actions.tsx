'use client';

import type { Profile } from '@/lib/auth/session';
import { EditStaffDialog } from './edit-staff-dialog';
import { ToggleActiveButton } from './toggle-active-button';
import { ResetPasswordDialog } from './reset-password-dialog';

export function StaffRowActions({
  target,
  currentUserId,
  actingRole,
}: {
  target: Profile;
  currentUserId: string;
  actingRole: Profile['role'];
}) {
  const canManage = !(target.role === 'ceo' && actingRole !== 'ceo');
  const canAssignCeo = actingRole === 'ceo';
  const isSelf = target.id === currentUserId;

  if (!canManage) return <span className="text-muted-foreground text-sm">—</span>;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <EditStaffDialog profile={target} canAssignCeo={canAssignCeo} />
      <ResetPasswordDialog staffId={target.id} />
      {!isSelf && <ToggleActiveButton staffId={target.id} isActive={target.is_active} />}
    </div>
  );
}
