import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
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
  const supabase = await createClient();

  let query = supabase
    .from('groups')
    .select(
      'id, name, course_name, schedule_type, teacher:profiles!groups_teacher_id_fkey(first_name, last_name)',
    )
    .order('created_at', { ascending: false });

  if (isTeacher) {
    query = query.eq('teacher_id', profile!.id);
  } else if (profile!.role === 'assistant') {
    // TAs now only see the groups they're specifically assigned to, not
    // every group in the company (a deliberate narrowing from the earlier
    // broad-visibility precedent — see the assigned_ta migration).
    query = query.eq('assigned_ta_id', profile!.id);
  }

  if (days === 'odd' || days === 'even') query = query.eq('schedule_type', days);
  if (!isTeacher && teacherId) query = query.eq('teacher_id', teacherId);

  const { data } = await query;
  const groups = (data as unknown as GroupCardData[]) ?? [];

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
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
