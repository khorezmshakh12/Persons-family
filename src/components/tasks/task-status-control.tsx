'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';

export type TaskStatus = 'pending' | 'in_progress' | 'done';

const BADGE_VARIANT: Record<TaskStatus, 'outline' | 'secondary' | 'default'> = {
  pending: 'outline',
  in_progress: 'secondary',
  done: 'default',
};

// Status is changed by dragging the card between columns now (see
// TaskBoard) — this used to also render an interactive Select as a second,
// redundant way to do the same thing, which is exactly what got removed
// here (mirrors IssueStatusControl).
export function TaskStatusControl({ status }: { status: TaskStatus }) {
  const t = useTranslations('tasks');
  return <Badge variant={BADGE_VARIANT[status]}>{t(`status.${status}`)}</Badge>;
}
