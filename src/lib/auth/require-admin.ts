import { getAuthState } from './session';

export class ForbiddenError extends Error {}

/** Distinct from ForbiddenError: thrown when there's no signed-in user at
 * all, which almost always means their session expired mid-visit rather
 * than a genuine permissions problem — the two need different copy so the
 * user knows to log back in instead of assuming they're not allowed to do
 * this. */
export class SessionExpiredError extends Error {}

/** Every requireAdmin()/requireCeo() call site catches with `catch (error)
 * { return { error: authErrorCode(error) }; }` instead of hardcoding
 * 'forbidden' — this is the one place that maps the thrown error to the
 * right user-facing code, so a new distinction (or a third error class
 * later) only ever needs to change here. */
export function authErrorCode(error: unknown): 'sessionExpired' | 'forbidden' {
  return error instanceof SessionExpiredError ? 'sessionExpired' : 'forbidden';
}

/**
 * Every CEO-only Server Action must call this itself — a route/layout
 * guard only gates page rendering, not the POST endpoints underneath it.
 * Administrative Manager is no longer treated as an admin role generally
 * (see the role rework) — the handful of things it still keeps (viewing
 * every group's lesson plans + commenting, updating the status of an issue
 * assigned to it) are checked explicitly at their own call sites instead of
 * through a shared "is admin" gate.
 *
 * Reserved for actions that stay CEO-exclusive: deleting a staff account,
 * deleting a Contract/Duty/attachment, and anything in admin-management.ts
 * (which manages Administrative Manager accounts themselves — a protected
 * role). IT Developer briefly shared this rank (see requireAdmin() below)
 * but was reverted to a plain regular employee with no elevated reach.
 */
export async function requireCeo() {
  const { user, profile } = await getAuthState();
  if (!user) throw new SessionExpiredError('No session');
  if (!profile || profile.role !== 'ceo') {
    throw new ForbiddenError('CEO access required');
  }
  return { user, profile };
}

/**
 * CEO-only, mirroring public.is_admin() at the RLS layer. IT Developer used
 * to share this (staff CRUD, tasks, issues, company news, self-development
 * evaluation, chat moderation, contracts & duties, warnings/punishments,
 * telegram) but that elevation was fully reverted — it's now a plain
 * regular employee. This function is kept distinct from requireCeo() only
 * because they're functionally identical for the moment; call sites were
 * left as requireAdmin() rather than mass-renamed to lower the risk of the
 * revert, not because it still grants anything requireCeo() doesn't.
 */
export async function requireAdmin() {
  const { user, profile } = await getAuthState();
  if (!user) throw new SessionExpiredError('No session');
  if (!profile || profile.role !== 'ceo') {
    throw new ForbiddenError('Admin access required');
  }
  return { user, profile };
}

/**
 * Roadmap (roadmap_goals) is CEO/Administrative Manager territory
 * specifically — not the general requireAdmin() gate. Mirrors that table's
 * RLS, which explicitly checks `current_role() in ('ceo','admin_manager')`
 * rather than composing the shared is_admin() (a past version routed
 * through is_admin() and silently drifted out of sync with this comment
 * every time is_admin()'s own meaning changed — decoupled for good).
 */
export async function requireCeoOrAdminManager() {
  const { user, profile } = await getAuthState();
  if (!user) throw new SessionExpiredError('No session');
  if (!profile || (profile.role !== 'ceo' && profile.role !== 'admin_manager')) {
    throw new ForbiddenError('CEO/Administrative Manager access required');
  }
  return { user, profile };
}
