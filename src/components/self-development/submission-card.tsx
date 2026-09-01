import { getFormatter, getTranslations } from 'next-intl/server';
import { CeoEvaluationPanel } from './ceo-evaluation-panel';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
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
}: {
  submission: Submission;
  /** Whoever can rate/score a submission at all — CEO-only. */
  isAdmin: boolean;
  delayMs?: number;
}) {
  const t = await getTranslations('selfDevelopment');
  const format = await getFormatter();

  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-3 p-6')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          {isAdmin && submission.author && (
            <span className="font-medium text-white">
              {submission.author.first_name} {submission.author.last_name}
            </span>
          )}
          <span className="text-xs text-white/60">
            {format.dateTime(new Date(`${submission.month}T00:00:00Z`), {
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
        </div>
        {submission.ceo_score !== null && (
          <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
            {submission.ceo_score}
          </span>
        )}
      </div>

      {submission.achievements && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-white/60">{t('achievements')}</span>
          <p className="text-sm whitespace-pre-wrap text-white/90">{submission.achievements}</p>
        </div>
      )}
      {submission.value_added && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-white/60">{t('valueAdded')}</span>
          <p className="text-sm whitespace-pre-wrap text-white/90">{submission.value_added}</p>
        </div>
      )}

      {isAdmin ? (
        <CeoEvaluationPanel
          submissionId={submission.id}
          userId={submission.user_id}
          currentRating={submission.ceo_rating}
          currentScore={submission.ceo_score}
          currentLevel={submission.author?.role === 'teacher' ? submission.author.teacher_level : null}
          currentBonusAmount={submission.bonus_amount}
          currentStarAward={submission.star_award}
        />
      ) : submission.ceo_rating ? (
        <div className="flex flex-col gap-1 border-t border-white/10 pt-3">
          <span className="text-xs font-semibold text-white/60">{t('ceoRating')}</span>
          <p className="text-sm whitespace-pre-wrap text-white/80">{submission.ceo_rating}</p>
        </div>
      ) : (
        <p className="text-xs text-white/40 italic">{t('notRatedYet')}</p>
      )}
    </div>
  );
}
