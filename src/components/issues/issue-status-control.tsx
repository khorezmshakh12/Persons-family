'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { updateIssueStatusAction } from '@/lib/actions/issues';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUSES = ['open', 'in_progress', 'done'] as const;
type IssueStatus = (typeof STATUSES)[number];

const BADGE_VARIANT: Record<IssueStatus, 'outline' | 'secondary' | 'default'> = {
  open: 'outline',
  in_progress: 'secondary',
  done: 'default',
};

export function IssueStatusControl({
  issueId,
  status,
  readOnly,
}: {
  issueId: string;
  status: IssueStatus;
  readOnly: boolean;
}) {
  const t = useTranslations('issues');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (readOnly) {
    return <Badge variant={BADGE_VARIANT[status]}>{t(`status.${status}`)}</Badge>;
  }

  function handleChange(value: string | null) {
    if (!value) return;
    const formData = new FormData();
    formData.set('id', issueId);
    formData.set('status', value);
    startTransition(async () => {
      await updateIssueStatusAction(formData);
      router.refresh();
    });
  }

  return (
    <Select value={status} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-[150px] border-white/30 bg-white/10 text-white hover:bg-white/20">
        <SelectValue>{(value: IssueStatus) => t(`status.${value}`)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {t(`status.${s}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
