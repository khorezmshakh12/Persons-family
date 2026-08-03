import { getFormatter, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { IssueWarningDialog } from './issue-warning-dialog';
import { AssignPunishmentDialog } from './assign-punishment-dialog';

export async function WarningsCard({
  staffId,
  canManage,
}: {
  staffId: string;
  /** CEO or Administrative Manager, and not viewing their own profile. */
  canManage: boolean;
}) {
  const t = await getTranslations('profile.warnings');
  const format = await getFormatter();
  const supabase = await createClient();

  const { data: warnings } = await supabase
    .from('staff_warnings')
    .select(
      'id, reason, created_at, issuer:profiles!staff_warnings_issued_by_fkey(first_name, last_name)',
    )
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('title')}
        </h2>
        {canManage && <IssueWarningDialog staffId={staffId} />}
      </div>
      {!warnings || warnings.length === 0 ? (
        <p className="text-sm text-white/60">{t('noWarnings')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {warnings.map((w) => (
            <div
              key={w.id}
              className="flex flex-col gap-2 rounded-xl border border-white/15 bg-white/5 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-white/50">
                  {format.dateTime(new Date(w.created_at), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  {w.issuer && (
                    <>
                      {' · '}
                      {t('issuedBy', { name: `${w.issuer.first_name} ${w.issuer.last_name}` })}
                    </>
                  )}
                </span>
                {canManage && <AssignPunishmentDialog staffId={staffId} warningId={w.id} />}
              </div>
              <p className="text-sm whitespace-pre-wrap text-white/90">{w.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
