import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { SubmissionCard, type Submission } from '@/components/self-development/submission-card';
import { MonthPicker } from './month-picker';

export async function SelfDevelopmentSection({
  staffId,
  isAdmin,
  isCeo = false,
  selectedMonth,
}: {
  staffId: string;
  /** CEO viewing someone else — reuses SubmissionCard's own rating panel. */
  isAdmin: boolean;
  /** Gates the cash-bonus field specifically — narrower than isAdmin. */
  isCeo?: boolean;
  selectedMonth: string;
}) {
  const t = await getTranslations('profile.selfDevelopment');
  const supabase = await createClient();
  const { data: submissions } = await supabase
    .from('self_development')
    .select('id, month, achievements, value_added, ceo_rating, ceo_score, bonus_amount, user_id')
    .eq('user_id', staffId)
    .order('month', { ascending: false });

  const all = submissions ?? [];
  const filtered = selectedMonth === 'all' ? all : all.filter((s) => s.month === selectedMonth);

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('title')}
        </h2>
        {all.length > 0 && (
          <MonthPicker months={all.map((s) => s.month)} selected={selectedMonth} />
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-white/60">{t('noEntries')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((s) => (
            <SubmissionCard
              key={s.id}
              submission={{ ...s, author: null } as Submission}
              isAdmin={isAdmin}
              isCeo={isCeo}
            />
          ))}
        </div>
      )}
    </div>
  );
}
