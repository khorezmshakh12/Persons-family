import type { StaffRole } from '@/lib/nav';

/** Roles a given admin may delegate a task to — strictly below their own
 * rank. The CEO can delegate to the Administrative Manager or any
 * non-admin staff member; the Administrative Manager can only delegate to
 * non-admin staff. Shared between the Tasks page (to scope the "Assignee"
 * dropdown) and the assign/update Server Actions (to re-validate the
 * choice server-side) — this can't live in tasks.ts itself since a 'use
 * server' file may only export async Server Actions. */
export function allowedTaskAssigneeRoles(actingRole: StaffRole): StaffRole[] {
  const nonAdminRoles: StaffRole[] = ['teacher', 'assistant', 'smm', 'mobilgrof', 'it_developer'];
  return actingRole === 'ceo' ? ['admin_manager', ...nonAdminRoles] : nonAdminRoles;
}
