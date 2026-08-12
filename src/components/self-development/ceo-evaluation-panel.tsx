'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { saveEvaluationAction, type SelfDevActionState } from '@/lib/actions/self-development';
import { TEACHER_LEVELS, type TeacherLevel } from '@/lib/teacher-level';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/staff/currency-input';

export function CeoEvaluationPanel({
  submissionId,
  userId,
  currentRating,
  currentScore,
  /** null for a non-teacher submission — the level Select only makes sense
   * for a teacher's career ladder, so it's simply omitted from the form. */
  currentLevel,
  currentBonusAmount,
}: {
  submissionId: string;
  userId: string;
  currentRating: string | null;
  currentScore: number | null;
  currentLevel: TeacherLevel | null;
  currentBonusAmount: number | null;
}) {
  const t = useTranslations('selfDevelopment');
  const [score, setScore] = useState(currentScore ?? 50);
  const [state, formAction, isPending] = useActionState<SelfDevActionState, FormData>(
    saveEvaluationAction,
    undefined,
  );

  useEffect(() => {
    if (state?.success) toast.success(t('evaluationSaved'));
    else if (state?.error) toast.error(t(`errors.${state.error}`));
  }, [state, t]);

  return (
    <form action={formAction} className="flex flex-col gap-3 border-t border-white/10 pt-3">
      <input type="hidden" name="id" value={submissionId} />
      <input type="hidden" name="userId" value={userId} />

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-white/60">{t('ceoRating')}</label>
        <Textarea
          name="ceoRating"
          defaultValue={currentRating ?? ''}
          rows={2}
          maxLength={2000}
          placeholder={t('ratingPlaceholder')}
          className="border-white/30 bg-white/10 text-sm text-white placeholder:text-white/40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white/60">{t('ceoScore')}</span>
          <span className="font-semibold tabular-nums text-white">{score}/100</span>
        </div>
        <input
          type="range"
          name="ceoScore"
          min={1}
          max={100}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          aria-label={t('ceoScore')}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`bonus-${submissionId}`}>{t('bonusAmount')}</Label>
        <CurrencyInput id={`bonus-${submissionId}`} name="bonusAmount" defaultValue={currentBonusAmount ?? 0} />
      </div>

      {currentLevel !== null && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-white/60">{t('teacherLevel')}</label>
          <Select name="level" defaultValue={currentLevel}>
            <SelectTrigger className="w-full border-white/30 bg-white/10 text-white hover:bg-white/20">
              <SelectValue>{(value: string) => value}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TEACHER_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button type="submit" size="sm" disabled={isPending} className="w-fit">
        {isPending ? t('saving') : t('saveEvaluation')}
      </Button>
    </form>
  );
}
