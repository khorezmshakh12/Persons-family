import { getAuthState } from './session';

export class ForbiddenError extends Error {}

/**
 * Every staff-management Server Action must call this itself — the /staff
 * layout only gates page rendering, and Server Actions are POST endpoints
 * that a route/layout guard does not protect on its own.
 */
export async function requireAdmin() {
  const { user, profile } = await getAuthState();
  if (!user || !profile || (profile.role !== 'ceo' && profile.role !== 'admin_manager')) {
    throw new ForbiddenError('Admin access required');
  }
  return { user, profile };
}

/** For the handful of actions reserved to the CEO alone — managing an Admin
 * account itself, not day-to-day operations (those use requireAdmin). */
export async function requireCeo() {
  const { user, profile } = await getAuthState();
  if (!user || !profile || profile.role !== 'ceo') {
    throw new ForbiddenError('CEO access required');
  }
  return { user, profile };
}
