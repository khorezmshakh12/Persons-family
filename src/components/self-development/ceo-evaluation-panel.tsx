'use client';

import { useActionState, useState } from 'react';
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
  /** True for any teacher submission — including one whose level hasn't been
   * set yet (currentLevel === null), which used to hide the control and
   * left new teachers un-levellable. */
  canSetLevel = false,
  currentBonusAmount,
  currentStarAward,
}: {
  submissionId: string;
  userId: string;
  currentRating: string | null;
  currentScore: number | null;
  currentLevel: TeacherLevel | null;
  canSetLevel?: boolean;
  currentBonusAmount: number | null;
  currentStarAward?: number | null;
}) {
  const t = useTranslations('selfDevelopment');
  const [score, setScore] = useState(currentScore ?? 0);
  const [starAward, setStarAward] = useState(currentStarAward ?? 0);
  const [, formAction, isPending] = useActionState<SelfDevActionState, FormData>(
    async (prev, formData) => {
      const result = await saveEvaluationAction(prev, formData);
      if (result?.success) toast.success(t('evaluationSaved'));
      else if (result?.error) toast.error(t(`errors.${result.error}`));
      return result;
    },
    undefined,
  );

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
          <span className="font-semibold tabular-nums text-white">{score}</span>
        </div>
        {/* No ceiling — the CEO enters any number of points (spec: cheksiz
            bal), so this is a free number field, not a 0–100 slider. */}
        <input
          type="number"
          name="ceoScore"
          min={0}
          step={1}
          value={score}
          onChange={(e) => setScore(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          aria-label={t('ceoScore')}
          className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm tabular-nums text-white"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white/60">{t('starAward')}</span>
          <span className="font-semibold tabular-nums text-white">{starAward}</span>
        </div>
        <input
          type="number"
          name="starAward"
          min={0}
          step={1}
          value={starAward}
          onChange={(e) => setStarAward(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          aria-label={t('starAward')}
          className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm tabular-nums text-white"
        />
        <p className="text-xs text-white/50">{t('starAwardHint')}</p>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`bonus-${submissionId}`}>{t('bonusAmount')}</Label>
        <CurrencyInput id={`bonus-${submissionId}`} name="bonusAmount" defaultValue={currentBonusAmount ?? 0} />
      </div>

      {canSetLevel && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-white/60">{t('teacherLevel')}</label>
          <Select name="level" defaultValue={currentLevel ?? undefined}>
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
