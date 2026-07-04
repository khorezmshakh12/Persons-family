import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { CreateLessonPlanDialog } from '@/components/lesson-plans/create-lesson-plan-dialog';
import { LessonPlansTable } from '@/components/lesson-plans/lesson-plans-table';

export const dynamic = 'force-dynamic';

export default async function LessonPlansPage() {
  const t = await getTranslations('lessonPlans');
  const { user, profile } = await getAuthState();
  const supabase = await createClient();
  const isTeacher = profile!.role === 'teacher';
  const canSeeAll =
    profile!.role === 'assistant' || profile!.role === 'ceo' || profile!.role === 'admin_manager';

  let query = supabase
    .from('lesson_plans')
    .select(
      'id, topic, plan_date, file_url, file_name, teacher:profiles!lesson_plans_teacher_id_fkey(first_name, last_name)',
    )
    .order('plan_date', { ascending: false });

  if (isTeacher) query = query.eq('teacher_id', user!.id);

  const { data } = await query;

  const plans = await Promise.all(
    (data ?? []).map(async (plan) => {
      let downloadUrl: string | null = null;
      if (plan.file_url) {
        const { data: signed } = await supabase.storage
          .from('lesson-files')
          .createSignedUrl(plan.file_url, 3600);
        downloadUrl = signed?.signedUrl ?? null;
      }
      return { ...plan, downloadUrl };
    }),
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        {isTeacher && <CreateLessonPlanDialog />}
      </div>
      <LessonPlansTable
        plans={plans as never}
        showTeacherColumn={canSeeAll}
        showActions={isTeacher}
      />
    </div>
  );
}
