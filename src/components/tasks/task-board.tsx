import { getTranslations } from 'next-intl/server';
import { TaskCard, type Task } from './task-card';
import type { Assignee } from './assign-task-dialog';
import type { TaskStatus } from './task-status-control';

const COLUMNS: TaskStatus[] = ['pending', 'in_progress', 'done'];

export async function TaskBoard({
  tasks,
  isAdmin,
  assignees,
}: {
  tasks: Task[];
  isAdmin: boolean;
  assignees: Assignee[];
}) {
  const t = await getTranslations('tasks');

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((status) => {
        const columnTasks = tasks.filter((task) => task.status === status);
        return (
          <div key={status} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">
              {t(`columns.${status}`)} ({columnTasks.length})
            </h2>
            <div className="flex flex-col gap-3">
              {columnTasks.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('noTasks')}</p>
              ) : (
                columnTasks.map((task) => (
                  <TaskCard key={task.id} task={task} isAdmin={isAdmin} assignees={assignees} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
