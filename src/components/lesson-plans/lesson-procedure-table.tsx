'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { updateLessonProcedureAction, type LessonProcedureStep } from '@/lib/actions/course-lessons';
import { cn } from '@/lib/utils';

const EMPTY_STEP: LessonProcedureStep = { time: '', stage: '', interaction: '' };

export function LessonProcedureTable({
  lessonId,
  steps: initialSteps,
  canEdit,
}: {
  lessonId: string;
  steps: LessonProcedureStep[];
  canEdit: boolean;
}) {
  const t = useTranslations('lessonPlans');
  const [steps, setSteps] = useState(initialSteps);
  const [isPending, startTransition] = useTransition();

  function save(next: LessonProcedureStep[]) {
    setSteps(next);
    startTransition(async () => {
      const result = await updateLessonProcedureAction(lessonId, next);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  function updateCell(index: number, key: keyof LessonProcedureStep, cellValue: string) {
    setSteps((prev) => prev.map((step, i) => (i === index ? { ...step, [key]: cellValue } : step)));
  }

  function commitCell() {
    save(steps);
  }

  function addStep() {
    save([...steps, EMPTY_STEP]);
  }

  function removeStep(index: number) {
    save(steps.filter((_, i) => i !== index));
  }

  if (!canEdit && steps.length === 0) {
    return <p className="text-[13.5px] text-white/40 italic">{t('courseLessons.noProcedure')}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {steps.length > 0 && (
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="w-14 border-b border-white/10 bg-white/[0.03] px-2.5 py-2 text-left text-[11px] font-semibold text-white/55">
                {t('courseLessons.procedureTime')}
              </th>
              <th className="border-b border-white/10 bg-white/[0.03] px-2.5 py-2 text-left text-[11px] font-semibold text-white/55">
                {t('courseLessons.procedureStage')}
              </th>
              <th className="w-28 border-b border-white/10 bg-white/[0.03] px-2.5 py-2 text-left text-[11px] font-semibold text-white/55">
                {t('courseLessons.procedureInteraction')}
              </th>
              {canEdit && <th className="w-8 border-b border-white/10 bg-white/[0.03]" />}
            </tr>
          </thead>
          <tbody>
            {steps.map((step, index) => (
              <tr key={index} className="group">
                {(['time', 'stage', 'interaction'] as const).map((key) => (
                  <td key={key} className="border-b border-white/10 px-2.5 py-2 align-top">
                    {canEdit ? (
                      <input
                        value={step[key]}
                        onChange={(e) => updateCell(index, key, e.target.value)}
                        onBlur={commitCell}
                        disabled={isPending}
                        maxLength={key === 'stage' ? 200 : 50}
                        className={cn(
                          'w-full rounded-md border border-dashed border-white/20 bg-transparent px-1.5 py-1 text-white outline-none transition-colors focus-visible:border-solid focus-visible:border-teal-300/70 disabled:opacity-70',
                        )}
                      />
                    ) : (
                      <span className="text-white/80">{step[key]}</span>
                    )}
                  </td>
                ))}
                {canEdit && (
                  <td className="border-b border-white/10 px-2 py-2 align-top">
                    <button
                      type="button"
                      onClick={() => removeStep(index)}
                      disabled={isPending}
                      aria-label={t('courseLessons.removeStep')}
                      className="tap-scale text-white/30 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-300"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={addStep}
          disabled={isPending}
          className="tap-scale flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 transition-colors hover:bg-white/15 hover:text-white"
        >
          <Plus className="size-3.5" />
          {t('courseLessons.addStep')}
        </button>
      )}
    </div>
  );
}
