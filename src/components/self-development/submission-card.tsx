import { getFormatter, getTranslations } from 'next-intl/server';
import { RateForm } from './rate-form';
import { LevelUpgradeControl } from './level-upgrade-control';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { TeacherLevel } from '@/lib/teacher-level';

export type Submission = {
  id: string;
  month: string;
  achievements: string | null;
  value_added: string | null;
  ceo_rating: string | null;
  user_id: string;
  author: { first_name: string; last_name: string; role: string; teacher_level: TeacherLevel } | null;
};

export async function SubmissionCard({ submission, isAdmin }: { submission: Submission; isAdmin: boolean }) {
  const t = await getTranslations('selfDevelopment');
  const format = await getFormatter();

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-3 p-6')}>
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
        {isAdmin && submission.author?.role === 'teacher' && (
          <LevelUpgradeControl userId={submission.user_id} currentLevel={submission.author.teacher_level} />
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
        <div className="border-t border-white/10 pt-3">
          <RateForm submissionId={submission.id} currentRating={submission.ceo_rating} />
        </div>
      ) : submission.ceo_rating ? (
        <div className="flex flex-col gap-1 border-t border-white/10 pt-3">
          <span className="text-xs font-semibold text-white/60">{t('ceoRating')}</span>
          <p className="text-sm whitespace-pre-wrap text-teal-200">{submission.ceo_rating}</p>
        </div>
      ) : (
        <p className="text-xs text-white/40 italic">{t('notRatedYet')}</p>
      )}
    </div>
  );
}
