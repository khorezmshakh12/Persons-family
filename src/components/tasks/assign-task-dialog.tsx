'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Sparkles } from 'lucide-react';
import { parseQuickTask } from '@/lib/task-quick-parse';
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

export function AssignTaskDialog({ assignees, prefill }: { assignees: Assignee[]; prefill?: { title: string; description: string } | null }) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  // Opened pre-filled from a chat message ("Vazifaga aylantirish").
  const [open, setOpen] = useState(!!prefill);
  // The deadline input is the one controlled field in this form, because the
  // presets below have to write into it. Everything else stays uncontrolled.
  const [deadline, setDeadline] = useState('');
  // Quick entry ("Hisobot @Ali ertaga 15:00 +10") fills the fields below;
  // every field stays editable afterwards.
  const [quick, setQuick] = useState('');
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [stars, setStars] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState<TaskActionState, FormData>(
    async (prev, formData) => {
      const value = formData.get('deadline');
      if (typeof value === 'string' && value) {
        formData.set('deadline', fromDatetimeLocalValue(value));
      }
      const result = await assignTaskAction(prev, formData);
      if (!result?.error) {
        setDeadline('');
        setQuick('');
        setTitle('');
        setAssignee(null);
        setStars('');
        formRef.current?.reset();
        setOpen(false);
      }
      return result;
    },
    undefined,
  );

  // Drop the one-shot ?new=… so a refresh doesn't reopen it.
  useEffect(() => {
    if (!prefill) return;
    const url = new URL(window.location.href);
    ['new', 'title', 'desc'].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState(null, '', url.pathname + (url.search || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  // `C` on the board (see TaskBoard's shortcuts) opens this dialog.
  useEffect(() => {
    const onNew = () => setOpen(true);
    window.addEventListener('tasks:new', onNew);
    return () => window.removeEventListener('tasks:new', onNew);
  }, []);

  function applyQuick(value: string) {
    setQuick(value);
    const parsed = parseQuickTask(value, assignees);
    setTitle(parsed.title);
    if (parsed.assigneeId) setAssignee(parsed.assigneeId);
    if (parsed.deadline) setDeadline(toDatetimeLocalValue(parsed.deadline));
    if (parsed.starReward !== null) setStars(String(parsed.starReward));
  }

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
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 rounded-au-ctl border border-dashed border-au-accent/50 bg-au-accent-soft/40 p-3">
            <Label htmlFor="quick" className="flex items-center gap-1.5 text-au-accent-text">
              <Sparkles className="size-3.5" aria-hidden />
              {t('quick.label')}
            </Label>
            <Input
              id="quick"
              value={quick}
              onChange={(event) => applyQuick(event.target.value)}
              placeholder={t('quick.placeholder')}
              autoComplete="off"
            />
            <p className="text-[11px] text-au-muted">{t('quick.hint')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">{t('titleLabel')}</Label>
            <Input id="title" name="title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">{t('descriptionLabel')}</Label>
            <Textarea id="description" name="description" maxLength={2000} rows={3} defaultValue={prefill?.description} />
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
            <Select name="assignedTo" required value={assignee} onValueChange={(v) => setAssignee(v as string | null)}>
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
            <Label htmlFor="repeat">{t('repeat.label')}</Label>
            <select
              id="repeat"
              name="repeat"
              defaultValue=""
              className="h-9 w-full rounded-md border border-au-line bg-au-card px-3 text-sm text-au-ink"
            >
              <option value="">{t('repeat.none')}</option>
              <option value="weekly">{t('repeat.weekly')}</option>
              <option value="monthly">{t('repeat.monthly')}</option>
            </select>
            <p className="text-xs text-au-muted">{t('repeat.hint')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="starReward">{t('starReward')}</Label>
            <Input
              id="starReward"
              name="starReward"
              type="number"
              min={0}
              step={1}
              value={stars}
              onChange={(event) => setStars(event.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-au-muted">{t('starRewardHint')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="starPenalty">{t('starPenalty')}</Label>
            <Input
              id="starPenalty"
              name="starPenalty"
              type="number"
              min={0}
              step={1}
              defaultValue=""
              placeholder="0"
            />
            <p className="text-xs text-au-muted">{t('starPenaltyHint')}</p>
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
