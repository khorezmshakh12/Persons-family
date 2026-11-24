'use client';

import { useState, useTransition } from 'react';
import { Target, Pencil } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { MoneyInput } from '@/components/ui/money-input';
import { setBpointAction } from '@/lib/actions/bpoint';
import { addMonths, monthName as uzMonthName } from '@/lib/bpoint';
import { useLocale, useTranslations } from 'next-intl';
import { localizeMonths } from '@/lib/month-names';
import type { BpointGoalView } from '@/lib/bpoint-data';
import { formatUZS } from '@/lib/format-currency';


/** B-nuqta: xodimning OYLIK daromad maqsadi, bitta muddat uchun (yarim yil /
 * 1 yil / 3 yil). A-nuqta (muddatning birinchi maoshli oyi) → hozirgi oylik →
 * B-nuqta (maqsad oylik). */
export function BpointCard({ goal, canEdit, staffId }: { goal: BpointGoalView; canEdit: boolean; staffId: string }) {
  const { progress, note } = goal;
  const amount = progress.target;
  const [editing, setEditing] = useState(amount <= 0 && canEdit);
  const [val, setVal] = useState(amount > 0 ? String(amount) : '');
  const [noteVal, setNoteVal] = useState(note ?? '');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useTranslations('bp');
  const locale = useLocale();
  const fmt = (n: number) => `${formatUZS(Math.round(n))} ${t('uzs')}`;
  const monthName = (p: string) => localizeMonths(uzMonthName(p), locale);
  const label = t(`h.${goal.horizon}`);

  const { start: aAmount, startMonth, current, currentMonth, pct, road, gap } = progress;
  const reached = amount > 0 && current >= amount;
  const typed = Number(val.replace(/\D/g, '')) || 0;

  const save = () =>
    start(async () => {
      setErr('');
      const res = await setBpointAction({ staffId, horizon: goal.horizon, amount: typed, note: noteVal });
      if ('error' in res) return setErr(t('saveErr'));
      setEditing(false);
      router.refresh();
    });

  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col gap-4 p-5')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
            <Target className="size-4" />
          </span>
          <div>
            <span className="text-[11px] font-bold tracking-wider text-au-accent-text uppercase">B-nuqta · {label}</span>
            <h3 className="text-lg leading-tight font-bold text-au-ink">{t('title')}</h3>
            {amount > 0 && (
              <span className="block text-[11px] text-au-muted">
                {monthName(goal.start)} → {monthName(goal.end)}
                {goal.expired && t('expired')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {amount > 0 && current > 0 && <span className={cn('fp-chip', reached ? 'fp-chip-ok' : 'fp-chip-accent')}>{t('ofB', { n: pct })}</span>}
          {canEdit && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="grid size-8 place-items-center rounded-full text-au-muted hover:bg-au-card-2" aria-label={t('edit')}>
              <Pencil className="size-4" />
            </button>
          )}
        </div>
      </div>

      {amount > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="min-w-0 rounded-lg border border-au-line bg-au-card-2 p-3">
              <span className="block text-[11px] text-au-muted">{t('aPoint')}{startMonth >= 0 ? ` (${monthName(addMonths(goal.start, startMonth))})` : ''}</span>
              <span className="text-lg font-bold break-words text-au-ink tabular-nums">{aAmount > 0 ? fmt(aAmount) : '—'}</span>
            </div>
            <div className="min-w-0 rounded-lg border border-au-line bg-au-card-2 p-3">
              <span className="block text-[11px] text-au-muted">{t('now')}{currentMonth >= 0 ? ` (${monthName(addMonths(goal.start, currentMonth))})` : ''}</span>
              <span className="text-lg font-bold break-words text-au-ok tabular-nums">{current > 0 ? fmt(current) : '—'}</span>
            </div>
            <div className="min-w-0 rounded-lg border border-au-line bg-au-card-2 p-3">
              <span className="block text-[11px] text-au-muted">{t('bPoint')}</span>
              <span className="text-lg font-bold break-words text-au-accent-text tabular-nums">{fmt(amount)}</span>
            </div>
          </div>
          {note && <p className="text-xs text-au-muted">{note}</p>}
          {current > 0 ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap justify-between gap-2 text-xs">
                <span className="text-au-muted">{t('road')}</span>
                <b className={reached ? 'text-au-ok' : 'text-au-accent-text'}>
                  {reached ? t('reached') : t('progress', { p: road, gap: fmt(gap) })}
                </b>
              </div>
              <div className="fp-kpi-bar h-2.5">
                <i style={{ width: `${road}%`, background: 'linear-gradient(90deg, var(--au-accent), var(--au-ok))' }} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-au-muted">{t('noPay')}</p>
          )}
        </>
      ) : (
        !editing && <p className="text-sm text-au-muted">{t('notSet', { h: label })}</p>
      )}

      {editing && (
        <div className="flex flex-col gap-2 border-t border-au-line pt-3">
          <div className="flex items-center gap-2">
            <MoneyInput
              value={val ? Number(val.replace(/\D/g, '')) : null}
              onValue={(v) => setVal(v == null ? '' : String(v))}
              placeholder={t('ph', { h: label })}
              className="h-9 min-w-0 flex-1 rounded-au-ctl border border-au-line bg-au-card-2 px-3 text-xs text-au-ink tabular-nums outline-none focus:border-au-accent"
            />
            <button
              type="button"
              onClick={save}
              disabled={pending || !(typed > 0)}
              className="h-9 shrink-0 rounded-au-ctl bg-au-primary px-3 text-xs font-semibold text-au-primary-ink disabled:opacity-40"
            >
              {t('save')}
            </button>
          </div>
          <input
            value={noteVal}
            onChange={(e) => setNoteVal(e.target.value)}
            placeholder={t('noteOpt')}
            className="h-9 rounded-au-ctl border border-au-line bg-au-card-2 px-3 text-xs text-au-ink outline-none focus:border-au-accent"
          />
          {err && <span className="text-xs text-au-bad">{err}</span>}
          {amount > 0 && (
            <button type="button" onClick={() => setEditing(false)} className="self-start text-xs font-semibold text-au-muted hover:text-au-ink">
              {t('cancel')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
