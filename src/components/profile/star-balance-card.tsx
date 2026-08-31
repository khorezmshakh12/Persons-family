import { getFormatter, getTranslations } from 'next-intl/server';
import { getStarLedgerAction } from '@/lib/actions/stars';
import { getStarBalance } from '@/lib/stars';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

/**
 * Stars are a standalone currency (see src/lib/stars.ts) — a balance is
 * never a stored column, it's the running sum of the append-only ledger,
 * which is why this card shows the two together: the number only makes
 * sense next to the rows that produced it.
 *
 * getStarLedgerAction enforces its own visibility rule (own ledger, or CEO
 * reading anyone's) and returns [] otherwise, so this component can be
 * rendered without the caller re-deriving that.
 */
export async function StarBalanceCard({ staffId }: { staffId: string }) {
  const t = await getTranslations('profile.stars');
  const format = await getFormatter();

  const [balance, ledger] = await Promise.all([getStarBalance(staffId), getStarLedgerAction(staffId)]);

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('title')}
        </h2>
        <span className="font-heading text-2xl font-bold text-white">{t('starCount', { count: balance })}</span>
      </div>

      {ledger.length === 0 ? (
        <p className="text-sm text-white/60">{t('noTransactions')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {ledger.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/15 bg-white/5 p-4"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm text-white/90">{entry.reason || t(`source.${entry.source_type}`)}</span>
                <span className="text-xs text-white/50">
                  {format.dateTime(new Date(entry.created_at), { dateStyle: 'medium', timeStyle: 'short' })}
                  {entry.created_by_first_name && (
                    <>
                      {' · '}
                      {t('byName', { name: `${entry.created_by_first_name} ${entry.created_by_last_name}` })}
                    </>
                  )}
                </span>
              </div>
              <span
                className={cn(
                  'shrink-0 text-sm font-semibold',
                  entry.delta < 0 ? 'text-red-300' : 'text-emerald-300',
                )}
              >
                {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
