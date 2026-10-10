import { getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { SubmissionCard, type Submission } from '@/components/self-development/submission-card';
import { SelfDevelopmentSectionClient } from './self-development-section-client';
import { MonthPicker } from './month-picker';

export async function SelfDevelopmentSection({
  staffId,
  isAdmin,
  selectedMonth,
}: {
  staffId: string;
  /** CEO viewing someone else — reuses SubmissionCard's own rating panel. */
  isAdmin: boolean;
  selectedMonth: string;
}) {
  const t = await getTranslations('profile.selfDevelopment');
  const all = await sql<
    {
      id: string;
      month: string;
      achievements: string | null;
      value_added: string | null;
      ceo_rating: string | null;
      ceo_score: number | null;
      bonus_amount: number | null;
      star_award: number | null;
      user_id: string;
    }[]
  >`
    select id, month, achievements, value_added, ceo_rating, ceo_score, bonus_amount::float8 as bonus_amount,
           (select coalesce(sum(delta), 0)::int from star_transactions where source_type = 'self_development' and source_id = self_development.id) as star_award,
           user_id
    from self_development
    where user_id = ${staffId}
    order by month desc
  `;

  const filtered = selectedMonth === 'all' ? all : all.filter((s) => s.month === selectedMonth);

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6 overflow-hidden')}>
      <SelfDevelopmentSectionClient
        title={t('title')}
        filteredCount={filtered.length}
        noEntriesText={t('noEntries')}
        monthPickerContent={
          all.length > 0 && (
            <MonthPicker months={all.map((s) => s.month)} selected={selectedMonth} />
          )
        }
        submissionIds={filtered.map((s) => s.id)}
        cards={filtered.map((s) => (
          <SubmissionCard
            key={s.id}
            submission={{ ...s, author: null } as Submission}
            isAdmin={isAdmin}
            defaultOpen={false}
            storageKeyPrefix="profile-submission"
          />
        ))}
      />
    </div>
  );
}
