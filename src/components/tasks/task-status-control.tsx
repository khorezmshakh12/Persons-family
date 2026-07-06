'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { updateTaskStatusAction } from '@/lib/actions/tasks';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUSES = ['pending', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof STATUSES)[number];

export function TaskStatusControl({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const t = useTranslations('tasks');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string | null) {
    if (!value) return;
    const formData = new FormData();
    formData.set('id', taskId);
    formData.set('status', value);
    startTransition(async () => {
      await updateTaskStatusAction(formData);
      router.refresh();
    });
  }

  return (
    <Select value={status} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-full border-white/30 bg-white/10 text-white hover:bg-white/20">
        <SelectValue>{(value: TaskStatus) => t(`status.${value}`)}</SelectValue>
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
