'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, Target } from 'lucide-react';
import { saveSelfDevGoalAction, type SelfDevActionState } from '@/lib/actions/self-development';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/** The month's personal goal: set at the start, reported against at the end. */
export function GoalForm({ goal, locked }: { goal: string | null; locked: boolean }) {
  const t = useTranslations('selfDevelopment.v2.goal');
  const [editing, setEditing] = useState(!goal && !locked);
  const [, action, pending] = useActionState<SelfDevActionState, FormData>(async (prev, fd) => {
    const res = await saveSelfDevGoalAction(prev, fd);
    if (res?.success) setEditing(false);
    return res;
  }, undefined);

  if (!editing)
    return (
      <div className="flex items-start gap-3 rounded-au-ctl border border-au-line bg-au-card-2 p-3.5">
        <Target className="mt-0.5 size-4 shrink-0 text-au-accent-text" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-wide text-au-faint uppercase">{t('label')}</div>
          <p className="text-sm whitespace-pre-wrap text-au-ink">{goal ?? t('none')}</p>
        </div>
        {!locked && (
          <button type="button" onClick={() => setEditing(true)} className="grid size-8 place-items-center rounded-full text-au-muted hover:bg-au-card hover:text-au-ink" aria-label={t('edit')}>
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
    );

  return (
    <form action={action} className="ms-rise flex flex-col gap-2 rounded-au-ctl border border-dashed border-au-accent/50 bg-au-accent-soft/40 p-3.5">
      <label htmlFor="sd-goal" className="flex items-center gap-1.5 text-sm font-semibold text-au-ink">
        <Target className="size-4 text-au-accent-text" aria-hidden />
        {t('prompt')}
      </label>
      <Textarea id="sd-goal" name="goal" required minLength={3} maxLength={1000} rows={2} defaultValue={goal ?? ''} placeholder={t('placeholder')} className="border-au-line bg-au-card text-au-ink placeholder:text-au-faint" />
      <Button type="submit" size="sm" loading={pending} className="w-fit">
        {t('save')}
      </Button>
    </form>
  );
}
