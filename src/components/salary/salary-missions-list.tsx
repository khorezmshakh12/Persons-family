import { getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { formatUZS } from '@/lib/format-currency';

/** Read-only archive. The Missions section was removed from the site, but
 * bonuses from missions approved before that are still part of the salary
 * pay of the month they were approved in (pay run), so that month lists them. Renders nothing for staff who never had one. */
export async function SalaryMissionsList({ staffId, month }: { staffId: string; month: string }) {
  const t = await getTranslations('salary');
  const missions = await sql<{ id: string; title: string; bonus_amount: number }[]>`
    select id, title, bonus_amount from missions
    where staff_id = ${staffId} and status = 'approved' and bonus_amount is not null
      and to_char(coalesce(approved_at, created_at) at time zone 'Asia/Tashkent', 'YYYY-MM') = ${month}
    order by coalesce(approved_at, created_at) desc
  `;
  if (missions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-au-ink">{t('missions')}</h3>
      <div className="flex flex-col gap-2">
        {missions.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-au-line bg-au-card-2 px-3 py-2 text-sm"
          >
            <span className="min-w-0 truncate text-au-ink">{m.title}</span>
            <span className="shrink-0 font-semibold tabular-nums text-emerald-600">{formatUZS(m.bonus_amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
