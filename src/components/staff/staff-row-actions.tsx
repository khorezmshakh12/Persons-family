'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { KeyRound, Ban, CheckCircle2, Trash2, MoreVertical } from 'lucide-react';
import type { Profile } from '@/lib/auth/session';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleActiveButton } from './toggle-active-button';
import { ResetPasswordDialog } from './reset-password-dialog';
import { DeleteStaffButton } from './delete-staff-button';

// Code-split: the heaviest dialog in the app (tabs, avatar upload) only
// needs to load once someone actually opens it, instead of shipping in
// every staff-page bundle up front.
const EditStaffDialog = dynamic(() =>
  import('./edit-staff-dialog').then((mod) => mod.EditStaffDialog),
);

type MenuAction = 'reset' | 'toggle' | 'delete' | null;

// Edit stays a direct, always-visible action (the most common one); the
// rest — reset password, deactivate/activate, delete — used to be four more
// buttons plus a trash icon crammed into every row. They're consolidated
// behind a single "more" menu instead; each dialog underneath still owns
// its own confirmation/logic, just externally controlled now (see the
// `open`/`onOpenChange` props added to each) so the menu item can drive it.
export function StaffRowActions({
  target,
  currentUserId,
  actingRole,
}: {
  target: Profile;
  currentUserId: string;
  actingRole: Profile['role'];
}) {
  const t = useTranslations('staff');
  const [menuAction, setMenuAction] = useState<MenuAction>(null);
  const isSelf = target.id === currentUserId;
  // CEO and Admin Manager are equal for day-to-day operations, but managing
  // another CEO or Admin account (not your own) is reserved to the CEO.
  const isProtectedRole = target.role === 'ceo' || target.role === 'admin_manager';
  const canManage = isSelf || !(isProtectedRole && actingRole !== 'ceo');
  const canAssignCeo = actingRole === 'ceo';
  const canDeactivate = !isSelf;
  const canDelete = !isSelf && (actingRole === 'ceo' || actingRole === 'it_developer');
  const hasMenuActions = canDeactivate || canDelete;

  if (!canManage) return <span className="text-muted-foreground text-sm">—</span>;

  return (
    <div className="flex items-center justify-end gap-2">
      <EditStaffDialog profile={target} canAssignCeo={canAssignCeo} />

      {hasMenuActions && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('moreActions')}
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              />
            }
          >
            <MoreVertical className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setMenuAction('reset')}>
              <KeyRound />
              {t('resetPassword')}
            </DropdownMenuItem>
            {canDeactivate && (
              <DropdownMenuItem onClick={() => setMenuAction('toggle')}>
                {target.is_active ? <Ban /> : <CheckCircle2 />}
                {target.is_active ? t('deactivate') : t('activate')}
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem variant="destructive" onClick={() => setMenuAction('delete')}>
                <Trash2 />
                {t('delete')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <ResetPasswordDialog
        staffId={target.id}
        open={menuAction === 'reset'}
        onOpenChange={(open) => setMenuAction(open ? 'reset' : null)}
      />
      {canDeactivate && (
        <ToggleActiveButton
          staffId={target.id}
          isActive={target.is_active}
          open={menuAction === 'toggle'}
          onOpenChange={(open) => setMenuAction(open ? 'toggle' : null)}
        />
      )}
      {canDelete && (
        <DeleteStaffButton
          staffId={target.id}
          staffName={`${target.first_name} ${target.last_name}`}
          open={menuAction === 'delete'}
          onOpenChange={(open) => setMenuAction(open ? 'delete' : null)}
        />
      )}
    </div>
  );
}
