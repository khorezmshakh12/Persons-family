'use server';

import { getCurrentUser } from '@/lib/gcp/session';
import { computeNavBadgeKeys } from '@/lib/nav-badges';
import type { NavItem } from '@/lib/nav';

export async function getNavBadgesAction(): Promise<NavItem['key'][]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return computeNavBadgeKeys(user.uid);
}
