import { getLocale, getTranslations } from 'next-intl/server';
import { TrendingUp } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { CARD_LINK, CARD_TITLE, SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { SalesSnapshot } from '@/lib/core-state';

/** Dashboard Sales card — this month's leads / contracts / CAC, the 7-day
 * lead flow and the top channels, from the Sales section's own data
 * (loadSalesSnapshot, same formulas as the Sales page). */
export async function SalesCard({ data, className }: { data: SalesSnapshot; className?: string }) {
  const t = await getTranslations('salesCard');
  const locale = await getLocale();
  const num = (v: number) => Math.round(v).toLocaleString(locale);
  const max = Math.max(1, ...data.flow.map((f) => f.n));
  const tiles = [
    { label: t('leads'), value: num(data.leads), sub: data.targetLeads ? `/ ${num(data.targetLeads)}` : t('noTarget') },
    { label: t('contracts'), value: num(data.won), sub: data.targetWon ? `/ ${num(data.targetWon)}` : t('noTarget') },
    { label: t('conversion'), value: `${data.conv.toFixed(1)}%`, sub: '' },
    { label: 'CAC', value: data.won ? num(data.cac) : '—', sub: t('spend', { v: num(data.spend) }) },
  ];
  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col gap-4 p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
          <TrendingUp className="size-4 text-au-accent-text" /> {t('title')}
        </h2>
        <Link href="/sales" className={CARD_LINK}>
          {t('open')}
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-au-ctl bg-au-card-2 p-3">
            <div className="text-xs text-au-muted">{x.label}</div>
            <div className="text-xl font-bold tabular-nums text-au-ink">
              {x.value} <span className="text-sm font-medium text-au-muted">{x.sub}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold text-au-muted">{t('flow')}</div>
          <div className="flex h-24 items-end gap-1.5">
            {data.flow.map((f) => (
              <div key={f.day} className="flex flex-1 flex-col items-center gap-1" title={`${f.day}: ${f.n}`}>
                <span className="text-[10px] tabular-nums text-au-muted">{f.n || ''}</span>
                <div className="w-full rounded-t bg-au-accent" style={{ height: `${Math.max(3, (f.n / max) * 64)}px`, opacity: f.n ? 1 : 0.25 }} />
                <span className="text-[10px] text-au-faint">{f.day.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-au-muted">{t('channels')}</div>
          {data.channels.length === 0 ? (
            <p className="py-6 text-center text-sm text-au-muted">{t('empty')}</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.channels.slice(0, 4).map((c) => (
                  <tr key={c.k} className="border-b border-au-line last:border-0">
                    <td className="py-1.5 text-au-ink">{c.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{t('leadsN', { n: c.n })}</td>
                    <td className="py-1.5 text-right tabular-nums text-au-ok">{t('wonN', { n: c.won })}</td>
                    <td className="py-1.5 text-right tabular-nums text-au-muted">CPL {c.n ? num(c.cpl) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
