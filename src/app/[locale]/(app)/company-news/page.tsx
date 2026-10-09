import { getAuthState } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
import { tashkentDayKey, addDaysToKey } from '@/lib/time';
import { loadCalendar, loadNewsFeed } from '@/lib/team-life-data';
import { NewsFeed } from '@/components/team-life/news-feed';
import { TeamCalendar } from '@/components/team-life/team-calendar';
import { MarkCompanyNewsSeen } from '@/components/company-news/mark-company-news-seen';
import { BgVideo } from '@/components/motion/bg-video';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Jamoa hayoti — company announcements and the team calendar (sections v6). */
export default async function CompanyNewsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { user, profile } = await getAuthState();
  const tab = (await searchParams).tab === 'calendar' ? 'calendar' : 'news';
  const isAdmin = can(profile!.role, 'news.publish');
  const today = tashkentDayKey();

  let body: React.ReactNode;
  if (tab === 'calendar') {
    const first = `${today.slice(0, 7)}-01`;
    const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
    const from = addDaysToKey(first, -dow);
    const events = await loadCalendar(profile!, from, addDaysToKey(from, 41));
    body = <TeamCalendar initial={events} today={today} canPublish={isAdmin} canAll={can(profile!.role, 'company.overview') || can(profile!.role, 'academic.viewAll')} />;
  } else {
    const { news, audience } = await loadNewsFeed(profile!, isAdmin);
    body = <NewsFeed initial={news} audience={audience} isAdmin={isAdmin} me={user!.id} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-5 px-4 pt-1 pb-8 sm:px-7">
      {tab === 'news' && <MarkCompanyNewsSeen />}
      <div className="relative flex flex-col gap-1 overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px] sm:py-7">
        <BgVideo variant="hero" />
        <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">Jamoa hayoti</h1>
        <p className="text-au-muted">E’lonlar, tadbirlar, muddatlar, ta’tillar va bayramlar — bir joyda.</p>
      </div>
      <nav className="inline-flex self-start rounded-au-ctl border border-au-line bg-au-card-2 p-1" aria-label="Jamoa hayoti">
        {(
          [
            ['news', 'E’lonlar', '/company-news'],
            ['calendar', 'Kalendar', '/company-news?tab=calendar'],
          ] as const
        ).map(([k, n, href]) => (
          <Link
            key={k}
            href={href}
            aria-current={tab === k ? 'page' : undefined}
            className={cn('inline-flex h-8 items-center rounded-[10px] px-4 text-sm font-semibold transition-colors', tab === k ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted hover:text-au-ink')}
          >
            {n}
          </Link>
        ))}
      </nav>
      {body}
    </div>
  );
}
