'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { updateSubmissionStatusAction } from '@/lib/actions/homework';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUSES = ['pending', 'submitted', 'graded', 'missing'] as const;
export type SubmissionStatus = (typeof STATUSES)[number];

export function SubmissionStatusSelect({
  assignmentId,
  studentId,
  status,
}: {
  assignmentId: string;
  studentId: string;
  status: SubmissionStatus;
}) {
  const t = useTranslations('lessonPlans');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string | null) {
    if (!value) return;
    const formData = new FormData();
    formData.set('assignmentId', assignmentId);
    formData.set('studentId', studentId);
    formData.set('status', value);
    startTransition(async () => {
      await updateSubmissionStatusAction(formData);
      router.refresh();
    });
  }

  return (
    <Select value={status} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="h-7 w-[130px] border-white/20 bg-white/10 text-xs text-white">
        <SelectValue>{(value: SubmissionStatus) => t(`homework.status.${value}`)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {t(`homework.status.${s}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
