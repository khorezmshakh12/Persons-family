'use client';

import { useActionState, useState } from 'react';
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
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '@/lib/format-date';

export type Assignee = { id: string; first_name: string; last_name: string };

/** MVP shortcuts for the most common deadlines. */
const DEADLINE_PRESET_HOURS = [6, 12, 24] as const;

/** now + N hours, rendered in the browser's local time because that is the
 * only thing `datetime-local` understands — the existing
 * fromDatetimeLocalValue() call on submit is still what turns it into a real
 * instant. Deliberately module scope, and only ever called from a click
 * handler: reading the clock is fine there, it is doing it during render
 * that would be impure. */
function presetDeadlineValue(hours: number): string {
  return toDatetimeLocalValue(new Date(Date.now() + hours * 3600_000).toISOString());
}

export function AssignTaskDialog({ assignees }: { assignees: Assignee[] }) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  // The deadline input is the one controlled field in this form, because the
  // presets below have to write into it. Everything else stays uncontrolled.
  const [deadline, setDeadline] = useState('');
  const [state, formAction, isPending] = useActionState<TaskActionState, FormData>(
    async (prev, formData) => {
      const value = formData.get('deadline');
      if (typeof value === 'string' && value) {
        formData.set('deadline', fromDatetimeLocalValue(value));
      }
      const result = await assignTaskAction(prev, formData);
      if (!result?.error) {
        setDeadline('');
        setOpen(false);
      }
      return result;
    },
    undefined,
  );

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
        <form action={formAction} className="flex flex-col gap-4">
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
            {/* Unlike EditTaskDialog's Select, this one has no defaultValue
             * (there's no existing assignee to pre-fill) — without `required`,
             * the native hidden input backing this Select stays empty until
             * clicked, and submitting without ever opening the dropdown
             * silently reached the server as a blank assignedTo, failing
             * assignTaskAction's zod validation with a generic error and no
             * task created. `required` makes the browser block submission
             * with a clear prompt instead. */}
            <Select name="assignedTo" required>
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
            <Input
              id="deadline"
              name="deadline"
              type="datetime-local"
              required
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {DEADLINE_PRESET_HOURS.map((hours) => (
                <Button
                  key={hours}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeadline(presetDeadlineValue(hours))}
                >
                  {t('deadlinePreset', { hours })}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="starReward">{t('starReward')}</Label>
            <Input
              id="starReward"
              name="starReward"
              type="number"
              min={0}
              step={1}
              defaultValue={0}
              placeholder="0"
            />
            <p className="text-xs text-white/60">{t('starRewardHint')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="starPenalty">{t('starPenalty')}</Label>
            <Input
              id="starPenalty"
              name="starPenalty"
              type="number"
              min={0}
              step={1}
              defaultValue={0}
              placeholder="0"
            />
            <p className="text-xs text-white/60">{t('starPenaltyHint')}</p>
          </div>
          {state?.error &&<p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
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
