'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';

type IssueStatus = 'open' | 'in_progress' | 'done';

const BADGE_VARIANT: Record<IssueStatus, 'outline' | 'secondary' | 'default'> = {
  open: 'outline',
  in_progress: 'secondary',
  done: 'default',
};

// Status is changed by dragging the card between columns now (see
// IssuesBoard) — this used to also render an interactive Select as a second,
// redundant way to do the same thing, which is exactly what got removed
// here.
export function IssueStatusControl({ status }: { status: IssueStatus }) {
  const t = useTranslations('issues');
  return <Badge variant={BADGE_VARIANT[status]}>{t(`status.${status}`)}</Badge>;
}
