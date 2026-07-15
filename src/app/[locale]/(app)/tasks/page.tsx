import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { allowedTaskAssigneeRoles } from '@/lib/task-roles';
import { AssignTaskDialog } from '@/components/tasks/assign-task-dialog';
import { TaskBoard } from '@/components/tasks/task-board';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const t = await getTranslations('tasks');
  const { user, profile } = await getAuthState();
  const supabase = await createClient();
  const isAdmin = profile!.role === 'ceo' || profile!.role === 'admin_manager';

  // Strict visibility: a task is only ever fetched for its creator
  // (assigned_by) or its assignee (assigned_to) — RLS's tasks_select
  // enforces this too, but filtering explicitly here keeps the query
  // itself honest about what it's allowed to return.
  const { data: tasksData } = await supabase
    .from('tasks')
    .select(
      'id, title, description, assigned_to, assigned_by, due_date, status, updated_at, assignee:profiles!tasks_assigned_to_fkey(first_name, last_name)',
    )
    .or(`assigned_by.eq.${user!.id},assigned_to.eq.${user!.id}`)
    .order('created_at', { ascending: false });

  // Auto-hide (not delete): a "done" task older than a week just clutters
  // the board — the row itself is left alone, same precedent as the Issues
  // board's own resolved_at cutoff.
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const tasks = (tasksData ?? []).filter((task) => {
    if (task.status !== 'done') return true;
    return Date.now() - new Date(task.updated_at).getTime() < SEVEN_DAYS_MS;
  });

  const { data: assignees } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('role', isAdmin ? allowedTaskAssigneeRoles(profile!.role) : ['teacher', 'assistant'])
    .eq('is_active', true)
    .order('first_name', { ascending: true });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{t('title')}</h1>
        {isAdmin && <AssignTaskDialog assignees={assignees ?? []} />}
      </div>
      <TaskBoard tasks={tasks as never} isAdmin={isAdmin} assignees={assignees ?? []} />
    </div>
  );
}
