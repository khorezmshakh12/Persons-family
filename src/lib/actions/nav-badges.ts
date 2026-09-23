'use server';

import { getAuthState } from '@/lib/auth/session';
import { computeNavBadgeKeys } from '@/lib/nav-badges';
import type { NavItem } from '@/lib/nav';

export async function getNavBadgesAction(): Promise<NavItem['key'][]> {
  // getAuthState, not the raw cookie check: enforces is_active + revocation.
  const { user } = await getAuthState();
  if (!user) return [];
  return computeNavBadgeKeys(user.uid);
}
