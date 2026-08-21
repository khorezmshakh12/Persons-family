import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { GroupCard, type GroupCardData } from '@/components/lesson-plans/group-card';

const MAX_GROUPS_PER_TEACHER = 50;

export async function GroupsGrid({
  days,
  teacherId,
}: {
  /** 'odd' | 'even' | undefined (no filter). */
  days?: string;
  /** Ignored for a teacher viewer — their own groups are already the only
   * ones they can see, so filtering by teacher would be a no-op at best. */
  teacherId?: string;
}) {
  const t = await getTranslations('lessonPlans');
  const { profile } = await getAuthState();
  const isTeacher = profile!.role === 'teacher';
  const isAssistant = profile!.role === 'assistant';
  const dayFilter = days === 'odd' || days === 'even' ? days : null;
  const teacherFilter = !isTeacher && teacherId ? teacherId : null;

  const rows = await sql<
    { id: string; name: string; course_name: string | null; schedule_type: string | null; teacher_first_name: string; teacher_last_name: string }[]
  >`
    select g.id, g.name, g.course_name, g.schedule_type,
      t.first_name as teacher_first_name, t.last_name as teacher_last_name
    from groups g
    join profiles t on t.id = g.teacher_id
    where (${isTeacher} = false or g.teacher_id = ${profile!.id})
      -- TAs now only see the groups they're specifically assigned to, not
      -- every group in the company (a deliberate narrowing from the earlier
      -- broad-visibility precedent — see the assigned_ta migration).
      and (${isAssistant} = false or g.assigned_ta_id = ${profile!.id})
      and (${dayFilter}::text is null or g.schedule_type = ${dayFilter})
      and (${teacherFilter}::uuid is null or g.teacher_id = ${teacherFilter})
    order by g.created_at desc
  `;

  const groups: GroupCardData[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    course_name: r.course_name,
    schedule_type: r.schedule_type,
    teacher: { first_name: r.teacher_first_name, last_name: r.teacher_last_name },
  })) as unknown as GroupCardData[];

  return (
    <div className="flex flex-col gap-3">
      {isTeacher && (
        <p className="text-sm text-white/60">
          {t('groupsUsed', { count: groups.length, max: MAX_GROUPS_PER_TEACHER })}
        </p>
      )}
      {groups.length === 0 ? (
        <p className="text-sm text-white/70">{t('noGroups')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group, index) => (
            <GroupCard key={group.id} group={group} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
