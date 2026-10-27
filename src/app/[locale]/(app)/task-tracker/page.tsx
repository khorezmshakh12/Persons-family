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

export const dynamic = 'force-dynamic';

export default async function TaskTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; manage?: string }>;
}) {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'taskTracker')) notFound();

  const canManage = can(profile.role, 'checklist.manage');
  const sp = await searchParams;
  const requested = canManage && sp.role && (ROLES as readonly string[]).includes(sp.role) ? sp.role : null;
  const effectiveRole = requested ?? profile.role;
  const managing = canManage && sp.manage === '1';

  // Ustozlar uchun: bugun dars bo'lmasa kunlik checklist talab qilinmaydi.
  const gateTeacher = !managing && isTeacherRole(effectiveRole);
  // Statistika har doim foydalanuvchining O'Z roli bo'yicha (boshqa rolni
  // ko'rib turganda ham) — jamoa jadvali faqat CEO/COO uchun.
  const [data, tRoles, lessonToday, board, teamRows] = await Promise.all([
    loadChecklist(profile.id, effectiveRole),
    getTranslations('staff.roles'),
    gateTeacher ? teacherHasLessonOn(profile.id, tashkentDayKey()) : Promise.resolve(true),
    loadProgressBoard(profile.id, profile.role),
    canManage ? loadTeamChecklistStats() : Promise.resolve([]),
  ]);

  const dailyLocked = gateTeacher && !lessonToday;
  const finalData = dailyLocked ? { ...data, daily: [] } : data;

  const roleLabelOf = (r: string) => ((ROLES as readonly string[]).includes(r) ? tRoles(r) : r);
  const roles = canManage ? ROLES.map((r) => ({ value: r, label: roleLabelOf(r) })) : [];

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 pt-1 pb-8 sm:px-7">
      <ProgressBoard data={board} roleLabel={roleLabelOf(profile.role)} />
      <ChecklistPage
        data={finalData}
        role={effectiveRole}
        roleLabel={roleLabelOf(effectiveRole)}
        canManage={canManage}
        managing={managing}
        roles={roles}
        dailyLocked={dailyLocked}
      />
      {canManage && <TeamChecklistTable rows={teamRows} />}
    </div>
  );
}
