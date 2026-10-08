import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { getMonthlyTaskArchiveAction, getVisibleTasksAction } from '@/lib/actions/tasks';
import { getTaskStatsAction } from '@/lib/actions/task-stats';
import { allowedTaskAssigneeRoles, canAssignTasks } from '@/lib/task-roles';
import { AssignTaskDialog } from '@/components/tasks/assign-task-dialog';
import { TaskBoard } from '@/components/tasks/task-board';
import { TaskStats } from '@/components/tasks/task-stats';
import { MarkTasksSeen } from '@/components/tasks/mark-tasks-seen';
import { BgVideo } from '@/components/motion/bg-video';
import { RecurringTasks, type Recurrence } from '@/components/tasks/recurring-tasks';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const t = await getTranslations('tasks');
  const { user, profile } = await getAuthState();
  // Calendar and Core platform views removed (owner, 2026-10-04): the board is the one view.
  // Assign/Edit/Delete controls for anyone who leads a team (same rule as
  // requireTaskAssigner() in tasks.ts); the dropdown lists only their people.
  const isAdmin = canAssignTasks(profile!.role);

  // The board itself only carries active tasks plus the ones completed this
  // Tashkent month (see getVisibleTasksAction) — everything finished before
  // that is reachable through the monthly archive under the board.
  // Unlike the Issues page's CEO-only stats panel, the task stats are
  // per-employee and shown to everyone: getTaskStatsAction scopes every
  // query to `assigned_to = <caller>`, so each person only ever sees their
  // own numbers and there is nothing here to role-gate.
  const [taskRows, archive, assignees, taskStats] = await Promise.all([
    getVisibleTasksAction(),
    getMonthlyTaskArchiveAction(),
    sql<{ id: string; first_name: string; last_name: string }[]>`
      select id, first_name, last_name from profiles
      where role in ${sql(isAdmin ? allowedTaskAssigneeRoles(profile!.role) : ['teacher', 'assistant'])}
        and is_active = true
      order by first_name asc
    `,
    getTaskStatsAction(),
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
      // Fed through for TaskStageActions/TaskAttachmentsDrawer — the review
      // workflow's controls, same as the two fields below.
      attachment_count: row.attachment_count ?? 0,
      requires_proof: row.requires_proof,
      from_strategy: row.from_strategy ?? false,
      rejection_reason: row.rejection_reason,
      completed_at: row.completed_at,
      submitted_at: row.submitted_at,
      created_at: row.created_at,
      star_reward: row.star_reward ?? 0,
      // Deducted from the assignee when the task is completed after its
      // deadline (see updateTaskStatusAction).
      star_penalty: row.star_penalty ?? 0,
      assignee: assignee ? { first_name: assignee.first_name, last_name: assignee.last_name } : null,
    };
  });

  // The assigner's active recurring tasks (the CEO sees all of them).
  const recurrences = isAdmin
    ? await sql<Recurrence[]>`
        select r.id, r.title, r.every, r.due_time, r.last_due::text as last_due,
          concat(p.first_name, ' ', p.last_name) as assignee
        from task_recurrences r join profiles p on p.id = r.assigned_to
        where r.active and (${profile!.role === 'ceo'} or r.assigned_by = ${user!.id})
        order by r.created_at desc`.catch(() => [])
    : [];

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 pt-1 pb-8 sm:px-7">
      <MarkTasksSeen />
      <header className="relative flex flex-wrap items-end justify-between gap-4 overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px]">
        <BgVideo variant="hero" />
        <div className="relative z-10 min-w-0">
          <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-au-muted">{t('subtitle')}</p>
        </div>
        {isAdmin && (
          <div className="relative z-10">
            <AssignTaskDialog assignees={assignees} />
          </div>
        )}
      </header>
      <RecurringTasks items={recurrences} />
      {/* Statistics moved into the board's "Hisobot" view so the work itself
          sits above the fold. */}
      <TaskBoard
        tasks={tasks}
        isAdmin={isAdmin}
        assignees={assignees}
        currentUserId={user!.id}
        archive={archive}
        report={<TaskStats stats={taskStats.data ?? null} />}
      />
    </div>
  );
}
