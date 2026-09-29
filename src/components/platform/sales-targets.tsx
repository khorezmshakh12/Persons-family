'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/navigation';
import { setSalesTargetAction } from '@/lib/actions/platform';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type TargetRow = { month: string; leads: number; won: number; current: boolean };

/** Monthly lead / contract targets for the Sales section and dashboard card. */
export function SalesTargets({ rows }: { rows: TargetRow[] }) {
  const t = useTranslations('platform.targets');
  const locale = useLocale();
  const router = useRouter();
  const [vals, setVals] = useState(() =>
    Object.fromEntries(rows.map((r) => [r.month, { leads: String(r.leads), won: String(r.won) }])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const label = (m: string) =>
    new Date(`${m}-01T12:00:00Z`).toLocaleDateString(locale === 'uz' ? 'uz-Latn' : locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

  const save = (m: string) => {
    const v = vals[m];
    const leads = Number(v.leads);
    const won = Number(v.won);
    if (!Number.isInteger(leads) || !Number.isInteger(won) || leads < 0 || won < 0) return void toast.error(t('invalid'));
    if (leads > 0 && won > leads) return void toast.error(t('wonOverLeads'));
    setBusy(m);
    start(async () => {
      const res = await setSalesTargetAction(m, leads, won);
      setBusy(null);
      if (res?.error) return void toast.error(t('failed'));
      toast.success(t('saved', { month: label(m) }));
      router.refresh();
    });
  };

  return (
    <div className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-4 sm:p-5')}>
      <p className="text-sm text-au-muted">{t('hint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => {
          const v = vals[r.month];
          const dirty = v.leads !== String(r.leads) || v.won !== String(r.won);
          return (
            <form
              key={r.month}
              onSubmit={(e) => {
                e.preventDefault();
                save(r.month);
              }}
              className={cn(
                'flex flex-col gap-3 rounded-au-ctl border p-4 transition-shadow hover:shadow-[var(--au-shadow-card)]',
                r.current ? 'border-au-accent bg-au-accent-soft/40' : 'border-au-line bg-au-card-2',
              )}
            >
              <div className="flex items-center justify-between">
                <b className="text-au-ink capitalize">{label(r.month)}</b>
                {r.current && (
                  <span className="rounded-full bg-au-accent-soft px-2 py-0.5 text-[11px] font-semibold text-au-accent-text">{t('current')}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['leads', 'won'] as const).map((k) => (
                  <label key={k} className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
                    {t(k)}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={v[k]}
                      onChange={(e) => setVals((s) => ({ ...s, [r.month]: { ...s[r.month], [k]: e.target.value } }))}
                      className="h-10 rounded-au-ctl border border-au-line bg-au-card px-3 text-base font-bold text-au-ink tabular-nums"
                    />
                  </label>
                ))}
              </div>
              <button
                type="submit"
                disabled={!dirty || busy !== null}
                className="h-9 rounded-au-ctl bg-au-primary text-sm font-semibold text-au-primary-ink transition-opacity disabled:opacity-40"
              >
                {busy === r.month ? t('saving') : t('save')}
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
