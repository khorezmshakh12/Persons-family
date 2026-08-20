import { getFormatter, getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
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

  const warnings = await sql<
    { id: string; reason: string; created_at: string; issuer_first_name: string | null; issuer_last_name: string | null }[]
  >`
    select w.id, w.reason, w.created_at, issuer.first_name as issuer_first_name, issuer.last_name as issuer_last_name
    from staff_warnings w
    left join profiles issuer on issuer.id = w.issued_by
    where w.staff_id = ${staffId}
    order by w.created_at desc
  `;

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('title')}
        </h2>
        {canManage && <IssueWarningDialog staffId={staffId} />}
      </div>
      {warnings.length === 0 ? (
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
                  {w.issuer_first_name && (
                    <>
                      {' · '}
                      {t('issuedBy', { name: `${w.issuer_first_name} ${w.issuer_last_name}` })}
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
