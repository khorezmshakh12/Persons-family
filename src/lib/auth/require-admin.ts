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
 * Reserved for the handful of actions that stay CEO-exclusive even after
 * IT Developer's rank elevation (see requireAdmin() below): deleting a
 * staff account, deleting a Contract/Duty/attachment, and anything in
 * admin-management.ts (which manages Administrative Manager accounts
 * themselves — a protected role).
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
 * IT Developer sits directly below CEO in rank and shares CEO's day-to-day
 * administrative authority (staff CRUD short of delete, tasks, issues,
 * company news, self-development evaluation, chat moderation, performance,
 * contracts & duties short of delete, warnings/punishments, telegram) —
 * mirrors public.is_admin() at the RLS layer, which was widened the same
 * way. Use requireCeo() instead for the narrower set of actions that stay
 * CEO-exclusive (see its own comment).
 */
export async function requireAdmin() {
  const { user, profile } = await getAuthState();
  if (!user) throw new SessionExpiredError('No session');
  if (!profile || (profile.role !== 'ceo' && profile.role !== 'it_developer')) {
    throw new ForbiddenError('Admin access required');
  }
  return { user, profile };
}

/**
 * Roadmap (roadmap_goals) is CEO/Administrative Manager territory
 * specifically — not the general requireAdmin() (ceo/it_developer) gate.
 * Mirrors that table's existing RLS, which was already scoped to
 * `public.is_admin()` (role in ('ceo','admin_manager')) since the original
 * schema — IT Developer was deliberately never added to it when its rank
 * was elevated elsewhere, so this keeps the app layer and the DB layer in
 * sync.
 */
export async function requireCeoOrAdminManager() {
  const { user, profile } = await getAuthState();
  if (!user) throw new SessionExpiredError('No session');
  if (!profile || (profile.role !== 'ceo' && profile.role !== 'admin_manager')) {
    throw new ForbiddenError('CEO/Administrative Manager access required');
  }
  return { user, profile };
}
