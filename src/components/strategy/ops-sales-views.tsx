'use client';

import { useMemo, useState, useTransition } from 'react';
import { Phone, Users } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { SalesLead } from '@/lib/ops-sales';
import { bulkGroupAction, bulkTrialAction } from '@/lib/actions/sales';
import { toast } from './suite-shell';
import type { OpsData } from './operations-workspace';
import { useTranslations } from 'next-intl';
import { useOpsMeta } from './ops-students-meta';
import { isOpenLead, isWaiting, useSalesMeta } from './ops-sales-meta';

// Operation HQ › Sales, extra views (2026-11-03): «Guruh yig'ish» bundles open
// leads by Kurs · Daraja · Kun · Vaqt so a ready group is visible at a glance;
// «Bugun qo'ng'iroq» lists every lead whose next call is today or overdue.

type KeyMode = 'full' | 'level' | 'time';
const KEY_MODES: { k: KeyMode; label: string }[] = [
  { k: 'full', label: 'mFull' },
  { k: 'level', label: 'mLevel' },
  { k: 'time', label: 'mTime' },
];

type Lbl = { noCourse: string; levelQ: string; daysQ: string; timeQ: string; days: Record<string, string> };
function parts(l: SalesLead, mode: KeyMode, lb: Lbl): string[] {
  const course = l.course || lb.noCourse;
  const level = l.level || lb.levelQ;
  const days = lb.days[l.prefDays] ?? lb.daysQ;
  const time = l.prefTime || lb.timeQ;
  return mode === 'full' ? [course, level, days, time] : mode === 'level' ? [course, level] : [course, days, time];
}

const shortDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

export function GroupBuilder({ data, leads, onOpen }: { data: OpsData; leads: SalesLead[]; onOpen: (id: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<KeyMode>('full');
  const [min, setMin] = useState(6);
  const [sel, setSel] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [trialDate, setTrialDate] = useState('');
  const [trialTime, setTrialTime] = useState('');
  const [now] = useState(() => Date.now());
  const t = useTranslations('ops.sv');
  const to = useTranslations('ops');
  const { ago } = useOpsMeta();
  const { PREF_DAYS, leadErr, sourceName } = useSalesMeta();
  const lb = useMemo<Lbl>(() => ({ noCourse: t('noCourse'), levelQ: t('levelQ'), daysQ: t('daysQ'), timeQ: t('timeQ'), days: PREF_DAYS }), [t, PREF_DAYS]);

  const bundles = useMemo(() => {
    const m = new Map<string, { key: string; p: string[]; ls: SalesLead[] }>();
    for (const l of leads) {
      if (!isOpenLead(l, data.sales)) continue;
      const p = parts(l, mode, lb);
      const key = p.join(' · ');
      const b = m.get(key) ?? { key, p, ls: [] };
      b.ls.push(l);
      m.set(key, b);
    }
    return [...m.values()].sort((a, b) => b.ls.length - a.ls.length || a.key.localeCompare(b.key));
  }, [leads, mode, data.sales, lb]);

  const ready = bundles.filter((b) => b.ls.length >= min).length;
  const open = bundles.find((b) => b.key === sel) ?? null;
  const total = bundles.reduce((n, b) => n + b.ls.length, 0);

  const pick = (key: string | null) => {
    setSel(key);
    setPicked(new Set());
    const b = bundles.find((x) => x.key === key);
    setTrialTime(b?.ls.find((l) => l.prefTime)?.prefTime ?? '');
  };
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const trial = () =>
    start(async () => {
      const r = await bulkTrialAction({ ids: [...picked], trialDate, trialTime });
      if (r.error) return void toast.error(leadErr(r.error));
      toast.success(t('trialBooked', { n: r.n ?? 0 }));
      setPicked(new Set());
      router.refresh();
    });
  const saveGroup = () =>
    start(async () => {
      if (!open) return;
      const ids = picked.size ? [...picked] : open.ls.map((l) => l.id);
      const r = await bulkGroupAction({ ids, name: open.key.slice(0, 80) });
      if (r.error) return void toast.error(leadErr(r.error));
      toast.success(t('groupSaved', { n: r.n ?? 0, name: open.key }));
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="sx-card flex flex-wrap items-center gap-2.5 px-5 py-3.5">
        <div className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-0.5" role="tablist" aria-label={t('groupKey')}>
          {KEY_MODES.map((m) => (
            <button
              key={m.k}
              role="tab"
              aria-selected={mode === m.k}
              onClick={() => {
                setMode(m.k);
                pick(null);
              }}
              className={cn('h-7 rounded-[7px] px-3 text-xs font-semibold', mode === m.k ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted hover:text-au-ink')}
            >
              {t(m.label)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-au-muted">
          {t('minToOpen')}
          <input id="gb-min" type="number" min={2} max={30} className="sx-inp !w-16 tabular-nums" value={min} onChange={(e) => setMin(Math.max(2, Math.min(30, Number(e.target.value) || 2)))} />
        </label>
        <span className="flex-1" />
        <span className="text-xs text-au-muted">
          {t('summary', { total, bundles: bundles.length, ready })}
        </span>
      </div>

      {bundles.length === 0 && <div className="sx-card px-5 py-6 text-sm text-au-muted">{t('noOpen')}</div>}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
        {bundles.map((b) => {
          const n = b.ls.length;
          const full = n >= min;
          const unknown = b.p.some((x) => x.endsWith('?') || x === lb.noCourse);
          return (
            <button
              key={b.key}
              aria-pressed={sel === b.key}
              onClick={() => pick(sel === b.key ? null : b.key)}
              className={cn(
                'flex min-w-0 flex-col gap-2 rounded-2xl border bg-au-card p-3 text-left shadow-[var(--au-shadow-card)] transition-colors hover:border-au-accent',
                sel === b.key ? 'border-au-accent ring-2 ring-au-accent-soft' : 'border-au-line',
              )}
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <b className="min-w-0 text-sm text-au-ink [overflow-wrap:anywhere]">{b.p[0]}</b>
                {full ? <span className="sx-pl ok">{t('canOpen')}</span> : n >= min - 2 ? <span className="sx-pl warn">{t('nMore', { n: min - n })}</span> : null}
              </span>
              <span className={cn('text-xs [overflow-wrap:anywhere]', unknown ? 'text-au-faint' : 'text-au-muted')}>{b.p.slice(1).join(' · ')}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-au-card-2">
                <i className={cn('block h-full rounded-full', full ? 'bg-au-ok' : 'bg-au-accent')} style={{ width: `${Math.min(100, (n / min) * 100)}%` }} />
              </span>
              <span className="flex items-center justify-between text-xs text-au-muted">
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" /> {n} / {min}
                </span>
                <span className="text-au-faint">{t('oldest', { ago: ago(b.ls.reduce((a, l) => (l.createdAt < a ? l.createdAt : a), b.ls[0].createdAt), now) })}</span>
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        <section className="sx-card flex flex-col gap-3 px-5 py-4" aria-label={open.key}>
          <div className="flex flex-wrap items-center gap-2">
            <b className="min-w-0 flex-1 text-sm text-au-ink">{open.key}</b>
            {data.canEdit && (
              <>
                <input id="gb-trial-d" type="date" aria-label={t('trialDate')} min={data.today.day} className="sx-inp !w-auto" value={trialDate} onChange={(e) => setTrialDate(e.target.value)} />
                <input id="gb-trial-t" type="time" aria-label={t('trialTime')} className="sx-inp !w-auto" value={trialTime} onChange={(e) => setTrialTime(e.target.value)} />
                <button className="sx-btn sm" disabled={pending || !picked.size || !trialDate || !trialTime} onClick={trial}>
                  {t('bookTrial', { n: picked.size })}
                </button>
                <button className="sx-btn sm primary" disabled={pending} onClick={saveGroup} title={t('saveGroupTip')}>
                  {t('saveGroup')}{picked.size ? ` (${picked.size})` : ''}
                </button>
              </>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="sx-tbl lt w-full">
              <thead>
                <tr>
                  {data.canEdit && (
                    <th className="w-8">
                      <input
                        id="gb-all"
                        type="checkbox"
                        aria-label={t('pickAll')}
                        checked={picked.size === open.ls.length}
                        onChange={(e) => setPicked(e.target.checked ? new Set(open.ls.map((l) => l.id)) : new Set())}
                      />
                    </th>
                  )}
                  <th>{t('name')}</th>
                  <th>{to('c.phone')}</th>
                  <th>{t('source')}</th>
                  <th>{t('trial')}</th>
                  <th className="text-right">{t('waiting')}</th>
                </tr>
              </thead>
              <tbody>
                {open.ls.map((l) => (
                  <tr key={l.id}>
                    {data.canEdit && (
                      <td>
                        <input type="checkbox" aria-label={l.name} checked={picked.has(l.id)} onChange={() => toggle(l.id)} />
                      </td>
                    )}
                    <td>
                      <button className="font-semibold text-au-ink hover:underline" onClick={() => onOpen(l.id)}>
                        {l.name || t('noName')}
                      </button>
                    </td>
                    <td className="tabular-nums whitespace-nowrap">{l.phone}</td>
                    <td>{sourceName(l.source)}</td>
                    <td className="whitespace-nowrap">{l.trialDate ? `${shortDate(l.trialDate)} ${l.trialTime}` : '—'}</td>
                    <td className="text-right whitespace-nowrap text-au-muted">{ago(l.createdAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="text-xs text-au-faint">{t('fillHint')}</span>
        </section>
      )}
    </div>
  );
}

export function CallList({ data, leads, onOpen }: { data: OpsData; leads: SalesLead[]; onOpen: (id: string) => void }) {
  const [now] = useState(() => Date.now());
  const t = useTranslations('ops.sv');
  const { ago } = useOpsMeta();
  const { PREF_DAYS } = useSalesMeta();
  const today = data.today.day;
  const rows = leads
    .filter((l) => isOpenLead(l, data.sales) && ((l.nextAt && l.nextAt <= today) || isWaiting(l, now)))
    .sort((a, b) => Number(isWaiting(b, now)) - Number(isWaiting(a, now)) || (a.nextAt ?? '').localeCompare(b.nextAt ?? ''));

  return (
    <div className="sx-card flex flex-col gap-2 px-5 py-4">
      <div className="flex items-center gap-2">
        <Phone className="size-4 text-au-accent" />
        <b className="text-sm text-au-ink">{t('callToday')}</b>
        <span className="text-xs tabular-nums text-au-faint">{rows.length}</span>
      </div>
      {rows.length === 0 && <div className="py-3 text-sm text-au-muted">{t('noCalls')}</div>}
      <ul className="flex flex-col">
        {rows.map((l) => {
          const waiting = isWaiting(l, now);
          const overdue = !!l.nextAt && l.nextAt < today;
          return (
            <li key={l.id} className="border-t border-au-line first:border-t-0">
              <button className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-1 py-2.5 text-left hover:bg-au-card-2" onClick={() => onOpen(l.id)}>
                <b className="min-w-0 text-sm text-au-ink">{l.name || t('noName')}</b>
                <span className="tabular-nums text-sm text-au-muted">{l.phone}</span>
                {waiting ? (
                  <span className="sx-pl bad">{t('notContacted', { ago: ago(l.createdAt, now) })}</span>
                ) : (
                  <span className={cn('sx-pl', overdue ? 'bad' : 'warn')}>{overdue ? t('late', { d: shortDate(l.nextAt!) }) : t('today')}</span>
                )}
                <span className="min-w-0 flex-1 text-xs text-au-muted [overflow-wrap:anywhere]">
                  {[l.nextAction, l.course, l.prefTime && t('pref', { days: PREF_DAYS[l.prefDays] ?? '', time: l.prefTime })].filter(Boolean).join(' · ')}
                </span>
                {l.owner && <span className="text-[11px] text-au-faint">{l.owner}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <span className="text-xs text-au-faint">{t('callHint')}</span>
    </div>
  );
}
