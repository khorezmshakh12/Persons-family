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
 */
export async function requireCeo() {
  const { user, profile } = await getAuthState();
  if (!user || !profile || profile.role !== 'ceo') {
    throw new ForbiddenError('CEO access required');
  }
  return { user, profile };
}
