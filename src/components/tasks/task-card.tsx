import { getFormatter, getTranslations } from 'next-intl/server';
import { TaskStatusControl, type TaskStatus } from './task-status-control';
import { EditTaskDialog } from './edit-task-dialog';
import { DeleteTaskButton } from './delete-task-button';
import type { Assignee } from './assign-task-dialog';

export type Task = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  due_date: string | null;
  status: TaskStatus;
  assignee: { first_name: string; last_name: string } | null;
};

export async function TaskCard({
  task,
  isAdmin,
  assignees,
}: {
  task: Task;
  isAdmin: boolean;
  assignees: Assignee[];
}) {
  const t = await getTranslations('tasks');
  const format = await getFormatter();

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{task.title}</span>
        {isAdmin && (
          <div className="flex shrink-0 gap-1">
            <EditTaskDialog
              task={{
                id: task.id,
                title: task.title,
                description: task.description,
                assigned_to: task.assigned_to,
                due_date: task.due_date,
              }}
              assignees={assignees}
            />
            <DeleteTaskButton taskId={task.id} />
          </div>
        )}
      </div>
      {task.description && <p className="text-muted-foreground text-sm">{task.description}</p>}
      <div className="text-muted-foreground flex flex-col gap-1 text-xs">
        {isAdmin && task.assignee && (
          <span>
            {task.assignee.first_name} {task.assignee.last_name}
          </span>
        )}
        <span>
          {task.due_date
            ? format.dateTime(new Date(`${task.due_date}T00:00:00Z`), {
                dateStyle: 'medium',
                timeZone: 'UTC',
              })
            : t('noDueDate')}
        </span>
      </div>
      <TaskStatusControl taskId={task.id} status={task.status} />
    </div>
  );
}
