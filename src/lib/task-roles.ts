import type { StaffRole } from '@/lib/nav';
import { managedRoles } from '@/lib/permissions';

/** Roles a given assigner may delegate a task to — the org chart in
 * MANAGES (lib/permissions.ts): the CEO/COO everyone below them, each
 * director/lead only their own department. Empty = may not assign at all.
 *
 * Shared between the Tasks page (to scope the "Assignee" dropdown) and the
 * assign/update Server Actions (to re-validate the choice server-side) —
 * this can't live in tasks.ts itself since a 'use server' file may only
 * export async Server Actions. */
export function allowedTaskAssigneeRoles(actingRole: StaffRole): StaffRole[] {
  return managedRoles(actingRole);
}

/** Whether this role assigns (and so reviews) tasks at all. */
export function canAssignTasks(actingRole: StaffRole): boolean {
  return managedRoles(actingRole).length > 0;
}
