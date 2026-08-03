import { getFormatter, getTranslations } from 'next-intl/server';
import { Clock3 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { CreateContractDialog } from './create-contract-dialog';
import { ContractAttachmentsList } from './contract-attachments-list';
import { RequestContractActionDialog } from './request-contract-action-dialog';
import { ReviewContractRequestControls } from './review-contract-request-controls';

const STATUS_TINT: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-200',
  frozen: 'bg-blue-500/20 text-blue-200',
  ended: 'bg-white/15 text-white/70',
};

const REQUEST_STATUS_TINT: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-200',
  approved: 'bg-emerald-500/20 text-emerald-200',
  rejected: 'bg-red-500/20 text-red-200',
};

export async function ContractsCard({
  staffId,
  isSelf,
  canManage,
}: {
  staffId: string;
  isSelf: boolean;
  /** CEO viewing someone else's profile. */
  canManage: boolean;
}) {
  const t = await getTranslations('profile.contracts');
  const format = await getFormatter();
  const supabase = await createClient();

  const { data: contracts } = await supabase
    .from('staff_contracts')
    .select('id, title, start_date, end_date, status, created_at')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });

  const hasActiveContract = (contracts ?? []).some((c) => c.status === 'active');

  // Staff sees "Coming Soon" until the CEO has created an active contract
  // for them — the CEO always sees the real management UI instead (create/
  // edit/attach), never this placeholder, per the spec's explicit carve-out.
  if (isSelf && !canManage && !hasActiveContract) {
    return (
      <div className={cn(GLASS_CARD, 'flex flex-col items-center gap-3 p-8 text-center')}>
        <Clock3 className="size-8 text-white/40" />
        <h2 className="text-lg font-semibold text-white">{t('title')}</h2>
        <p className="max-w-sm text-sm text-white/60">{t('comingSoon')}</p>
      </div>
    );
  }

  const contractIds = (contracts ?? []).map((c) => c.id);
  const [{ data: attachments }, { data: requests }] = await Promise.all([
    contractIds.length > 0
      ? supabase
          .from('contract_attachments')
          .select('id, contract_id, file_name, file_type')
          .in('contract_id', contractIds)
      : Promise.resolve({ data: [] }),
    contractIds.length > 0
      ? supabase
          .from('contract_requests')
          .select('id, contract_id, request_type, status, reason, created_at')
          .in('contract_id', contractIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('title')}
        </h2>
        {canManage && <CreateContractDialog staffId={staffId} />}
      </div>

      {!contracts || contracts.length === 0 ? (
        <p className="text-sm text-white/60">{t('noContracts')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {contracts.map((contract) => {
            const contractAttachments = (attachments ?? []).filter(
              (a) => a.contract_id === contract.id,
            );
            const contractRequests = (requests ?? []).filter((r) => r.contract_id === contract.id);
            const hasPendingRequest = contractRequests.some((r) => r.status === 'pending');

            return (
              <div
                key={contract.id}
                className="flex flex-col gap-3 rounded-xl border border-white/15 bg-white/5 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-white">{contract.title}</span>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-semibold',
                      STATUS_TINT[contract.status] ?? 'bg-white/15 text-white/70',
                    )}
                  >
                    {t(`status.${contract.status}`)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-white/60">
                  <span>
                    {t('startDate')}:{' '}
                    {format.dateTime(new Date(`${contract.start_date}T00:00:00Z`), {
                      dateStyle: 'medium',
                      timeZone: 'UTC',
                    })}
                  </span>
                  <span>
                    {t('endDate')}:{' '}
                    {contract.end_date
                      ? format.dateTime(new Date(`${contract.end_date}T00:00:00Z`), {
                          dateStyle: 'medium',
                          timeZone: 'UTC',
                        })
                      : t('noEndDate')}
                  </span>
                </div>

                <ContractAttachmentsList
                  contractId={contract.id}
                  attachments={contractAttachments}
                  canManage={canManage}
                />

                {isSelf && contract.status === 'active' && !hasPendingRequest && (
                  <div className="flex flex-wrap gap-2">
                    <RequestContractActionDialog contractId={contract.id} requestType="freeze" />
                    <RequestContractActionDialog contractId={contract.id} requestType="extend" />
                  </div>
                )}

                {contractRequests.length > 0 && (
                  <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
                    <span className="text-xs font-semibold text-white/60">{t('requests')}</span>
                    {contractRequests.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-white/85">
                            {t(`requestType.${r.request_type}`)}
                          </span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                              REQUEST_STATUS_TINT[r.status],
                            )}
                          >
                            {t(`requestStatus.${r.status}`)}
                          </span>
                          {r.reason && <span className="text-xs text-white/50">— {r.reason}</span>}
                        </div>
                        {canManage && r.status === 'pending' && (
                          <ReviewContractRequestControls
                            requestId={r.id}
                            requestType={r.request_type}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
