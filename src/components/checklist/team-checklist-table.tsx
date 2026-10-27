import { getTranslations } from 'next-intl/server';
import { ROLES } from '@/lib/permissions';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/navigation';
import type { TeamStatRow } from '@/lib/checklist-stats';

/** CEO/COO team view: today's daily-checklist completion for every employee,
 * the old tracker's summary table. Completed rows float to the top; off-lesson
 * teachers sink to the bottom with a "dars yo'q" note instead of a false 0%. */
export async function TeamChecklistTable({ rows }: { rows: TeamStatRow[] }) {
  const tRoles = await getTranslations('staff.roles');
  const roleLabel = (r: string) => ((ROLES as readonly string[]).includes(r) ? tRoles(r) : r);

  const sorted = [...rows].sort((a, b) => {
    if (a.lesson !== b.lesson) return a.lesson ? -1 : 1;
    if (b.pct !== a.pct) return b.pct - a.pct;
    return a.name.localeCompare(b.name);
  });

  const active = rows.filter((r) => r.lesson);
  const fullyDone = active.filter((r) => r.total > 0 && r.done >= r.total).length;
  const avg = active.length ? Math.round(active.reduce((s, r) => s + r.pct, 0) / active.length) : 0;

  return (
    <div className={cn(SURFACE_CARD, 'flex flex-col gap-4 p-5')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-au-ink">Jamoa · bugun</h2>
        <div className="flex items-center gap-4 text-sm text-au-muted">
          <span>
            To‘liq bajardi: <b className="tabular-nums text-au-ink">{fullyDone}/{active.length}</b>
          </span>
          <span>
            O‘rtacha: <b className="tabular-nums text-au-ink">{avg}%</b>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-au-ctl border border-au-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-au-line text-left text-xs text-au-muted">
              <th className="px-3 py-2 font-semibold">Xodim</th>
              <th className="px-3 py-2 font-semibold">Rol</th>
              <th className="w-40 px-3 py-2 font-semibold">Bajarildi</th>
              <th className="w-14 px-3 py-2 text-right font-semibold">%</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.userId} className="border-b border-au-line last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/profile/${r.userId}`} className="font-medium text-au-ink hover:text-au-accent-text">
                    {r.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-au-muted">{roleLabel(r.role)}</td>
                <td className="px-3 py-2">
                  {r.lesson ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-au-line">
                        <div
                          className={cn('h-full rounded-full', r.pct >= 100 ? 'bg-au-accent' : 'bg-au-accent/60')}
                          style={{ width: `${r.pct}%` }}
                        />
                      </div>
                      <span className="shrink-0 tabular-nums text-au-muted">
                        {r.done}/{r.total}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-au-faint">dars yo‘q</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-au-ink">
                  {r.lesson ? `${r.pct}%` : '—'}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-au-muted">
                  Checklistli xodim topilmadi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
