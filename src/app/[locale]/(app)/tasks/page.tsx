import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { getMonthlyTaskArchiveAction, getVisibleTasksAction } from '@/lib/actions/tasks';
import { allowedTaskAssigneeRoles } from '@/lib/task-roles';
import { AssignTaskDialog } from '@/components/tasks/assign-task-dialog';
import { TaskBoard } from '@/components/tasks/task-board';
import { MarkTasksSeen } from '@/components/tasks/mark-tasks-seen';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const t = await getTranslations('tasks');
  const { user, profile } = await getAuthState();
  // CEO-only: assigning, editing, and deleting tasks is a CEO power alone
  // (requireTaskAssigner() in tasks.ts already enforces this) — IT Developer
  // lost it entirely, so this must not fall back to is_admin()'s ceo+it_developer
  // definition or the board shows Assign/Edit/Delete controls to IT Developer
  // that every submit then rejects as forbidden.
  const isAdmin = profile!.role === 'ceo';

  // The board itself only carries active tasks plus the ones completed this
  // Tashkent month (see getVisibleTasksAction) — everything finished before
  // that is reachable through the monthly archive under the board.
  const [taskRows, archive, assignees] = await Promise.all([
    getVisibleTasksAction(),
    getMonthlyTaskArchiveAction(),
    sql<{ id: string; first_name: string; last_name: string }[]>`
      select id, first_name, last_name from profiles
      where role in ${sql(isAdmin ? allowedTaskAssigneeRoles(profile!.role) : ['teacher', 'assistant'])}
        and is_active = true
      order by first_name asc
    `,
  ]);

  // Mirrors TaskBoard's own toTask() derivation exactly — this is just the
  // initial server-rendered snapshot, TaskBoard re-derives the same shape
  // itself on every board_signals/tasks-triggered refresh.
  const tasks = taskRows.map((row) => {
    const assignee = assignees.find((a) => a.id === row.assigned_to);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      assigned_to: row.assigned_to,
      // Fed through for TaskCard's comment gate (assignee / assigner / CEO).
      assigned_by: row.assigned_by,
      deadline: row.deadline,
      status: row.status,
      is_overdue: row.is_overdue,
      comment_count: row.comment_count ?? 0,
      star_reward: row.star_reward ?? 0,
      // Deducted from the assignee when the task is completed after its
      // deadline (see updateTaskStatusAction).
      star_penalty: row.star_penalty ?? 0,
      // Board position within the status column — the list already arrives
      // ordered by it, this only rides along so an optimistic reorder has
      // something to reconcile against.
      sort_order: row.sort_order ?? 0,
      assignee: assignee ? { first_name: assignee.first_name, last_name: assignee.last_name } : null,
    };
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <MarkTasksSeen />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        {isAdmin && <AssignTaskDialog assignees={assignees} />}
      </div>
      <TaskBoard
        tasks={tasks}
        isAdmin={isAdmin}
        assignees={assignees}
        currentUserId={user!.id}
        archive={archive}
      />
    </div>
  );
}
