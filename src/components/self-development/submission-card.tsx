import { getTranslations } from 'next-intl/server';
import { CeoEvaluationPanel } from './ceo-evaluation-panel';
import { CollapsibleSubmissionCard } from './collapsible-submission-card';
import type { TeacherLevel } from '@/lib/teacher-level';
import { ExternalLink, Target } from 'lucide-react';
import { parseRubric, type Rubric } from '@/lib/self-dev-rubric';
import { RubricBars } from './self-dev-visuals';
import { FeatureReportButton } from './feature-report-button';

export type Submission = {
  id: string;
  month: string;
  achievements: string | null;
  value_added: string | null;
  ceo_rating: string | null;
  ceo_score: number | null;
  bonus_amount: number | null;
  star_award?: number | null;
  user_id: string;
  kind?: string | null;
  hours?: number | null;
  evidence_url?: string | null;
  goal?: string | null;
  rubric?: unknown;
  ai_rubric?: unknown;
  author: { first_name: string; last_name: string; role: string; teacher_level: TeacherLevel } | null;
};

export async function SubmissionCard({
  submission,
  isAdmin,
  delayMs = 0,
  defaultOpen = false,
  storageKeyPrefix = 'submission',
}: {
  submission: Submission;
  /** Whoever can rate/score a submission at all — CEO-only. */
  isAdmin: boolean;
  delayMs?: number;
  defaultOpen?: boolean;
  storageKeyPrefix?: string;
}) {
  const t = await getTranslations('selfDevelopment');

  const headerContent = isAdmin && submission.author ? (
    <span>
      {submission.author.first_name} {submission.author.last_name}
    </span>
  ) : null;

  const rubric = parseRubric(submission.rubric);
  const ai = parseRubric(submission.ai_rubric) as (Partial<Rubric> & { confidence?: number | null }) | null;
  const cardContent = (
    <>
      {submission.goal && (
        <div className="flex items-start gap-2 rounded-au-ctl bg-au-card-2 px-3 py-2 text-sm">
          <Target className="mt-0.5 size-4 shrink-0 text-au-accent-text" aria-hidden />
          <span className="text-au-ink">
            <b className="font-semibold">{t('v2.goal.label')}:</b> {submission.goal}
          </span>
        </div>
      )}
      {(submission.kind || submission.hours || submission.evidence_url) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {submission.kind && <span className="rounded-full bg-au-accent-soft px-2.5 py-1 font-semibold text-au-accent-text">{t(`v2.form.kinds.${submission.kind}`)}</span>}
          {!!submission.hours && <span className="rounded-full bg-au-card-2 px-2.5 py-1 font-semibold text-au-muted tabular-nums">{t('v2.hoursValue', { hours: submission.hours })}</span>}
          {submission.evidence_url && (
            <a href={submission.evidence_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-au-info-soft px-2.5 py-1 font-semibold text-au-info hover:underline">
              <ExternalLink className="size-3" aria-hidden /> {t('v2.form.evidence')}
            </a>
          )}
        </div>
      )}
      {submission.achievements && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-au-muted">{t('achievements')}</span>
          <p className="text-sm whitespace-pre-wrap text-au-ink">{submission.achievements}</p>
        </div>
      )}
      {submission.value_added && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-au-muted">{t('valueAdded')}</span>
          <p className="text-sm whitespace-pre-wrap text-au-ink">{submission.value_added}</p>
        </div>
      )}

      {isAdmin && <FeatureReportButton submissionId={submission.id} />}
      {isAdmin ? (
        <CeoEvaluationPanel
          submissionId={submission.id}
          userId={submission.user_id}
          currentRating={submission.ceo_rating}
          currentScore={submission.ceo_score}
          currentLevel={submission.author?.role === 'teacher' ? submission.author.teacher_level : null}
          canSetLevel={submission.author?.role === 'teacher'}
          currentBonusAmount={submission.bonus_amount}
          currentStarAward={submission.star_award}
          currentRubric={rubric}
          aiRubric={ai ? { ...ai, confidence: (submission.ai_rubric as { confidence?: number | null } | null)?.confidence ?? null } : null}
        />
      ) : submission.ceo_rating || rubric ? (
        <div className="flex flex-col gap-3 border-t border-au-line pt-3">
          {submission.ceo_rating && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-au-muted">{t('ceoRating')}</span>
              <p className="text-sm whitespace-pre-wrap text-au-ink">{submission.ceo_rating}</p>
            </div>
          )}
          <RubricBars rubric={rubric} />
        </div>
      ) : (
        <p className="text-xs text-au-muted italic">{t('notRatedYet')}</p>
      )}
    </>
  );

  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className="animate-fade-in-up"
    >
      <CollapsibleSubmissionCard
        id={submission.id}
        month={submission.month}
        ceoScore={submission.ceo_score}
        header={headerContent}
        defaultOpen={defaultOpen}
        storageKeyPrefix={storageKeyPrefix}
      >
        {cardContent}
      </CollapsibleSubmissionCard>
    </div>
  );
}
