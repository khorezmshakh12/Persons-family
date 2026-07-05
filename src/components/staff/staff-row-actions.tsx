'use client';

import type { Profile } from '@/lib/auth/session';
import type { Database } from '@/lib/supabase/types';
import { EditStaffDialog } from './edit-staff-dialog';
import { ToggleActiveButton } from './toggle-active-button';
import { ResetPasswordDialog } from './reset-password-dialog';

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
  const canManage = !(target.role === 'ceo' && actingRole !== 'ceo');
  const canAssignCeo = actingRole === 'ceo';
  const isSelf = target.id === currentUserId;

  if (!canManage) return <span className="text-muted-foreground text-sm">—</span>;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <EditStaffDialog profile={target} canAssignCeo={canAssignCeo} performance={performance} />
      <ResetPasswordDialog staffId={target.id} />
      {!isSelf && <ToggleActiveButton staffId={target.id} isActive={target.is_active} />}
    </div>
  );
}
