import type { StaffRole } from '@/lib/nav';

/** Roles a given assigner may delegate a task to. Only the CEO may delegate
 * to the Administrative Manager or any non-admin staff member — IT
 * Developer lost task-assignment entirely (requireTaskAssigner() in
 * tasks.ts is CEO-only now), so its branch here is unreachable in practice
 * and kept only because everyone else falls through to the same
 * plain-assignee list regardless of role.
 *
 * Shared between the Tasks page (to scope the "Assignee" dropdown) and the
 * assign/update Server Actions (to re-validate the choice server-side) —
 * this can't live in tasks.ts itself since a 'use server' file may only
 * export async Server Actions. */
export function allowedTaskAssigneeRoles(actingRole: StaffRole): StaffRole[] {
  const nonAdminRoles: StaffRole[] = [
    'teacher',
    'assistant',
    'mmd',
    'internship',
    'it_developer',
    'head_teacher',
  ];
  if (actingRole === 'ceo') return ['admin_manager', ...nonAdminRoles];
  return nonAdminRoles;
}
