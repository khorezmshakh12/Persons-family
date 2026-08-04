import type { StaffRole } from '@/lib/nav';

/** Roles a given assigner may delegate a task to. CEO and IT Developer
 * (ranked directly below CEO — see requireAdmin()) can both delegate to
 * the Administrative Manager or any non-admin staff member. Everyone else
 * here is a plain assignee, never an assigner, so this branch is only
 * reachable defensively.
 *
 * Shared between the Tasks page (to scope the "Assignee" dropdown) and the
 * assign/update Server Actions (to re-validate the choice server-side) —
 * this can't live in tasks.ts itself since a 'use server' file may only
 * export async Server Actions. */
export function allowedTaskAssigneeRoles(actingRole: StaffRole): StaffRole[] {
  const nonAdminRoles: StaffRole[] = ['teacher', 'assistant', 'smm', 'mobilgrof', 'it_developer'];
  if (actingRole === 'ceo' || actingRole === 'it_developer') return ['admin_manager', ...nonAdminRoles];
  return nonAdminRoles;
}
