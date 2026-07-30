import type { StaffRole } from '@/lib/nav';

/** Roles a given non-admin reporter is allowed to escalate an issue to.
 * Teachers get the explicit choice of routing to their Administrative
 * Manager for day-to-day operational issues, or straight to the CEO for
 * anything more critical. Every other non-admin role still only escalates
 * to an Administrative Manager — except an Administrative Manager
 * themselves, who (no longer being an admin role) escalates straight to
 * the CEO, the only sensible target above them.
 *
 * Shared between the Issues page (to scope the "Assign to" dropdown) and
 * createIssueAction (to re-validate the choice server-side) — this can't
 * live in issues.ts itself since a 'use server' file may only export async
 * Server Actions. */
export function allowedAssigneeRoles(reporterRole: StaffRole): StaffRole[] {
  if (reporterRole === 'teacher') return ['admin_manager', 'ceo'];
  if (reporterRole === 'admin_manager') return ['ceo'];
  return ['admin_manager'];
}
