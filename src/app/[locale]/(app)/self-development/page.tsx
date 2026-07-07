import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { firstOfCurrentMonth } from '@/lib/self-development';
import { SubmitForm } from '@/components/self-development/submit-form';
import { SubmissionCard, type Submission } from '@/components/self-development/submission-card';

export const dynamic = 'force-dynamic';

export default async function SelfDevelopmentPage() {
  const t = await getTranslations('selfDevelopment');
  const { user, profile } = await getAuthState();
  const isAdmin = profile!.role === 'ceo' || profile!.role === 'admin_manager';
  const supabase = await createClient();

  let query = supabase
    .from('self_development')
    .select(
      'id, month, achievements, value_added, ceo_rating, ceo_score, user_id, author:profiles!self_development_user_id_fkey(first_name, last_name, role, teacher_level)',
    )
    .order('month', { ascending: false });

  if (!isAdmin) query = query.eq('user_id', user!.id);

  const { data: submissions } = await query;

  const hasSubmittedThisMonth = !isAdmin && (submissions ?? []).some((s) => s.month === firstOfCurrentMonth());

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <p className="text-white/70">{t('subtitle')}</p>
      </div>

      {!isAdmin && (
        <div className="rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-xl backdrop-blur-md">
          <h2 className="mb-4 text-lg font-semibold text-white">{t('submitTitle')}</h2>
          {hasSubmittedThisMonth ? <p className="text-sm text-white/70">{t('submittedThisMonth')}</p> : <SubmitForm />}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {isAdmin ? t('allSubmissions') : t('yourSubmissions')}
        </h2>
        {(submissions ?? []).length === 0 ? (
          <p className="text-sm text-white/70">{t('noSubmissions')}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {(submissions ?? []).map((s) => (
              <SubmissionCard key={s.id} submission={s as unknown as Submission} isAdmin={isAdmin} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
