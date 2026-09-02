import { getTranslations } from 'next-intl/server';
import { Star } from 'lucide-react';
import { sql } from '@/lib/db/client';
import { getStarBalances } from '@/lib/stars';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

const MAX_ROWS = 15;

// Gold / silver / bronze for the podium, a flat neutral chip for everyone
// else — deliberately subtle so the row highlight for "you" stays the
// loudest thing on the card.
const MEDAL_CLASS = [
  'bg-amber-300/25 text-amber-100 ring-1 ring-amber-200/50',
  'bg-slate-100/25 text-white ring-1 ring-white/40',
  'bg-orange-400/25 text-orange-100 ring-1 ring-orange-300/50',
];
const DEFAULT_RANK_CLASS = 'bg-white/10 text-white/70 ring-1 ring-white/15';

type LeaderboardEntry = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  stars: number;
};

/**
 * Balances are never a column — they're `sum(star_transactions.delta)`, so
 * the sum comes from `getStarBalances` rather than being re-derived with a
 * join here (a second copy of that sum is exactly how a Market refund or a
 * CEO deduction ends up counted differently on two screens).
 */
async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const profiles = await sql<
      { id: string; first_name: string; last_name: string; avatar_url: string | null }[]
    >`
      select id, first_name, last_name, avatar_url from profiles
      where is_active = true
      order by first_name asc
    `;
    if (profiles.length === 0) return [];

    const balances = await getStarBalances(profiles.map((p) => p.id));

    const ranked = profiles
      .map((p) => ({ profile: p, stars: balances[p.id] ?? 0 }))
      // profiles already arrive first_name-ascending, so a stable sort on
      // stars alone gives "stars desc, first_name asc".
      .sort((a, b) => b.stars - a.stars)
      .slice(0, MAX_ROWS);

    // One signed URL per distinct object path — signing is a network call,
    // so don't repeat it for a path two rows happen to share.
    const paths = [...new Set(ranked.map((r) => r.profile.avatar_url).filter((p) => p !== null))];
    const signed = new Map(
      await Promise.all(paths.map(async (p) => [p, await resolveAvatarUrl(p)] as const)),
    );

    return ranked.map(({ profile, stars }) => ({
      id: profile.id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      avatarUrl: profile.avatar_url ? (signed.get(profile.avatar_url) ?? null) : null,
      stars,
    }));
  } catch (error) {
    // A dashboard card must never take the whole grid down — fall through
    // to the empty state the same way a genuinely empty board would.
    console.error('StarLeaderboard query failed', error);
    return [];
  }
}

export async function StarLeaderboard({
  currentUserId,
  delayMs = 0,
}: {
  currentUserId: string;
  delayMs?: number;
}) {
  const t = await getTranslations('dashboard.starLeaderboard');
  const entries = await loadLeaderboard();
  const hasStars = entries.some((e) => e.stars > 0);

  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-4 p-6')}
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('title')}
        </h2>
        <p className="text-xs text-white/60">{t('subtitle')}</p>
      </div>

      {!hasStars ? (
        <p className="text-sm text-white/70">{t('noStars')}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {entries.map((entry, i) => {
            const isCurrentUser = entry.id === currentUserId;
            return (
              <li
                key={entry.id}
                style={{ animationDelay: `${delayMs + 150 + i * 40}ms` }}
                className={cn(
                  'animate-fade-in-up flex items-center gap-3 rounded-xl px-2 py-1.5',
                  isCurrentUser && 'bg-white/15 ring-1 ring-white/30',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                    MEDAL_CLASS[i] ?? DEFAULT_RANK_CLASS,
                  )}
                >
                  {i + 1}
                </span>
                <Avatar className="size-8 shrink-0">
                  <AvatarImage src={entry.avatarUrl ?? undefined} alt="" />
                  <AvatarFallback>
                    {entry.firstName[0]}
                    {entry.lastName[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
                  {entry.firstName} {entry.lastName}
                  {isCurrentUser && <span className="ml-1.5 text-xs text-white/70">({t('you')})</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-white tabular-nums [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
                  <Star className="size-3.5 fill-amber-300 text-amber-300" aria-hidden />
                  <span className="sr-only">{t('starCount', { count: entry.stars })}</span>
                  <span aria-hidden>{entry.stars}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
