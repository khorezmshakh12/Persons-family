'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, GripVertical, Minus, Plus, Search, UserRound } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { tashkentDayKey } from '@/lib/time';
import { placeGroupAction, quickIntakeAction } from '@/lib/actions/operations';
import { playSound, toast } from './suite-shell';
import type { OpsData, Source } from './operations-workspace';

type Group = OpsData['groups'][number];
type Cohort = 'odd' | 'even';
const COHORT_NAME: Record<Cohort, string> = { odd: 'Toq kunlar', even: 'Juft kunlar' };

/* ------------------------------------------------------------ conflicts */

export type Conflict = { kind: 'room' | 'teacher'; cohort: Cohort; time: string; where: string; groups: string[] };

/** Room double-bookings and a teacher in two places at once, both cohorts. */
export function findConflicts(groups: Group[]): Conflict[] {
  const ok = groups.filter((g) => g.room && g.time && g.schedule_type);
  const out: Conflict[] = [];
  const bucket = (key: (g: Group) => string) => {
    const m = new Map<string, Group[]>();
    for (const g of ok) m.set(key(g), [...(m.get(key(g)) ?? []), g]);
    return [...m.values()].filter((l) => l.length > 1);
  };
  for (const l of bucket((g) => `${g.schedule_type}|${g.time}|${g.room}`))
    out.push({ kind: 'room', cohort: l[0].schedule_type!, time: l[0].time, where: l[0].room, groups: l.map((g) => g.name) });
  for (const l of bucket((g) => `${g.schedule_type}|${g.time}|${g.teacher}`).filter((l) => l[0].teacher))
    out.push({ kind: 'teacher', cohort: l[0].schedule_type!, time: l[0].time, where: l[0].teacher, groups: l.map((g) => `${g.name} (${g.room})`) });
  return out;
}

export function ConflictsCard({ conflicts }: { conflicts: Conflict[] }) {
  return (
    <div className="sx-card s6">
      <div className="sx-h">
        <h3>To‘qnashuvlar</h3>
        <small>{conflicts.length ? `${conflicts.length} ta — tuzatish kerak` : 'yo‘q'}</small>
      </div>
      {conflicts.length === 0 ? (
        <div className="sx-empty">Xona va o‘qituvchi bo‘yicha to‘qnashuv yo‘q ✓</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {conflicts.map((c, i) => (
            <li key={i} className="ms-rise flex items-start gap-2 rounded-lg border border-au-bad/30 bg-au-bad-soft px-3 py-2 text-sm" style={{ ['--i' as string]: Math.min(i, 8) }}>
              {c.kind === 'room' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-au-bad" /> : <UserRound className="mt-0.5 size-4 shrink-0 text-au-bad" />}
              <span className="min-w-0">
                <b className="text-au-ink">
                  {c.kind === 'room' ? `${c.where} xonasi` : c.where} · {c.time} · {COHORT_NAME[c.cohort]}
                </b>
                <span className="block text-xs text-au-muted">{c.groups.join(' · ')}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ teacher load */

/** Lessons per week per teacher (each scheduled group meets 3× a week). */
export function TeacherLoadCard({ groups, limit = 18 }: { groups: Group[]; limit?: number }) {
  const rows = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups) if (g.teacher && g.time && g.schedule_type) m.set(g.teacher, (m.get(g.teacher) ?? 0) + 3);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [groups]);
  const max = Math.max(limit, ...rows.map((r) => r[1]));
  return (
    <div className="sx-card s6">
      <div className="sx-h">
        <h3>O‘qituvchi yuklamasi</h3>
        <small>haftalik darslar · chegara {limit}</small>
      </div>
      {rows.length === 0 ? (
        <div className="sx-empty">—</div>
      ) : (
        <div className="flex max-h-[260px] flex-col gap-1.5 overflow-auto">
          {rows.map(([name, n], i) => (
            <div key={name} className="grid grid-cols-[140px_1fr_40px] items-center gap-2 text-sm">
              <span className="truncate font-medium text-au-ink">{name}</span>
              <span className="relative h-2.5 overflow-hidden rounded-full bg-au-card-2">
                <span
                  className={cn('ms-fill absolute inset-y-0 left-0 rounded-full', n > limit ? 'bg-au-bad' : n >= limit - 3 ? 'bg-au-accent' : 'bg-au-ok')}
                  style={{ width: `${(n / max) * 100}%`, animationDelay: `${i * 40}ms` }}
                />
                <i className="absolute inset-y-0 w-px bg-au-ink/40" style={{ left: `${(limit / max) * 100}%` }} aria-hidden />
              </span>
              <b className={cn('text-right tabular-nums', n > limit ? 'text-au-bad' : 'text-au-ink')}>{n}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ slot finder */

export type Finder = { time: string; minCap: number };

export function SlotFinderBar({ times, value, onChange, matches }: { times: string[]; value: Finder | null; onChange: (f: Finder | null) => void; matches: number }) {
  const v = value ?? { time: '', minCap: 0 };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-au-ok/50 bg-au-ok-soft/40 px-3 py-2 text-sm">
      <Search className="size-4 text-au-ok" aria-hidden />
      <b className="text-au-ink">Bo‘sh joy topish</b>
      <select className="sx-inp !h-[30px] !w-[130px]" value={v.time} onChange={(e) => onChange({ ...v, time: e.target.value })} aria-label="Vaqt">
        <option value="">Har qanday vaqt</option>
        {times.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <label className="inline-flex items-center gap-1.5 text-xs text-au-muted">
        kamida
        <input className="sx-inp !h-[30px] !w-[70px]" type="number" min={0} max={200} value={v.minCap || ''} placeholder="0" onChange={(e) => onChange({ ...v, minCap: Number(e.target.value) || 0 })} />
        o‘rin
      </label>
      {value && (
        <>
          <span key={matches} className="lane-count rounded-full bg-au-ok px-2.5 py-0.5 text-xs font-bold text-white tabular-nums">
            {matches} ta mos slot
          </span>
          <button className="text-xs font-semibold text-au-muted hover:text-au-ink" onClick={() => onChange(null)}>
            Tozalash
          </button>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ placing groups */

/** Unscheduled groups as draggable chips (or tap-to-pick on touch); the
 * matrix drops them into a free cell through placeGroupAction. */
export function UnscheduledGroups({ groups, picked, onPick }: { groups: Group[]; picked: string | null; onPick: (id: string | null) => void }) {
  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Jadvalga kiritilmagan guruhlar</h3>
        <small>{groups.length ? `${groups.length} ta · bo‘sh slotga sudrang yoki bosib tanlang` : ''}</small>
      </div>
      {groups.length === 0 ? (
        <div className="sx-empty">Hamma guruhlar jadvalda ✓</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {groups.map((g, i) => (
            <button
              key={g.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/group', g.id);
                e.dataTransfer.effectAllowed = 'move';
                onPick(g.id);
              }}
              onDragEnd={() => onPick(null)}
              onClick={() => onPick(picked === g.id ? null : g.id)}
              aria-pressed={picked === g.id}
              className={cn(
                'ms-rise inline-flex cursor-grab items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors active:cursor-grabbing',
                picked === g.id ? 'ms-pulse border-au-accent bg-au-accent text-au-accent-ink' : 'border-au-line bg-au-card text-au-ink hover:border-au-accent',
              )}
              style={{ ['--i' as string]: Math.min(i, 8) }}
            >
              <GripVertical className="size-3.5 opacity-60" aria-hidden />
              {g.name}
              <span className="text-[11px] font-normal opacity-70">{g.teacher}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function usePlaceGroup() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const place = (groupId: string, room: string, time: string, cohort: Cohort, onDone?: () => void) =>
    start(async () => {
      const r = await placeGroupAction({ groupId, room, time, cohort });
      if (r.error) {
        toast.error(r.error === 'slotTaken' ? 'Bu slot band' : r.error === 'teacherBusy' ? 'O‘qituvchi bu vaqtda boshqa guruhda' : r.error === 'forbidden' ? "Ruxsat yo'q" : "Saqlab bo'lmadi");
        return;
      }
      playSound('tick');
      toast.success(`Guruh ${room} · ${time} ga joylandi`);
      onDone?.();
      router.refresh();
    });
  return { place, busy };
}

/* ------------------------------------------------------------ intake */

const SRC: { k: Source; n: string; c: string }[] = [
  { k: 'instagram', n: 'Instagram', c: '#e8567a' },
  { k: 'telegram', n: 'Telegram', c: '#2477c9' },
  { k: 'referral', n: 'Tavsiya', c: '#139a52' },
  { k: 'meta', n: 'Meta reklama', c: '#1877f2' },
  { k: 'google', n: 'Google', c: '#34a853' },
  { k: 'walkin', n: 'O‘zi keldi', c: '#ff9f1c' },
  { k: 'website', n: 'Veb-sayt', c: '#7a5af8' },
  { k: 'other', n: 'Boshqa', c: '#b9b2a6' },
];

/** Log arrivals in seconds: pick a source, set how many, done. */
export function QuickIntake() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [source, setSource] = useState<Source>('instagram');
  const [count, setCount] = useState(1);
  const [course, setCourse] = useState('');
  const [bump, setBump] = useState(0);
  const submit = () =>
    start(async () => {
      const r = await quickIntakeAction({ source, count, course });
      if (r.error) return void toast.error(r.error === 'forbidden' ? "Ruxsat yo'q" : "Saqlab bo'lmadi");
      playSound('tick');
      setBump((b) => b + 1);
      toast.success(`+${count} · ${SRC.find((s) => s.k === source)?.n}`);
      setCount(1);
      router.refresh();
    });
  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Kelganlarni kiritish</h3>
        <small>statistika uchun · ism shart emas</small>
        <span key={bump} className={cn('ml-auto text-xs font-bold text-au-ok', bump && 'ms-pop-in')}>
          {bump ? '✓ Qo‘shildi' : ''}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SRC.map((s) => (
          <button
            key={s.k + (source === s.k ? '-on' : '')}
            type="button"
            onClick={() => setSource(s.k)}
            aria-pressed={source === s.k}
            className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors', source === s.k ? 'ms-pop-in border-transparent text-white' : 'border-au-line bg-au-card text-au-muted hover:text-au-ink')}
            style={source === s.k ? { background: s.c } : undefined}
          >
            <i className="size-2 rounded-full" style={{ background: source === s.k ? '#fff' : s.c }} />
            {s.n}
          </button>
        ))}
        <input className="sx-inp !h-9 !w-[160px]" maxLength={120} placeholder="Kurs (ixtiyoriy)" value={course} onChange={(e) => setCourse(e.target.value)} />
        <div className="inline-flex h-9 items-center rounded-full border border-au-line bg-au-card">
          <button type="button" aria-label="Kamaytirish" className="grid size-9 place-items-center text-au-muted hover:text-au-ink" onClick={() => setCount((c) => Math.max(1, c - 1))}>
            <Minus className="size-4" />
          </button>
          <b key={count} className="lane-count w-7 text-center tabular-nums">
            {count}
          </b>
          <button type="button" aria-label="Ko‘paytirish" className="grid size-9 place-items-center text-au-muted hover:text-au-ink" onClick={() => setCount((c) => Math.min(30, c + 1))}>
            <Plus className="size-4" />
          </button>
        </div>
        <button className="sx-btn primary !h-9" disabled={busy} onClick={submit}>
          <Plus className="size-4" /> {count} ta qo‘shish
        </button>
      </div>
    </div>
  );
}

/** This month's arrivals per day (bars) with the cumulative line against
 * the 3-month average pace, and an end-of-month projection. */
export function IntakeTrend({ leads, today, pacePerMonth }: { leads: OpsData['leads']; today: string; pacePerMonth: number }) {
  const month = today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dayNum = Number(today.slice(8));
  const perDay = Array.from({ length: daysIn }, () => 0);
  for (const l of leads) {
    const d = tashkentDayKey(new Date(l.created_at));
    if (d.startsWith(month)) perDay[Number(d.slice(8)) - 1] += 1;
  }
  const soFar = perDay.slice(0, dayNum).reduce((a, b) => a + b, 0);
  const projected = dayNum ? Math.round((soFar / dayNum) * daysIn) : 0;
  const max = Math.max(1, ...perDay);
  const W = 640;
  const H = 150;
  const bw = W / daysIn;
  let cum = 0;
  const cumPts = perDay.slice(0, dayNum).map((v, i) => {
    cum += v;
    return `${i ? 'L' : 'M'} ${i * bw + bw / 2} ${H - (cum / Math.max(projected, pacePerMonth, 1)) * H}`;
  });
  const pacePath = `M ${bw / 2} ${H} L ${W - bw / 2} ${H - (pacePerMonth / Math.max(projected, pacePerMonth, 1)) * H}`;
  return (
    <div className="sx-card s8">
      <div className="sx-h">
        <h3>Shu oy kelganlar</h3>
        <small>
          {soFar} ta · bashorat oy oxiriga <b className={projected >= pacePerMonth ? 'text-au-ok' : 'text-au-bad'}>{projected}</b> · o‘rtacha sur‘at {Math.round(pacePerMonth)}
        </small>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label="Kunlik kelganlar">
        {perDay.map((v, i) => (
          <rect
            key={i}
            x={i * bw + 2}
            width={bw - 4}
            y={H - (v / max) * (H * 0.55)}
            height={(v / max) * (H * 0.55)}
            rx="2"
            fill={i + 1 === dayNum ? 'var(--au-accent)' : 'var(--au-chart-4)'}
            opacity={i < dayNum ? 1 : 0.25}
            className="ms-wave"
            style={{ ['--i' as string]: i, transformOrigin: `${i * bw + bw / 2}px ${H}px`, transformBox: 'view-box' }}
          >
            <title>
              {i + 1}-kun: {v}
            </title>
          </rect>
        ))}
        <path d={pacePath} stroke="var(--au-faint)" strokeDasharray="4 5" fill="none" strokeWidth="1.5" />
        {cumPts.length > 1 && <path d={cumPts.join(' ')} pathLength={1} className="ms-draw" stroke="var(--au-ok)" strokeWidth="2.5" fill="none" strokeLinejoin="round" />}
        {[1, 10, 20, daysIn].map((d) => (
          <text key={d} x={(d - 1) * bw + bw / 2} y={H + 14} textAnchor="middle" fontSize="10" fill="var(--au-faint)">
            {d}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** When people arrive: weekday × hour (Tashkent), last 90 days. */
export function IntakeHeat({ leads, today }: { leads: OpsData['leads']; today: string }) {
  const hours = Array.from({ length: 13 }, (_, i) => 9 + i);
  const days = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
  const grid = Array.from({ length: 7 }, () => hours.map(() => 0));
  const since = Date.parse(`${today}T00:00:00Z`) - 90 * 864e5;
  for (const l of leads) {
    const t = Date.parse(l.created_at);
    if (!(t >= since)) continue;
    const local = new Date(t + 5 * 3600_000);
    const dow = (local.getUTCDay() + 6) % 7;
    const hi = hours.indexOf(local.getUTCHours());
    if (hi >= 0) grid[dow][hi] += 1;
  }
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="sx-card s4">
      <div className="sx-h">
        <h3>Qachon kelishadi</h3>
        <small>90 kun · hafta × soat</small>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `22px repeat(${hours.length}, 1fr)` }}>
        <span />
        {hours.map((h) => (
          <span key={h} className="text-center text-[9px] text-au-faint tabular-nums">
            {h % 3 === 0 ? h : ''}
          </span>
        ))}
        {grid.map((row, di) => (
          <div key={di} className="contents">
            <span className="text-[10px] leading-4 text-au-muted">{days[di]}</span>
            {row.map((v, hi) => (
              <span
                key={hi}
                title={`${days[di]} ${hours[hi]}:00 — ${v}`}
                className="ms-wave aspect-square rounded-[3px]"
                style={{
                  ['--i' as string]: di + hi,
                  background: v ? `color-mix(in oklab, var(--au-accent) ${Math.round(18 + (v / max) * 82)}%, var(--au-card-2))` : 'var(--au-card-2)',
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

