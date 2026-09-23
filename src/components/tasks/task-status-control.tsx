'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { TaskStatus } from '@/lib/task-status';

// Re-exported so the dozens of `import type { TaskStatus } from
// './task-status-control'` call sites keep working; the definition itself
// now lives in lib/task-status.ts, which the Server Actions and the crons
// import too (a 'use client' module can't be their source of truth).
export type { TaskStatus };

const BADGE_TINT: Record<TaskStatus, 'slate' | 'blue' | 'amber' | 'orange' | 'green'> = {
  pending: 'slate',
  in_progress: 'blue',
  // The two review states get warm tints on purpose — they read as "someone
  // owes this task an action" rather than as progress.
  submitted: 'amber',
  awaiting_upload: 'orange',
  done: 'green',
};

// Status is changed by dragging the card between columns now (see
// TaskBoard) — this used to also render an interactive Select as a second,
// redundant way to do the same thing, which is exactly what got removed
// here (mirrors IssueStatusControl).
export function TaskStatusControl({ status }: { status: TaskStatus }) {
  const t = useTranslations('tasks');
  return (
    <Badge variant="tint" tint={BADGE_TINT[status]}>
      {t(`status.${status}`)}
    </Badge>
  );
}
