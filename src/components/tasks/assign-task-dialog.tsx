'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { assignTaskAction, type TaskActionState } from '@/lib/actions/tasks';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fromDatetimeLocalValue } from '@/lib/format-date';

export type Assignee = { id: string; first_name: string; last_name: string };

export function AssignTaskDialog({ assignees }: { assignees: Assignee[] }) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<TaskActionState, FormData>(
    assignTaskAction,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        {t('assignTask')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('assignTask')}</DialogTitle>
        </DialogHeader>
        <form
          action={(formData) => {
            const deadline = formData.get('deadline');
            if (typeof deadline === 'string' && deadline) {
              formData.set('deadline', fromDatetimeLocalValue(deadline));
            }
            return formAction(formData);
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">{t('titleLabel')}</Label>
            <Input id="title" name="title" required maxLength={200} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">{t('descriptionLabel')}</Label>
            <Textarea id="description" name="description" maxLength={2000} rows={3} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="assignedTo">{t('assignee')}</Label>
            <Select name="assignedTo">
              <SelectTrigger id="assignedTo" className="w-full">
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
            <Label htmlFor="deadline">{t('deadline')}</Label>
            <Input id="deadline" name="deadline" type="datetime-local" required />
          </div>
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
          <DialogFooter>
            <Button type="submit" loading={isPending}>
              {isPending ? tCommon('loading') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
