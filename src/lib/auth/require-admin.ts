import { getAuthState } from './session';

export class ForbiddenError extends Error {}

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
  if (!user || !profile || profile.role !== 'ceo') {
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
  if (!user || !profile || (profile.role !== 'ceo' && profile.role !== 'it_developer')) {
    throw new ForbiddenError('Admin access required');
  }
  return { user, profile };
}
