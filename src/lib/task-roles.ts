import type { StaffRole } from '@/lib/nav';

/** Roles a given assigner may delegate a task to. The CEO can delegate to
 * the Administrative Manager or any non-admin staff member. IT Developer
 * gets one narrow carve-out symmetric to its account-creation power (see
 * createAdminManagerAction): it may only give tasks to the Administrative
 * Manager, nobody else. Everyone else here is a plain assignee, never an
 * assigner, so this branch is only reachable defensively.
 *
 * Shared between the Tasks page (to scope the "Assignee" dropdown) and the
 * assign/update Server Actions (to re-validate the choice server-side) —
 * this can't live in tasks.ts itself since a 'use server' file may only
 * export async Server Actions. */
export function allowedTaskAssigneeRoles(actingRole: StaffRole): StaffRole[] {
  const nonAdminRoles: StaffRole[] = ['teacher', 'assistant', 'smm', 'mobilgrof', 'it_developer'];
  if (actingRole === 'ceo') return ['admin_manager', ...nonAdminRoles];
  if (actingRole === 'it_developer') return ['admin_manager'];
  return nonAdminRoles;
}
