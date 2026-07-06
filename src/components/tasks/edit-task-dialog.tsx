'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import { updateTaskAction, type TaskActionState } from '@/lib/actions/tasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Assignee } from './assign-task-dialog';

export type EditableTask = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  due_date: string | null;
};

export function EditTaskDialog({ task, assignees }: { task: EditableTask; assignees: Assignee[] }) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<TaskActionState, FormData>(
    updateTaskAction,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t('editTask')}
            className="border-white/30 bg-white/10 text-white hover:bg-white/20"
          />
        }
      >
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editTask')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={task.id} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`title-${task.id}`}>{t('titleLabel')}</Label>
            <Input id={`title-${task.id}`} name="title" defaultValue={task.title} required maxLength={200} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`description-${task.id}`}>{t('descriptionLabel')}</Label>
            <Textarea
              id={`description-${task.id}`}
              name="description"
              defaultValue={task.description ?? ''}
              maxLength={2000}
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`assignedTo-${task.id}`}>{t('assignee')}</Label>
            <Select name="assignedTo" defaultValue={task.assigned_to}>
              <SelectTrigger id={`assignedTo-${task.id}`} className="w-full">
                <SelectValue>
                  {(value: string) => {
                    const person = assignees.find((a) => a.id === value);
                    return person ? `${person.first_name} ${person.last_name}` : value;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {assignees.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.first_name} {a.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`dueDate-${task.id}`}>{t('dueDate')}</Label>
            <Input
              id={`dueDate-${task.id}`}
              name="dueDate"
              type="date"
              defaultValue={task.due_date ?? ''}
            />
          </div>
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon('loading') : t('saveChanges')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
