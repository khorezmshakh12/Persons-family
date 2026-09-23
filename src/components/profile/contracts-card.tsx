import { getFormatter, getTranslations } from 'next-intl/server';
import { Clock3 } from 'lucide-react';
import { sql } from '@/lib/db/client';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { CreateContractDialog } from './create-contract-dialog';
import { EditContractDialog } from './edit-contract-dialog';
import { ContractAttachmentsList } from './contract-attachments-list';
import { RequestContractActionDialog } from './request-contract-action-dialog';
import { ReviewContractRequestControls } from './review-contract-request-controls';

const STATUS_TINT: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-700',
  frozen: 'bg-blue-500/20 text-blue-700',
  ended: 'bg-au-card-2 text-au-muted',
};

const REQUEST_STATUS_TINT: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-700',
  approved: 'bg-emerald-500/20 text-emerald-700',
  rejected: 'bg-red-500/20 text-red-700',
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

  const contracts = await sql<
    { id: string; title: string; start_date: string; end_date: string | null; status: string; created_at: string }[]
  >`
    select id, title, start_date, end_date, status, created_at from staff_contracts
    where staff_id = ${staffId}
    order by created_at desc
  `;

  const hasActiveContract = contracts.some((c) => c.status === 'active');

  // Staff sees "Coming Soon" until the CEO has created an active contract
  // for them — the CEO always sees the real management UI instead (create/
  // edit/attach), never this placeholder, per the spec's explicit carve-out.
  if (isSelf && !canManage && !hasActiveContract) {
    return (
      <div className={cn(GLASS_CARD, 'flex flex-col items-center gap-3 p-8 text-center')}>
        <Clock3 className="size-8 text-au-muted" />
        <h2 className="font-heading text-lg font-semibold text-au-ink">{t('title')}</h2>
        <p className="max-w-sm text-sm text-au-muted">{t('comingSoon')}</p>
      </div>
    );
  }

  const contractIds = contracts.map((c) => c.id);
  const [attachments, requests] = await Promise.all([
    contractIds.length > 0
      ? sql<{ id: string; contract_id: string; file_name: string; file_type: string | null }[]>`
          select id, contract_id, file_name, file_type from contract_attachments
          where contract_id in ${sql(contractIds)}
        `
      : Promise.resolve([]),
    contractIds.length > 0
      ? sql<
          { id: string; contract_id: string; request_type: 'freeze' | 'extend'; status: string; reason: string | null; created_at: string }[]
        >`
          select id, contract_id, request_type, status, reason, created_at from contract_requests
          where contract_id in ${sql(contractIds)}
          order by created_at desc
        `
      : Promise.resolve([]),
  ]);

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-au-ink">
          {t('title')}
        </h2>
        {canManage && <CreateContractDialog staffId={staffId} />}
      </div>

      {contracts.length === 0 ? (
        <p className="text-sm text-au-muted">{t('noContracts')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {contracts.map((contract) => {
            const contractAttachments = attachments.filter((a) => a.contract_id === contract.id);
            const contractRequests = requests.filter((r) => r.contract_id === contract.id);
            const hasPendingRequest = contractRequests.some((r) => r.status === 'pending');

            return (
              <div
                key={contract.id}
                className="flex flex-col gap-3 rounded-xl border border-au-line bg-au-card-2 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-au-ink">{contract.title}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-semibold',
                        STATUS_TINT[contract.status] ?? 'bg-au-card-2 text-au-muted',
                      )}
                    >
                      {t(`status.${contract.status}`)}
                    </span>
                    {canManage && (
                      <EditContractDialog
                        contract={{
                          id: contract.id,
                          staffId,
                          title: contract.title,
                          startDate: contract.start_date,
                          endDate: contract.end_date,
                          status: contract.status as 'active' | 'frozen' | 'ended',
                        }}
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-au-muted">
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
                  <div className="flex flex-col gap-2 border-t border-au-line pt-3">
                    <span className="text-xs font-semibold text-au-muted">{t('requests')}</span>
                    {contractRequests.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-au-ink">
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
                          {r.reason && <span className="text-xs text-au-muted">— {r.reason}</span>}
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
