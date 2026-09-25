import 'server-only';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import type { StrategyPerson } from '@/lib/strategy';

/** profiles.avatar_url is a storage path, not a URL — sign each distinct one
 * (same as the dashboard does) so <img> can load it. */
export async function withSignedAvatars(people: StrategyPerson[]): Promise<StrategyPerson[]> {
  const paths = [...new Set(people.map((p) => p.avatar_url).filter((x): x is string => !!x))];
  const signed = new Map(await Promise.all(paths.map(async (p) => [p, await resolveAvatarUrl(p)] as const)));
  return people.map((p) => ({ ...p, avatar_url: p.avatar_url ? (signed.get(p.avatar_url) ?? null) : null }));
}
