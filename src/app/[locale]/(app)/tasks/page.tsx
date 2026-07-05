import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { AssignTaskDialog } from '@/components/tasks/assign-task-dialog';
import { TaskBoard } from '@/components/tasks/task-board';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const t = await getTranslations('tasks');
  const { profile } = await getAuthState();
  const supabase = await createClient();
  const isAdmin = profile!.role === 'ceo' || profile!.role === 'admin_manager';

  const { data: tasks } = await supabase
    .from('tasks')
    .select(
      'id, title, description, assigned_to, due_date, status, assignee:profiles!tasks_assigned_to_fkey(first_name, last_name)',
    )
    .order('created_at', { ascending: false });

  const { data: assignees } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('role', ['teacher', 'assistant'])
    .eq('is_active', true)
    .order('first_name', { ascending: true });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        {isAdmin && <AssignTaskDialog assignees={assignees ?? []} />}
      </div>
      <TaskBoard tasks={(tasks as never) ?? []} isAdmin={isAdmin} assignees={assignees ?? []} />
    </div>
  );
}
