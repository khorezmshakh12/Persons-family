import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { firstOfCurrentMonth } from '@/lib/self-development';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { SubmitForm } from '@/components/self-development/submit-form';
import { SubmissionCard, type Submission } from '@/components/self-development/submission-card';
import { SelfDevelopmentLineChart } from '@/components/self-development/self-development-line-chart';
import { TeacherPicker } from '@/components/self-development/teacher-picker';
import { ManageStaffPerformanceDialog } from '@/components/performance/manage-staff-performance-dialog';
import { PerformanceEntriesList, type PerformanceEntry } from '@/components/performance/performance-entries-list';
import { ExportButtons } from '@/components/export/export-buttons';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

function netTotal(entries: { entry_type: string; amount: number }[]) {
  return entries.reduce((sum, e) => sum + (e.entry_type === 'bonus' ? e.amount : -e.amount), 0);
}

export default async function SelfDevelopmentPage({
  searchParams,
}: {
  searchParams: Promise<{ teacher?: string }>;
}) {
  const t = await getTranslations('selfDevelopment');
  const tp = await getTranslations('performance');
  const { teacher } = await searchParams;
  const { user, profile } = await getAuthState();
  const isAdmin = profile!.role === 'ceo' || profile!.role === 'it_developer';
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

  if (isAdmin) {
    const [{ data: staff }, { data: performance }, { data: entries }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .eq('is_active', true)
        .order('first_name', { ascending: true }),
      supabase.from('staff_performance').select('*'),
      supabase.from('performance_entries').select('*').order('created_at', { ascending: false }),
    ]);

    const teacherList = (staff ?? []).filter((p) => p.role === 'teacher');
    const selectedTeacherId = teacher ?? teacherList[0]?.id;
    const { data: teacherPoints } = selectedTeacherId
      ? await supabase
          .from('self_development')
          .select('month, ceo_score')
          .eq('user_id', selectedTeacherId)
          .order('month', { ascending: true })
      : { data: null };

    const performanceByStaffId = new Map((performance ?? []).map((p) => [p.staff_id, p]));
    const entriesByStaffId = new Map<string, PerformanceEntry[]>();
    for (const e of entries ?? []) {
      const list = entriesByStaffId.get(e.staff_id) ?? [];
      list.push(e);
      entriesByStaffId.set(e.staff_id, list);
    }

    const exportRows = (staff ?? []).map((person) => {
      const perf = performanceByStaffId.get(person.id);
      const net = netTotal(entriesByStaffId.get(person.id) ?? []);
      return {
        name: `${person.first_name} ${person.last_name}`,
        role: person.role,
        tier: perf?.current_tier ?? '',
        weekly_progress_score: perf?.weekly_progress_score ?? '',
        net_total: net,
      };
    });

    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6 sm:p-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
            {t('title')}
          </h1>
          <p className="text-white/70">{t('subtitle')}</p>
        </div>

        {teacherList.length > 0 && (
          <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
                {t('teacherProgress.title')}
              </h2>
              <TeacherPicker teachers={teacherList} selectedId={selectedTeacherId!} />
            </div>
            <SelfDevelopmentLineChart
              points={(teacherPoints ?? []).map((s) => ({ month: s.month, ceoScore: s.ceo_score }))}
              bare
            />
          </div>
        )}

        <div className="flex flex-col gap-4">
          <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
            {t('allSubmissions')}
          </h2>
          {(submissions ?? []).length === 0 ? (
            <p className="text-sm text-white/70">{t('noSubmissions')}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {(submissions ?? []).map((s) => (
                <SubmissionCard key={s.id} submission={s as unknown as Submission} isAdmin />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 border-t border-white/10 pt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
              {tp('title')}
            </h2>
            <ExportButtons
              filename="staff-performance"
              columns={[
                { header: 'Name', key: 'name' },
                { header: 'Role', key: 'role' },
                { header: 'Tier', key: 'tier' },
                { header: 'Weekly Progress %', key: 'weekly_progress_score' },
                { header: 'Net Total', key: 'net_total' },
              ]}
              rows={exportRows}
            />
          </div>
          {(staff ?? []).map((person) => {
            const perf = performanceByStaffId.get(person.id) ?? null;
            const personEntries = entriesByStaffId.get(person.id) ?? [];
            const net = netTotal(personEntries);
            return (
              <div key={person.id} className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-white">
                      {person.first_name} {person.last_name}
                    </span>
                    {perf && (
                      <Badge variant="tint" tint="slate" className="text-xs font-semibold">
                        {tp(`tierLabels.${perf.current_tier}`)} · {perf.weekly_progress_score}%
                      </Badge>
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-lg font-bold tabular-nums',
                      net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : 'text-white/70',
                    )}
                  >
                    {net >= 0 ? '+' : ''}
                    {formatUZS(net)}
                  </span>
                </div>
                <ManageStaffPerformanceDialog staffId={person.id} performance={perf} />
                <PerformanceEntriesList entries={personEntries} isAdmin />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const [{ data: performance }, { data: entries }] = await Promise.all([
    supabase.from('staff_performance').select('*').eq('staff_id', user!.id).maybeSingle(),
    supabase
      .from('performance_entries')
      .select('*')
      .eq('staff_id', user!.id)
      .order('created_at', { ascending: false }),
  ]);

  const totalBonus = (entries ?? []).filter((e) => e.entry_type === 'bonus').reduce((sum, e) => sum + e.amount, 0);
  const totalPenalty = (entries ?? [])
    .filter((e) => e.entry_type === 'penalty')
    .reduce((sum, e) => sum + e.amount, 0);
  const net = totalBonus - totalPenalty;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <p className="text-white/70">{t('subtitle')}</p>
      </div>

      <SelfDevelopmentLineChart
        points={[...(submissions ?? [])].reverse().map((s) => ({ month: s.month, ceoScore: s.ceo_score }))}
      />

      <div className="rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-xl backdrop-blur-md">
        <h2 className="font-heading mb-4 text-lg font-semibold text-white">{t('submitTitle')}</h2>
        {hasSubmittedThisMonth ? <p className="text-sm text-white/70">{t('submittedThisMonth')}</p> : <SubmitForm />}
      </div>

      {performance && (
        <div className={cn(GLASS_CARD, 'flex flex-wrap items-center gap-3 p-6')}>
          <Badge variant="tint" tint="teal" className="px-4 py-1.5 text-sm font-bold">
            {tp('tier')}: {tp(`tierLabels.${performance.current_tier}`)}
          </Badge>
          <Badge variant="tint" tint="slate" className="px-4 py-1.5 text-sm font-medium">
            {tp('weeklyProgressScore')}: {performance.weekly_progress_score}%
          </Badge>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={cn(GLASS_CARD, 'flex flex-col gap-1 p-6')}>
          <span className="text-sm text-white/60">{tp('totalBonus')}</span>
          <span className="text-2xl font-bold tabular-nums text-emerald-400">+{formatUZS(totalBonus)}</span>
        </div>
        <div className={cn(GLASS_CARD, 'flex flex-col gap-1 p-6')}>
          <span className="text-sm text-white/60">{tp('totalPenalty')}</span>
          <span className="text-2xl font-bold tabular-nums text-red-400">-{formatUZS(totalPenalty)}</span>
        </div>
        <div className={cn(GLASS_CARD, 'flex flex-col gap-1 p-6')}>
          <span className="text-sm text-white/60">{tp('netTotal')}</span>
          <span className={cn('text-2xl font-bold tabular-nums', net >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {net >= 0 ? '+' : ''}
            {formatUZS(net)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{tp('history')}</h2>
        <PerformanceEntriesList entries={(entries ?? []) as PerformanceEntry[]} isAdmin={false} />
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('yourSubmissions')}
        </h2>
        {(submissions ?? []).length === 0 ? (
          <p className="text-sm text-white/70">{t('noSubmissions')}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {(submissions ?? []).map((s) => (
              <SubmissionCard key={s.id} submission={s as unknown as Submission} isAdmin={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
