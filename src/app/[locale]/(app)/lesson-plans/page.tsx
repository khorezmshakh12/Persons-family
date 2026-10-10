import { Suspense } from 'react';
// Aliased: this file also exports the route-segment config `dynamic` below.
import nextDynamic from 'next/dynamic';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { GroupsGrid } from '@/components/lesson-plans/groups-grid';
import { GroupFilters } from '@/components/lesson-plans/group-filters';
import { GlassGroupGridSkeleton } from '@/components/skeletons/glass-skeletons';
import { BgVideo } from '@/components/motion/bg-video';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { can } from '@/lib/permissions';
import { addDaysToKey, tashkentDayKey, tashkentDayOfWeek } from '@/lib/time';
import { loadDiscipline, loadLessonsBetween, type LessonScope } from '@/lib/lesson-week-data';
import { LessonWeek } from '@/components/lesson-plans/lesson-week';
import { LessonDiscipline, LessonReviewQueue } from '@/components/lesson-plans/lesson-review';

const CreateGroupDialog = nextDynamic(() =>
  import('@/components/lesson-plans/create-group-dialog').then((mod) => mod.CreateGroupDialog),
);

export const dynamic = 'force-dynamic';

export default async function LessonPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; teacher?: string; tab?: string; week?: string; day?: string }>;
}) {
  const { days, teacher, tab: tabParam, week, day } = await searchParams;
  const t = await getTranslations('lessonPlans');
  // Role gating for this whole section happens in lesson-plans/layout.tsx —
  // see its comment for why that redirect can't live here.
  const { profile } = await getAuthState();

  const isTeacher = profile!.role === 'teacher';
  const isAssistant = profile!.role === 'assistant';
  const viewAll = can(profile!.role, 'academic.viewAll');

  // Tabs by role: a teacher's desk is the week; reviewers get the queue and
  // the discipline grid; everyone keeps the group list.
  type Tab = 'week' | 'groups' | 'review' | 'discipline';
  const tabs: Tab[] = [
    ...(isTeacher || isAssistant ? (['week'] as Tab[]) : []),
    ...(viewAll ? (['review', 'discipline'] as Tab[]) : []),
    'groups',
  ];
  const tab: Tab = tabs.includes(tabParam as Tab) ? (tabParam as Tab) : tabs[0];
  const today = tashkentDayKey();
  const thisMonday = addDaysToKey(today, -((tashkentDayOfWeek() + 6) % 7));
  const weekStart = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : thisMonday;
  const scope: LessonScope = isTeacher
    ? { kind: 'teacher', id: profile!.id }
    : isAssistant
      ? { kind: 'ta', id: profile!.id }
      : { kind: 'all', teacherId: teacher ?? null };
  const reviewDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : addDaysToKey(today, 1);
  const disciplineDays = Array.from({ length: 14 }, (_, i) => addDaysToKey(today, i - 13)).filter((d) => {
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, dd)).getUTCDay() !== 0;
  });
  const [weekLessons, reviewLessons, discipline] = await Promise.all([
    tab === 'week' ? loadLessonsBetween(scope, weekStart, addDaysToKey(weekStart, 5)) : Promise.resolve([]),
    tab === 'review' ? loadLessonsBetween(scope, reviewDay, reviewDay) : Promise.resolve([]),
    tab === 'discipline' ? loadDiscipline(disciplineDays[0], today) : Promise.resolve([]),
  ]);

  let assistants: { id: string; first_name: string; last_name: string }[] = [];
  if (isTeacher) {
    assistants = await sql<{ id: string; first_name: string; last_name: string }[]>`
      select id, first_name, last_name from profiles
      where is_active = true
        and (role = 'assistant' or exists (select 1 from profile_roles r where r.user_id = profiles.id and r.role = 'assistant'))
      order by first_name asc
    `;
  }

  // The "filter by teacher" dropdown only makes sense for a viewer who can
  // see more than one teacher's groups in the first place.
  let teachers: { id: string; first_name: string; last_name: string }[] = [];
  if (!isTeacher) {
    teachers = await sql<{ id: string; first_name: string; last_name: string }[]>`
      select id, first_name, last_name from profiles
      where is_active = true
        and (role = 'teacher' or exists (select 1 from profile_roles r where r.user_id = profiles.id and r.role = 'teacher'))
      order by first_name asc
    `;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 pt-1 pb-8 sm:px-7">
      <header className="relative flex flex-wrap items-end justify-between gap-3 overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px]">
        <BgVideo variant="hero" />
        <div className="relative z-10">
          <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-au-muted">{t('v2.subtitle')}</p>
        </div>
        {isTeacher && (
          <div className="relative z-10">
            <CreateGroupDialog assistants={assistants} />
          </div>
        )}
      </header>

      {tabs.length > 1 && (
        <nav aria-label={t('v2.tabsLabel')} className="inline-flex w-fit rounded-au-ctl border border-au-line bg-au-card-2 p-1">
          {tabs.map((k) => (
            <Link
              key={k}
              href={`?tab=${k}`}
              aria-current={k === tab ? 'page' : undefined}
              className={cn('inline-flex h-8 items-center rounded-[8px] px-3.5 text-sm font-semibold transition-colors', k === tab ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted hover:text-au-ink')}
            >
              {t(`v2.tabs.${k}`)}
            </Link>
          ))}
        </nav>
      )}

      {tab === 'week' && <LessonWeek lessons={weekLessons} weekStart={weekStart} today={today} canEdit={isTeacher} showTeacher={!isTeacher} />}
      {tab === 'review' && <LessonReviewQueue key={reviewDay} lessons={reviewLessons} day={reviewDay} today={today} />}
      {tab === 'discipline' && <LessonDiscipline rows={discipline} days={disciplineDays} />}
      {tab === 'groups' && (
        <>
          <GroupFilters teachers={teachers} />
          <Suspense fallback={<GlassGroupGridSkeleton />}>
            <GroupsGrid days={days} teacherId={teacher} />
          </Suspense>
        </>
      )}
    </div>
  );
}
