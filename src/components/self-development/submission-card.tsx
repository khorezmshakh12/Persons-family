import { getTranslations } from 'next-intl/server';
import { CeoEvaluationPanel } from './ceo-evaluation-panel';
import { CollapsibleSubmissionCard } from './collapsible-submission-card';
import type { TeacherLevel } from '@/lib/teacher-level';

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

  const cardContent = (
    <>
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
        />
      ) : submission.ceo_rating ? (
        <div className="flex flex-col gap-1 border-t border-au-line pt-3">
          <span className="text-xs font-semibold text-au-muted">{t('ceoRating')}</span>
          <p className="text-sm whitespace-pre-wrap text-au-ink">{submission.ceo_rating}</p>
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
