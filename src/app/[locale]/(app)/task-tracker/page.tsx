import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { canSeeFor, can, ROLES } from '@/lib/permissions';
import { loadChecklist } from '@/lib/checklist-data';
import { loadTeamChecklistStats } from '@/lib/checklist-stats';
import { loadProgressBoard } from '@/lib/progress-board-data';
import { isTeacherRole, teacherHasLessonOn } from '@/lib/teacher-schedule';
import { tashkentDayKey } from '@/lib/time';
import { ChecklistPage } from '@/components/checklist/checklist-page';
import { ProgressBoard } from '@/components/checklist/progress-board';
import { TeamChecklistTable } from '@/components/checklist/team-checklist-table';
import { ChecklistTabs, type ChecklistTab } from '@/components/checklist/checklist-tabs';

export const dynamic = 'force-dynamic';

export default async function TaskTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; manage?: string; tab?: string; date?: string }>;
}) {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'taskTracker')) notFound();

  const canManage = can(profile.role, 'checklist.manage');
  const sp = await searchParams;
  // Tablar: CEO/COO'ga Jamoa statistikasi va Boshqarish ham ko'rinadi.
  // Eski ?manage=1 havolalari Boshqarish tabiga tushadi.
  const tabs: ChecklistTab[] = canManage ? ['mine', 'team', 'manage', 'progress'] : ['mine', 'progress'];
  const asked = (sp.tab ?? (sp.manage === '1' ? 'manage' : 'mine')) as ChecklistTab;
  const tab: ChecklistTab = tabs.includes(asked) ? asked : 'mine';
  const managing = tab === 'manage';
  // Boshqa rol faqat Boshqarish tabida tanlanadi; "Mening checklistim" doim o'z roli.
  const requested = managing && sp.role && (ROLES as readonly string[]).includes(sp.role) ? sp.role : null;
  const effectiveRole = requested ?? profile.role;
  // Jamoa tabi: istalgan o'tgan sana (?date=YYYY-MM-DD), kelajak emas.
  const today = tashkentDayKey();
  const teamDay = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;

  // Ustozlar uchun: bugun dars bo'lmasa kunlik checklist talab qilinmaydi.
  const gateTeacher = !managing && isTeacherRole(effectiveRole);
  // Faqat ochiq tab ma'lumoti yuklanadi.
  const [data, tRoles, lessonToday, board, teamRows] = await Promise.all([
    tab === 'mine' || managing ? loadChecklist(profile.id, effectiveRole) : Promise.resolve(null),
    getTranslations('staff.roles'),
    gateTeacher && tab === 'mine' ? teacherHasLessonOn(profile.id, tashkentDayKey()) : Promise.resolve(true),
    tab === 'progress' ? loadProgressBoard(profile.id, profile.role) : Promise.resolve(null),
    tab === 'team' ? loadTeamChecklistStats(teamDay) : Promise.resolve([]),
  ]);

  const dailyLocked = gateTeacher && !lessonToday;
  const finalData = data && dailyLocked ? { ...data, daily: [] } : data;

  const roleLabelOf = (r: string) => ((ROLES as readonly string[]).includes(r) ? tRoles(r) : r);
  const roles = canManage ? ROLES.map((r) => ({ value: r, label: roleLabelOf(r) })) : [];
  const roleLabels = Object.fromEntries(ROLES.map((r) => [r, roleLabelOf(r)]));
  const [year, month, day] = teamDay.split('-').map(Number);
  const periodLabel = `${day}-${MONTHS_UZ[month - 1]}, ${year}`;

  const checklist = finalData && (
    <ChecklistPage
      data={finalData}
      role={effectiveRole}
      roleLabel={roleLabelOf(effectiveRole)}
      canManage={canManage}
      managing={managing}
      roles={roles}
      dailyLocked={dailyLocked}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 pt-1 pb-8 sm:px-7">
      <ChecklistTabs
        value={tab}
        tabs={tabs}
        panels={{
          mine: tab === 'mine' ? checklist : null,
          manage: managing ? checklist : null,
          team: tab === 'team' ? <TeamChecklistTable rows={teamRows} roleLabels={roleLabels} periodLabel={periodLabel} day={teamDay} today={today} /> : null,
          progress: board && <ProgressBoard data={board} roleLabel={roleLabelOf(profile.role)} />,
        }}
      />
    </div>
  );
}

const MONTHS_UZ = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
