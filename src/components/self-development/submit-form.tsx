'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BookOpen, CheckCircle2, Dumbbell, GraduationCap, Hammer, Shapes } from 'lucide-react';
import { submitSelfDevelopmentAction, type SelfDevActionState } from '@/lib/actions/self-development';
import { celebrate } from '@/components/motion/events';
import { SELF_DEV_KINDS, type SelfDevKind } from '@/lib/self-dev-rubric';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const KIND_ICON: Record<SelfDevKind, typeof BookOpen> = {
  course: GraduationCap,
  book: BookOpen,
  skill: Dumbbell,
  practice: Hammer,
  other: Shapes,
};

export function SubmitForm() {
  const t = useTranslations('selfDevelopment');
  const tv = useTranslations('selfDevelopment.v2.form');
  const tCommon = useTranslations('common');
  const [kind, setKind] = useState<SelfDevKind | ''>('');
  const [state, formAction, isPending] = useActionState<SelfDevActionState, FormData>(
    submitSelfDevelopmentAction,
    undefined,
  );

  useEffect(() => {
    if (state?.success) {
      toast.success(t('submitted'));
      celebrate();
    }
  }, [state, t]);

  if (state?.success) {
    return (
      <p className="ms-pop-in flex items-center gap-2 text-sm font-semibold text-au-ok">
        <CheckCircle2 className="size-5" aria-hidden />
        {t('submittedThisMonth')}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label className="text-au-ink">{tv('kind')}</Label>
        <input type="hidden" name="kind" value={kind} />
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tv('kind')}>
          {SELF_DEV_KINDS.map((k) => {
            const Icon = KIND_ICON[k];
            const on = kind === k;
            return (
              <button
                key={k + (on ? '-on' : '')}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKind(on ? '' : k)}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors',
                  on ? 'ms-pop-in border-transparent bg-au-accent text-au-accent-ink' : 'border-au-line bg-au-card text-au-muted hover:text-au-ink',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {tv(`kinds.${k}`)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="achievements" className="text-au-ink">
          {t('achievements')}
        </Label>
        <Textarea
          id="achievements"
          name="achievements"
          rows={3}
          maxLength={4000}
          placeholder={t('achievementsPlaceholder')}
          className="border-au-line bg-au-card text-au-ink placeholder:text-au-faint"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="valueAdded" className="text-au-ink">
          {t('valueAdded')}
        </Label>
        <Textarea
          id="valueAdded"
          name="valueAdded"
          rows={3}
          maxLength={4000}
          placeholder={t('valueAddedPlaceholder')}
          className="border-au-line bg-au-card text-au-ink placeholder:text-au-faint"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="hours" className="text-au-ink">
            {tv('hours')}
          </Label>
          <Input id="hours" name="hours" type="number" min={0} max={744} step={0.5} inputMode="decimal" placeholder="0" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="evidenceUrl" className="text-au-ink">
            {tv('evidence')}
          </Label>
          <Input id="evidenceUrl" name="evidenceUrl" type="url" maxLength={500} placeholder="https://" />
        </div>
      </div>
      {state?.error && <p className="m-shake text-sm text-au-bad">{t(`errors.${state.error}`)}</p>}
      <Button type="submit" loading={isPending} className="w-fit">
        {isPending ? tCommon('loading') : t('submit')}
      </Button>
    </form>
  );
}
