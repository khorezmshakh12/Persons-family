'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { BellOff, LogOut, Moon, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHIP_NEUTRAL, CHIP_OK, INPUT } from '@/lib/glass';
import { saveNotificationPrefsAction, signOutEverywhereAction } from '@/lib/actions/settings-hub';
import { NOTIFY_KINDS, NOTIFY_META, type NotifyKind } from '@/lib/notify-kinds';

const BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-au-ctl px-3.5 h-9 text-sm font-semibold transition active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none';

export function NotificationsPanel({ initial, telegram }: { initial: { muted: NotifyKind[]; quietFrom: string | null; quietTo: string | null }; telegram: boolean }) {
  const [muted, setMuted] = useState<Set<NotifyKind>>(new Set(initial.muted));
  const [quiet, setQuiet] = useState(!!initial.quietFrom);
  const [from, setFrom] = useState(initial.quietFrom?.slice(0, 5) ?? '22:00');
  const [to, setTo] = useState(initial.quietTo?.slice(0, 5) ?? '08:00');
  const [busy, start] = useTransition();
  const t = useTranslations('sh');
  const tn = useTranslations('sh.n');
  const th = useTranslations('sh.h');
  const dirty =
    [...muted].sort().join() !== [...initial.muted].sort().join() ||
    quiet !== !!initial.quietFrom ||
    (quiet && (from !== initial.quietFrom?.slice(0, 5) || to !== initial.quietTo?.slice(0, 5)));

  const toggle = (k: NotifyKind) => {
    const n = new Set(muted);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setMuted(n);
  };
  const save = () =>
    start(async () => {
      const res = await saveNotificationPrefsAction({ muted: [...muted], quietFrom: quiet ? from : null, quietTo: quiet ? to : null });
      if (res.error) return void toast.error(t('saveFail'));
      toast.success(t('saved'));
    });

  return (
    <div className="flex flex-col gap-4">
      {!telegram && (
        <p className="rounded-au-ctl bg-au-card-2 px-3 py-2 text-sm text-au-muted">{t('noTg')}</p>
      )}
      <ul className="flex flex-col divide-y divide-au-line rounded-au-ctl border border-au-line">
        {NOTIFY_KINDS.map((k) => {
          const on = !muted.has(k);
          return (
            <li key={k} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold">{tn(k)}</span>
                <span className="text-[11px] text-au-muted">{th(k)}</span>
              </div>
              {NOTIFY_META[k].quiet && quiet && on && (
                <span className={CHIP_NEUTRAL} title={t('quietTitle')}>
                  <Moon className="size-3" />
                </span>
              )}
              <button
                role="switch"
                aria-checked={on}
                onClick={() => toggle(k)}
                className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-au-ok' : 'bg-au-line')}
              >
                <i className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]', on ? 'left-[22px]' : 'left-0.5')} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 rounded-au-ctl border border-au-line p-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} />
          <Moon className="size-4 text-au-muted" /> {t('quiet')}
        </label>
        {quiet && (
          <div className="ms-pop-in flex flex-wrap items-center gap-2 text-sm">
            <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(INPUT, 'h-9 w-auto')} />
            <span className="text-au-muted">{t('from')}</span>
            <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className={cn(INPUT, 'h-9 w-auto')} />
            <span className="text-au-muted">{t('until')}</span>
          </div>
        )}
        <p className="text-[11px] text-au-muted">{t('quietHint')}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-au-muted">
          <BellOff className="size-3.5" /> {muted.size ? t('nOff', { n: muted.size }) : t('allOn')}
        </span>
        <button className={cn(BTN, 'bg-au-primary text-au-primary-ink hover:opacity-90')} disabled={busy || !dirty} onClick={save}>
          {t('save')}
        </button>
      </div>
    </div>
  );
}

export function SecurityPanel({ lastSeen, revokedAt, mustChange }: { lastSeen: string | null; revokedAt: string | null; mustChange: boolean }) {
  const [armed, setArmed] = useState(false);
  const [busy, start] = useTransition();
  const t = useTranslations('sh');
  const fmt = (s: string | null) => (s ? new Date(new Date(s).getTime() + 5 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ') : '—');
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col divide-y divide-au-line rounded-au-ctl border border-au-line text-sm">
        <div className="flex justify-between gap-3 px-3 py-2.5">
          <dt className="text-au-muted">{t('lastSeen')}</dt>
          <dd className="font-semibold tabular-nums">{fmt(lastSeen)}</dd>
        </div>
        <div className="flex justify-between gap-3 px-3 py-2.5">
          <dt className="text-au-muted">{t('lastRevoke')}</dt>
          <dd className="font-semibold tabular-nums">{fmt(revokedAt)}</dd>
        </div>
        <div className="flex justify-between gap-3 px-3 py-2.5">
          <dt className="text-au-muted">{t('pwState')}</dt>
          <dd>{mustChange ? <span className={CHIP_NEUTRAL}>{t('pwTemp')}</span> : <span className={CHIP_OK}><ShieldCheck className="size-3" /> {t('pwOwn')}</span>}</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-2 rounded-au-ctl border border-au-bad/30 bg-au-bad-soft/40 p-3">
        <span className="text-sm font-semibold">{t('signOutAll')}</span>
        <span className="text-xs text-au-muted">{t('signOutHint')}</span>
        {armed ? (
          <div className="flex gap-2">
            <button
              className={cn(BTN, 'bg-au-bad text-white hover:opacity-90')}
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const res = await signOutEverywhereAction();
                  if (res?.error) toast.error(t('failed'));
                })
              }
            >
              <LogOut className="size-4" /> {t('yesAll')}
            </button>
            <button className={cn(BTN, 'border border-au-line bg-au-card')} onClick={() => setArmed(false)}>
              {t('cancel')}
            </button>
          </div>
        ) : (
          <button className={cn(BTN, 'w-fit border border-au-bad/40 bg-au-card text-au-bad')} onClick={() => setArmed(true)}>
            <LogOut className="size-4" /> {t('signOut')}
          </button>
        )}
      </div>
    </div>
  );
}
