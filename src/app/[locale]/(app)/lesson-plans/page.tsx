import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { CreateGroupDialog } from '@/components/lesson-plans/create-group-dialog';
import { GroupCard, type GroupCardData } from '@/components/lesson-plans/group-card';

export const dynamic = 'force-dynamic';

const MAX_GROUPS_PER_TEACHER = 50;

export default async function LessonPlansPage() {
  const t = await getTranslations('lessonPlans');
  const { user, profile } = await getAuthState();
  const isTeacher = profile!.role === 'teacher';
  const supabase = await createClient();

  let query = supabase
    .from('groups')
    .select(
      'id, name, configuration, teacher:profiles!groups_teacher_id_fkey(first_name, last_name)',
    )
    .order('created_at', { ascending: false });

  if (isTeacher) query = query.eq('teacher_id', user!.id);

  const { data } = await query;
  const groups = (data as unknown as GroupCardData[]) ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          {isTeacher && (
            <p className="text-sm text-white/60">
              {t('groupsUsed', { count: groups.length, max: MAX_GROUPS_PER_TEACHER })}
            </p>
          )}
        </div>
        {isTeacher && <CreateGroupDialog />}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-white/70">{t('noGroups')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} showTeacher={!isTeacher} />
          ))}
        </div>
      )}
    </div>
  );
}
