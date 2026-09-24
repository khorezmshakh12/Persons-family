'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Crown, Trophy } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarGradientClass, initialsOf } from '@/lib/avatar-palette';
import { CARD_TITLE, SURFACE_CARD, SURFACE_INSET } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { LeaderboardPerson } from '@/lib/aurora-dashboard';

type Mode = 'week' | 'month' | 'total';

type Ranked = LeaderboardPerson & { score: number; rank: number; trend: number };

function rankBy(people: LeaderboardPerson[], score: (p: LeaderboardPerson) => number): Map<string, number> {
  // Ties keep the incoming (first-name) order, same as the classic board.
  const sorted = [...people].sort((a, b) => score(b) - score(a));
  return new Map(sorted.map((p, i) => [p.id, i + 1]));
}

function PersonAvatar({ person, size }: { person: LeaderboardPerson; size: 'xl' | 'lg' | 'md' | 'sm' }) {
  const [first, ...rest] = person.name.split(' ');
  const dims = { xl: 'size-16 text-xl', lg: 'size-[52px] text-base', md: 'size-[34px] text-xs', sm: 'size-[30px] text-[11px]' }[
    size
  ];
  return (
    <Avatar className={cn(dims, 'after:hidden')}>
      <AvatarImage src={person.avatarUrl ?? undefined} alt="" />
      <AvatarFallback className={cn('font-bold text-white', dims, avatarGradientClass(person.id))}>
        {initialsOf(first, rest.join(' '))}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Star leaderboard: podium for the top three, rows for 4–6 with a rank
 * trend (vs the previous period), and a "you are #N" footer.
 */
export function Leaderboard({
  people,
  currentUserId,
  className,
}: {
  people: LeaderboardPerson[] | null;
  currentUserId: string;
  className?: string;
}) {
  const t = useTranslations('aurora');
  const [mode, setMode] = useState<Mode>('month');

  const ranked: Ranked[] = useMemo(() => {
    if (!people) return [];
    const now = { week: (p: LeaderboardPerson) => p.week, month: (p: LeaderboardPerson) => p.month, total: (p: LeaderboardPerson) => p.total }[mode];
    const prev = {
      week: (p: LeaderboardPerson) => p.prevWeek,
      month: (p: LeaderboardPerson) => p.prevMonth,
      total: (p: LeaderboardPerson) => p.totalAtWeekStart,
    }[mode];
    const nowRank = rankBy(people, now);
    const prevRank = rankBy(people, prev);
    return people
      .map((p) => ({ ...p, score: now(p), rank: nowRank.get(p.id)!, trend: prevRank.get(p.id)! - nowRank.get(p.id)! }))
      .sort((a, b) => a.rank - b.rank);
  }, [people, mode]);

  const podium = [ranked[1], ranked[0], ranked[2]];
  const rows = ranked.slice(3, 6);
  const me = ranked.find((p) => p.id === currentUserId);
  const above = me && me.rank > 1 ? ranked[me.rank - 2] : null;
  const hasAny = ranked.some((p) => p.score !== 0);

  const modes: { key: Mode; label: string }[] = [
    { key: 'week', label: t('week') },
    { key: 'month', label: t('month') },
    { key: 'total', label: t('allTime') },
  ];

  return (
    <section className={cn(SURFACE_CARD, 'au-highlight flex flex-col p-5', className)}>
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <h2 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
          <Trophy className="size-[17px]" strokeWidth={1.75} aria-hidden />
          {t('leaderboard')}
        </h2>
        <div role="tablist" className="inline-flex gap-0.5 rounded-[9px] border border-au-line bg-au-card-2 p-[3px]">
          {modes.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={mode === m.key}
              onClick={() => setMode(m.key)}
              className={cn(
                'rounded-md px-2.5 py-[3px] text-xs font-semibold transition-colors duration-150',
                mode === m.key ? 'bg-au-card text-au-ink shadow-sm' : 'text-au-muted hover:text-au-ink',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {!people || ranked.length === 0 || !hasAny ? (
        <p className="py-12 text-center text-sm text-au-muted">{t('noStars')}</p>
      ) : (
        <>
          <div className="mt-1.5 mb-4 flex items-end justify-center gap-3">
            {podium.map((p, i) => {
              if (!p) return <div key={i} className="w-24" />;
              const first = p.rank === 1;
              const stepHeight = first ? 104 : p.rank === 2 ? 70 : 52;
              return (
                <Link key={p.id} href={`/profile/${p.id}`} className="flex w-24 min-w-0 flex-col items-center">
                  {first && <Crown className="mb-1 size-[17px] text-au-accent-text" strokeWidth={1.75} aria-hidden />}
                  <div className={cn('rounded-full', first && 'ring-2 ring-au-accent ring-offset-[3px] ring-offset-au-card')}>
                    <PersonAvatar person={p} size={first ? 'xl' : 'lg'} />
                  </div>
                  <span className="mt-2 max-w-full truncate text-[13px] font-semibold text-au-ink">{p.shortName}</span>
                  <span className="text-xs font-bold text-au-accent-text tabular-nums">{p.score} ★</span>
                  <div
                    className={cn(
                      'mt-2.5 grid w-full place-items-center rounded-[12px_12px_4px_4px] text-[22px] font-bold tabular-nums',
                      first
                        ? 'bg-au-podium text-au-accent-ink shadow-[var(--au-shadow-pop)]'
                        : 'border border-au-line bg-au-card-2 text-au-muted',
                    )}
                    style={{ height: stepHeight }}
                  >
                    {p.rank}
                  </div>
                </Link>
              );
            })}
          </div>

          <ul className="flex flex-col">
            {rows.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/profile/${p.id}`}
                  className={cn(
                    'flex items-center gap-2.5 border-t border-au-line px-1 py-2.5 text-sm transition-colors hover:bg-au-card-2',
                    p.id === currentUserId && 'bg-au-accent-soft',
                  )}
                >
                  <span className="w-[18px] text-xs font-bold text-au-muted tabular-nums">{p.rank}</span>
                  <PersonAvatar person={p} size="md" />
                  <span className="min-w-0 flex-1 truncate font-medium text-au-ink">{p.name}</span>
                  {p.trend !== 0 && (
                    <span className={cn('text-xs font-semibold tabular-nums', p.trend > 0 ? 'text-au-ok' : 'text-au-bad')}>
                      {p.trend > 0 ? '▲' : '▼'} {Math.abs(p.trend)}
                    </span>
                  )}
                  <span className="w-[52px] text-right font-bold text-au-ink tabular-nums">{p.score}</span>
                </Link>
              </li>
            ))}
          </ul>

          {me && (
            <div className={cn(SURFACE_INSET, 'mt-auto flex items-center gap-3 rounded-[12px] p-3.5')}>
              <PersonAvatar person={me} size="sm" />
              <div className="min-w-0">
                <b className="block text-[13px] text-au-ink tabular-nums">
                  {t('youRank', { rank: me.rank, stars: me.score })}
                </b>
                <span className="block truncate text-xs text-au-muted">
                  {above
                    ? t('toNext', { rank: above.rank, gap: Math.max(1, above.score - me.score) })
                    : t('youLead')}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
