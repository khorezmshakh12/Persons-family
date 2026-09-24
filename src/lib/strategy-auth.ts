import 'server-only';
import { getAuthState } from '@/lib/auth/session';
import { ForbiddenError, SessionExpiredError } from '@/lib/auth/require-admin';
import { STRATEGY_ROLES } from '@/lib/nav';

/** CEO / IT Developer / Project Manager (STRATEGY_ROLES). Every Strategy,
 * Hisob-kitob, Operatsiya and Perforce Server Action calls this itself —
 * the page guard only gates rendering. */
export async function requireStrategyEditor() {
  const { user, profile } = await getAuthState();
  if (!user) throw new SessionExpiredError('No session');
  if (!profile || !STRATEGY_ROLES.includes(profile.role)) {
    throw new ForbiddenError('Strategy access required');
  }
  return { user, profile };
}
