import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { formatUZS } from '@/lib/format-currency';

const STATUS_TINT = {
  pending: 'slate',
  in_progress: 'blue',
  submitted: 'amber',
  approved: 'green',
  rejected: 'red',
} as const;

/** Read-only summary — interacting with a mission (start/submit/approve)
 * happens on /missions/[staffId], not duplicated here. This just needs to
 * show which missions contributed money to the Salary Total above. */
export async function SalaryMissionsList({ staffId }: { staffId: string }) {
  const t = await getTranslations('salary');
  const tMissions = await getTranslations('missions');
  const supabase = await createClient();
  const { data: missions } = await supabase
    .from('missions')
    .select('id, title, status, bonus_amount')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/80">{t('missions')}</h3>
        <Link href={`/missions/${staffId}`} className="text-xs text-white/60 hover:text-white hover:underline">
          {tMissions('title')}
        </Link>
      </div>
      {(missions ?? []).length === 0 ? (
        <p className="text-sm text-white/60">{tMissions('noMissions')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {(missions ?? []).map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-white">{m.title}</span>
                <Badge variant="tint" tint={STATUS_TINT[m.status as keyof typeof STATUS_TINT]} className="text-[10px]">
                  {tMissions(`statusLabels.${m.status}`)}
                </Badge>
              </div>
              {m.bonus_amount != null && (
                <span className="shrink-0 font-semibold tabular-nums text-emerald-400">{formatUZS(m.bonus_amount)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
