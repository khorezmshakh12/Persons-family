import { getLocale, getTranslations } from 'next-intl/server';
import { Wallet } from 'lucide-react';
import { getStaffPayroll } from '@/lib/payroll';
import { startOfTashkentMonthKey } from '@/lib/time';
import { formatUZS } from '@/lib/format-currency';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

/**
 * This month's salary for one staff member, mirrored from the CEO's Finance
 * module — same source (`getStaffPayroll`), so the two never disagree.
 */
export async function SalaryCard({ staffId }: { staffId: string }) {
  const t = await getTranslations('finance.payroll');
  const locale = await getLocale();
  const period = startOfTashkentMonthKey();
  const p = await getStaffPayroll(staffId, period);

  const monthName = new Date(`${period}T00:00:00Z`).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-3 p-6')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-au-ink">
          <Wallet className="size-4 text-emerald-700" />
          {t('title')}
        </h2>
        <span className="text-xs capitalize text-au-muted">{monthName}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Fig label={t('gross')} value={formatUZS(p.gross)} />
        <Fig label={t('paid')} value={formatUZS(p.paid)} tone="text-emerald-700" />
        <Fig
          label={t('remaining')}
          value={formatUZS(p.remaining)}
          tone={p.remaining > 0 ? 'text-amber-700' : 'text-au-muted'}
        />
      </div>

      {p.entries.length > 0 && (
        <ul className="flex flex-col divide-y divide-au-line text-sm">
          {p.entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate text-au-ink">{e.title}</span>
              <span
                className={cn(
                  'shrink-0 tabular-nums',
                  e.amount < 0 ? 'text-red-600' : 'text-au-muted',
                )}
              >
                {e.amount >= 0 ? '+' : ''}
                {formatUZS(e.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-au-muted">{label}</span>
      <span className={cn('text-sm font-bold tabular-nums', tone ?? 'text-au-ink')}>{value}</span>
    </div>
  );
}
