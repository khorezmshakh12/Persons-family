'use client';

import { useMemo, useState, useTransition } from 'react';
import { Phone, Users } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { SalesLead } from '@/lib/ops-sales';
import { bulkGroupAction, bulkTrialAction } from '@/lib/actions/sales';
import { toast } from './suite-shell';
import type { OpsData } from './operations-workspace';
import { ago } from './ops-students-meta';
import { PREF_DAYS, isOpenLead, isWaiting, leadErr, sourceName } from './ops-sales-meta';

// Operation HQ › Sales, extra views (2026-11-03): «Guruh yig'ish» bundles open
// leads by Kurs · Daraja · Kun · Vaqt so a ready group is visible at a glance;
// «Bugun qo'ng'iroq» lists every lead whose next call is today or overdue.

type KeyMode = 'full' | 'level' | 'time';
const KEY_MODES: { k: KeyMode; label: string }[] = [
  { k: 'full', label: 'Kurs · Daraja · Kun · Vaqt' },
  { k: 'level', label: 'Kurs · Daraja' },
  { k: 'time', label: 'Kurs · Kun · Vaqt' },
];

function parts(l: SalesLead, mode: KeyMode): string[] {
  const course = l.course || 'Kurs ko‘rsatilmagan';
  const level = l.level || 'Daraja ?';
  const days = PREF_DAYS[l.prefDays] ?? 'Kun ?';
  const time = l.prefTime || 'Vaqt ?';
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

  const bundles = useMemo(() => {
    const m = new Map<string, { key: string; p: string[]; ls: SalesLead[] }>();
    for (const l of leads) {
      if (!isOpenLead(l, data.sales)) continue;
      const p = parts(l, mode);
      const key = p.join(' · ');
      const b = m.get(key) ?? { key, p, ls: [] };
      b.ls.push(l);
      m.set(key, b);
    }
    return [...m.values()].sort((a, b) => b.ls.length - a.ls.length || a.key.localeCompare(b.key));
  }, [leads, mode, data.sales]);

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
      toast.success(`${r.n} ta lid sinov darsiga yozildi`);
      setPicked(new Set());
      router.refresh();
    });
  const saveGroup = () =>
    start(async () => {
      if (!open) return;
      const ids = picked.size ? [...picked] : open.ls.map((l) => l.id);
      const r = await bulkGroupAction({ ids, name: open.key.slice(0, 80) });
      if (r.error) return void toast.error(leadErr(r.error));
      toast.success(`${r.n} ta lid «${open.key}» guruhiga biriktirildi`);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="sx-card flex flex-wrap items-center gap-2.5 px-5 py-3.5">
        <div className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-0.5" role="tablist" aria-label="Guruhlash kaliti">
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
              {m.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-au-muted">
          Guruh ochish uchun kamida
          <input id="gb-min" type="number" min={2} max={30} className="sx-inp !w-16 tabular-nums" value={min} onChange={(e) => setMin(Math.max(2, Math.min(30, Number(e.target.value) || 2)))} />
        </label>
        <span className="flex-1" />
        <span className="text-xs text-au-muted">
          <b className="tabular-nums text-au-ink">{total}</b> ochiq lid · <b className="tabular-nums text-au-ink">{bundles.length}</b> to‘plam ·{' '}
          <b className="tabular-nums text-au-ok">{ready}</b> tasi ochishga tayyor
        </span>
      </div>

      {bundles.length === 0 && <div className="sx-card px-5 py-6 text-sm text-au-muted">Ochiq lid yo‘q.</div>}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
        {bundles.map((b) => {
          const n = b.ls.length;
          const full = n >= min;
          const unknown = b.p.some((x) => x.endsWith('?') || x === 'Kurs ko‘rsatilmagan');
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
                {full ? <span className="sx-pl ok">Ochsa bo‘ladi</span> : n >= min - 2 ? <span className="sx-pl warn">yana {min - n} ta</span> : null}
              </span>
              <span className={cn('text-xs [overflow-wrap:anywhere]', unknown ? 'text-au-faint' : 'text-au-muted')}>{b.p.slice(1).join(' · ')}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-au-card-2">
                <i className={cn('block h-full rounded-full', full ? 'bg-au-ok' : 'bg-au-accent')} style={{ width: `${Math.min(100, (n / min) * 100)}%` }} />
              </span>
              <span className="flex items-center justify-between text-xs text-au-muted">
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" /> {n} / {min}
                </span>
                <span className="text-au-faint">eng eskisi {ago(b.ls.reduce((a, l) => (l.createdAt < a ? l.createdAt : a), b.ls[0].createdAt), now)}</span>
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
                <input id="gb-trial-d" type="date" aria-label="Sinov sanasi" min={data.today.day} className="sx-inp !w-auto" value={trialDate} onChange={(e) => setTrialDate(e.target.value)} />
                <input id="gb-trial-t" type="time" aria-label="Sinov vaqti" className="sx-inp !w-auto" value={trialTime} onChange={(e) => setTrialTime(e.target.value)} />
                <button className="sx-btn sm" disabled={pending || !picked.size || !trialDate || !trialTime} onClick={trial}>
                  Sinovga yozish ({picked.size})
                </button>
                <button className="sx-btn sm primary" disabled={pending} onClick={saveGroup} title="Lidlarni shu nomli lid guruhiga biriktiradi">
                  Guruh sifatida saqlash{picked.size ? ` (${picked.size})` : ''}
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
                        aria-label="Hammasini tanlash"
                        checked={picked.size === open.ls.length}
                        onChange={(e) => setPicked(e.target.checked ? new Set(open.ls.map((l) => l.id)) : new Set())}
                      />
                    </th>
                  )}
                  <th>Ism</th>
                  <th>Telefon</th>
                  <th>Manba</th>
                  <th>Sinov</th>
                  <th className="text-right">Kutmoqda</th>
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
                        {l.name || 'Ismsiz'}
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
          <span className="text-xs text-au-faint">Daraja, kun va vaqtni lid kartasida to‘ldiring — shunda lid to‘g‘ri to‘plamga tushadi.</span>
        </section>
      )}
    </div>
  );
}

export function CallList({ data, leads, onOpen }: { data: OpsData; leads: SalesLead[]; onOpen: (id: string) => void }) {
  const [now] = useState(() => Date.now());
  const today = data.today.day;
  const rows = leads
    .filter((l) => isOpenLead(l, data.sales) && ((l.nextAt && l.nextAt <= today) || isWaiting(l, now)))
    .sort((a, b) => Number(isWaiting(b, now)) - Number(isWaiting(a, now)) || (a.nextAt ?? '').localeCompare(b.nextAt ?? ''));

  return (
    <div className="sx-card flex flex-col gap-2 px-5 py-4">
      <div className="flex items-center gap-2">
        <Phone className="size-4 text-au-accent" />
        <b className="text-sm text-au-ink">Bugun qo‘ng‘iroq qilish kerak</b>
        <span className="text-xs tabular-nums text-au-faint">{rows.length}</span>
      </div>
      {rows.length === 0 && <div className="py-3 text-sm text-au-muted">Bugunga qo‘ng‘iroq qolmadi.</div>}
      <ul className="flex flex-col">
        {rows.map((l) => {
          const waiting = isWaiting(l, now);
          const overdue = !!l.nextAt && l.nextAt < today;
          return (
            <li key={l.id} className="border-t border-au-line first:border-t-0">
              <button className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-1 py-2.5 text-left hover:bg-au-card-2" onClick={() => onOpen(l.id)}>
                <b className="min-w-0 text-sm text-au-ink">{l.name || 'Ismsiz'}</b>
                <span className="tabular-nums text-sm text-au-muted">{l.phone}</span>
                {waiting ? (
                  <span className="sx-pl bad">Hali bog‘lanilmagan · {ago(l.createdAt, now)}</span>
                ) : (
                  <span className={cn('sx-pl', overdue ? 'bad' : 'warn')}>{overdue ? `Kechikdi · ${shortDate(l.nextAt!)}` : 'Bugun'}</span>
                )}
                <span className="min-w-0 flex-1 text-xs text-au-muted [overflow-wrap:anywhere]">
                  {[l.nextAction, l.course, l.prefTime && `qulay: ${PREF_DAYS[l.prefDays] ?? ''} ${l.prefTime}`].filter(Boolean).join(' · ')}
                </span>
                {l.owner && <span className="text-[11px] text-au-faint">{l.owner}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <span className="text-xs text-au-faint">Qo‘ng‘iroqdan keyin lid kartasida «Keyingi qadam» sanasini yangilang — lid ro‘yxatdan chiqadi.</span>
    </div>
  );
}
