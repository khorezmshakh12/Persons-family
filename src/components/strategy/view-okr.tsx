'use client';

import { useState, useTransition } from 'react';
import { Archive, Bot, CheckCircle2, ClipboardCheck, Link2, Lock, Pencil, Plus, RotateCcw, Target, Trash2, Zap } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { daysBetween, type StrategySpace } from '@/lib/strategy';
import {
  FINANCE_METRICS,
  HEALTH_LABEL,
  OKR_METRICS,
  OKR_METRIC_IDS,
  fmtKr,
  krProgress,
  objectiveProgress,
  okrHealth,
  type KeyResult,
  type Objective,
  type OkrHealth,
  type OkrMetric,
} from '@/lib/strategy-okr';
import {
  checkInKrAction,
  closeObjectiveAction,
  deleteKeyResultAction,
  deleteObjectiveAction,
  forecastKrsAction,
  reopenObjectiveAction,
  saveKeyResultAction,
  saveObjectiveAction,
  setKrTasksAction,
} from '@/lib/actions/strategy-okr';
import { CONFIDENCE, JEV_VERDICT, quarterElapsed, quarterOf, scoreTone, weekOf, type Confidence } from '@/lib/strategy-plan';
import { STATUSES, type StrategyTask } from '@/lib/strategy';
import { PersonAvatar } from './bits';
import { ask, toast } from './suite-shell';
import type { WorkspaceApi } from './strategy-workspace';

const HEALTH_CLS: Record<OkrHealth, string> = {
  ok: 'bg-au-ok/12 text-au-ok',
  risk: 'bg-au-accent-soft text-au-accent-text',
  off: 'bg-au-bad/12 text-au-bad',
  none: 'bg-au-card-2 text-au-faint',
};
const BAR_CLS: Record<OkrHealth, string> = {
  ok: 'bg-au-ok',
  risk: 'bg-au-accent',
  off: 'bg-au-bad',
  none: 'bg-au-faint',
};

function errText(code: string) {
  if (code === 'forbidden') return "Ruxsat yo'q";
  if (code === 'invalidInput') return "Ma'lumot noto'g'ri";
  return "Saqlab bo'lmadi, qayta urinib ko'ring";
}

function Health({ h }: { h: OkrHealth }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap', HEALTH_CLS[h])}>{HEALTH_LABEL[h]}</span>;
}

function Bar({ pct, h }: { pct: number | null; h: OkrHealth }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-au-line/60">
      <div className={cn('h-full rounded-full transition-[width] duration-700', BAR_CLS[h])} style={{ width: `${pct ?? 0}%` }} />
    </div>
  );
}

type KrDraft = { title: string; metric: OkrMetric; start: string; target: string; current: string; unit: string; owner: string };
const krDraftOf = (k?: KeyResult): KrDraft => ({
  title: k?.title ?? '',
  metric: k?.metric ?? 'manual',
  start: String(k?.start_value ?? 0),
  target: k ? String(k.target_value) : '',
  current: k && k.metric === 'manual' && k.current !== null ? String(k.current) : '0',
  unit: k?.unit ?? '',
  owner: k?.owner_id ?? '',
});
const toNum = (s: string) => {
  if (!s.trim()) return NaN;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

function KrEditor({
  draft,
  finance,
  busy,
  people,
  onChange,
  onSave,
  onCancel,
}: {
  people: WorkspaceApi['people'];
  draft: KrDraft;
  finance: boolean;
  busy: boolean;
  onChange: (d: KrDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const auto = draft.metric !== 'manual';
  return (
    <div className="grid gap-2 rounded-au-ctl border border-au-line bg-au-card-2 p-3">
      <input
        className="sx-inp"
        autoFocus
        placeholder="Key result — masalan: Oyiga 120 ta yangi lid"
        value={draft.title}
        maxLength={200}
        onChange={(e) => onChange({ ...draft, title: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && onSave()}
      />
      <div className="grid gap-2 sm:grid-cols-[1.6fr_1fr_1fr_1fr_.7fr]">
        <select
          className="sx-inp"
          value={draft.metric}
          onChange={(e) => {
            const metric = e.target.value as OkrMetric;
            onChange({
              ...draft,
              metric,
              unit: metric === 'manual' ? draft.unit : OKR_METRICS[metric].unit,
              ...(metric === 'linked_tasks' ? { start: '0', target: '100' } : {}),
            });
          }}
          aria-label="O‘lchov manbasi"
        >
          {OKR_METRIC_IDS.filter((m) => finance || !FINANCE_METRICS.includes(m)).map((m) => (
            <option key={m} value={m}>
              {m === 'manual' ? '✎ ' : '⚡ '}
              {OKR_METRICS[m].n}
            </option>
          ))}
        </select>
        <label className="grid gap-0.5 text-[11px] font-semibold text-au-faint">
          Boshlang‘ich
          <input className="sx-inp" inputMode="decimal" value={draft.start} onChange={(e) => onChange({ ...draft, start: e.target.value })} />
        </label>
        <label className="grid gap-0.5 text-[11px] font-semibold text-au-faint">
          Maqsad
          <input className="sx-inp" inputMode="decimal" value={draft.target} onChange={(e) => onChange({ ...draft, target: e.target.value })} />
        </label>
        <label className="grid gap-0.5 text-[11px] font-semibold text-au-faint">
          Hozirgi
          <input
            className="sx-inp"
            inputMode="decimal"
            disabled={auto}
            title={auto ? 'Avtomatik hisoblanadi' : undefined}
            value={auto ? 'avto' : draft.current}
            onChange={(e) => onChange({ ...draft, current: e.target.value })}
          />
        </label>
        <label className="grid gap-0.5 text-[11px] font-semibold text-au-faint">
          Birlik
          <input className="sx-inp" maxLength={20} disabled={auto} value={draft.unit} onChange={(e) => onChange({ ...draft, unit: e.target.value })} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="sx-inp max-w-[200px]" value={draft.owner} onChange={(e) => onChange({ ...draft, owner: e.target.value })} aria-label="KR egasi">
          <option value="">— KR egasi —</option>
          {people.map((pp) => (
            <option key={pp.id} value={pp.id}>
              {pp.first_name} {pp.last_name}
            </option>
          ))}
        </select>
        <span className="min-w-[160px] flex-1 text-xs text-au-faint">{OKR_METRICS[draft.metric].hint}</span>
        <button className="sx-btn sm" onClick={onCancel}>
          Bekor
        </button>
        <button className="sx-btn sm primary" disabled={busy || !draft.title.trim() || !draft.target.trim()} onClick={onSave}>
          Saqlash
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ v2 bits */

/** Weekly check-in trail: one dot per week, coloured by confidence, with the
 * value line drawn through them for manual KRs. */
function Trail({ k }: { k: KeyResult }) {
  const cs = k.checkins;
  if (!cs.length) return <span className="text-[11px] text-au-faint">check-in yo‘q</span>;
  const vals = cs.map((c) => c.value).filter((v): v is number => v !== null);
  const lo = Math.min(k.start_value, ...vals);
  const hi = Math.max(k.target_value, ...vals);
  const W = 120;
  const H = 26;
  const x = (i: number) => (cs.length === 1 ? W / 2 : 4 + (i * (W - 8)) / (cs.length - 1));
  const y = (v: number) => H - 4 - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 8);
  const pts = cs.map((c, i) => (c.value === null ? null : `${x(i)},${y(c.value)}`)).filter(Boolean);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Haftalik check-in tarixi">
      {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke="var(--au-line)" strokeWidth="1.5" pathLength={1} className="ms-draw" />}
      {cs.map((c, i) => (
        <circle key={c.id} cx={x(i)} cy={c.value === null ? H / 2 : y(c.value)} r={i === cs.length - 1 ? 4 : 3} fill={CONFIDENCE[c.confidence].c}>
          <title>
            {c.week}: {CONFIDENCE[c.confidence].n}
            {c.value !== null ? ` · ${c.value}` : ''}
            {c.note ? ` — ${c.note}` : ''}
          </title>
        </circle>
      ))}
    </svg>
  );
}

function ConfidenceDot({ c }: { c: Confidence | undefined }) {
  if (!c) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `color-mix(in oklab, ${CONFIDENCE[c].c} 14%, transparent)`, color: CONFIDENCE[c].c }}>
      <i className="size-1.5 rounded-full" style={{ background: CONFIDENCE[c].c }} />
      {CONFIDENCE[c].n}
    </span>
  );
}

function JevChip({ k }: { k: KeyResult }) {
  if (!k.jev_verdict) return null;
  const v = JEV_VERDICT[k.jev_verdict];
  return (
    <span title={`Jev bahosi${k.jev_at ? ` · ${k.jev_at.slice(0, 10)}` : ''}`} className="ms-pop-in inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold" style={{ borderColor: v.c, color: v.c }}>
      <Bot className="size-3" /> {v.n}
    </span>
  );
}

function CheckInForm({ k, busy, onSave, onCancel }: { k: KeyResult; busy: boolean; onSave: (v: { value: number | null; confidence: Confidence; note: string }) => void; onCancel: () => void }) {
  const last = k.checkins[k.checkins.length - 1];
  const [conf, setConf] = useState<Confidence>(last?.confidence ?? 'on');
  const [val, setVal] = useState(k.metric === 'manual' && k.current !== null ? String(k.current) : '');
  const [note, setNote] = useState('');
  const manual = k.metric === 'manual';
  return (
    <div className="ms-rise grid gap-2 rounded-au-ctl border border-au-line bg-au-card-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-au-ink">Haftalik check-in</span>
        <div className="sx-seg">
          {(Object.keys(CONFIDENCE) as Confidence[]).map((c) => (
            <button key={c} className={cn(conf === c && 'on')} onClick={() => setConf(c)}>
              <i className="mr-1 inline-block size-2 rounded-full" style={{ background: CONFIDENCE[c].c }} />
              {CONFIDENCE[c].n}
            </button>
          ))}
        </div>
        {manual ? (
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-au-faint">
            Qiymat
            <input className="sx-inp w-28" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} />
            <span>{k.unit}</span>
          </label>
        ) : (
          <span className="text-[11px] text-au-faint">Qiymat avtomatik: {fmtKr(k.current, k.unit)}</span>
        )}
      </div>
      <input className="sx-inp" maxLength={500} placeholder="Nima o‘zgardi, nima to‘sqinlik qilyapti? (ixtiyoriy)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button className="sx-btn sm" onClick={onCancel}>
          Bekor
        </button>
        <button
          className="sx-btn sm primary"
          disabled={busy || (manual && val.trim() !== '' && Number.isNaN(toNum(val)))}
          onClick={() => onSave({ value: manual && val.trim() !== '' ? toNum(val) : null, confidence: conf, note })}
        >
          Saqlash
        </button>
      </div>
    </div>
  );
}

function LinkTasks({ k, tasks, busy, onSave, onCancel }: { k: KeyResult; tasks: StrategyTask[]; busy: boolean; onSave: (ids: string[]) => void; onCancel: () => void }) {
  const [sel, setSel] = useState(new Set(k.task_ids));
  const [q, setQ] = useState('');
  const shown = tasks.filter((t) => !q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="ms-rise grid gap-2 rounded-au-ctl border border-au-line bg-au-card-2 p-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-bold text-au-ink">KR’ni harakatlantiradigan vazifalar · {sel.size}</span>
        <input className="sx-inp w-48" placeholder="Qidirish…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="max-h-56 overflow-y-auto rounded-au-ctl border border-au-line bg-au-card">
        {shown.map((t) => (
          <li key={t.id}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-au-card-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--au-ink)]"
                checked={sel.has(t.id)}
                onChange={() =>
                  setSel((s) => {
                    const n = new Set(s);
                    if (n.has(t.id)) n.delete(t.id);
                    else n.add(t.id);
                    return n;
                  })
                }
              />
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="text-[11px] font-semibold" style={{ color: STATUSES[t.status].c }}>
                {STATUSES[t.status].n}
              </span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-4 text-center text-xs text-au-faint">Vazifa yo‘q</li>}
      </ul>
      <p className="text-[11px] text-au-faint">O‘lchov manbasi «Bog‘langan vazifalar» bo‘lsa, KR progressi shu vazifalardan avtomatik hisoblanadi.</p>
      <div className="flex justify-end gap-2">
        <button className="sx-btn sm" onClick={onCancel}>
          Bekor
        </button>
        <button className="sx-btn sm primary" disabled={busy} onClick={() => onSave([...sel])}>
          Saqlash
        </button>
      </div>
    </div>
  );
}

function CloseForm({ o, suggested, busy, onSave, onCancel }: { o: Objective; suggested: number; busy: boolean; onSave: (score: number, retro: string) => void; onCancel: () => void }) {
  const [score, setScore] = useState(suggested);
  const [retro, setRetro] = useState('');
  return (
    <div className="ms-rise grid gap-3 border-b border-au-line bg-au-card-2 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold text-au-ink">«{o.title}» — chorak yakuni</span>
        <span className="text-xs text-au-faint">Taklif: KR’lar o‘rtachasi {suggested.toFixed(1)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input type="range" min={0} max={1} step={0.1} value={score} onChange={(e) => setScore(Number(e.target.value))} className="w-56 accent-[var(--au-ink)]" aria-label="Yakuniy baho" />
        <b className="ms-pop-in rounded-full px-3 py-1 text-sm tabular-nums" key={score} style={{ background: `color-mix(in oklab, ${scoreTone(score)} 15%, transparent)`, color: scoreTone(score) }}>
          {score.toFixed(1)}
        </b>
        <span className="text-[11px] text-au-faint">0.7+ — yaxshi natija (ambitsiyali OKR’da 1.0 kam uchraydi)</span>
      </div>
      <textarea className="sx-inp min-h-[70px]" maxLength={1000} placeholder="Retro: nima ishladi, nima ishlamadi, keyingi chorakka nima olib o‘tamiz?" value={retro} onChange={(e) => setRetro(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button className="sx-btn sm" onClick={onCancel}>
          Bekor
        </button>
        <button className="sx-btn sm primary" disabled={busy} onClick={() => onSave(score, retro)}>
          <Lock className="size-3.5" /> Yopish
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ view */

export function OkrView({
  api,
  space,
  objectives,
  finance,
  tasks,
}: {
  api: WorkspaceApi;
  space: StrategySpace;
  objectives: Objective[];
  finance: boolean;
  tasks: StrategyTask[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const curQ = quarterOf(api.today);
  const [newObj, setNewObj] = useState<{ title: string; owner: string; quarter: string } | null>(null);
  const [editObj, setEditObj] = useState<{ id: string; title: string; owner: string; quarter: string } | null>(null);
  const [kr, setKr] = useState<{ objectiveId: string; id?: string; draft: KrDraft } | null>(null);
  const [panel, setPanel] = useState<{ kind: 'checkin' | 'link'; krId: string } | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const quarters = [...new Set([curQ, ...objectives.map((o) => o.quarter).filter((q): q is string => !!q)])].sort().reverse();
  const [qf, setQf] = useState<string>('all');

  const total = Math.max(1, daysBetween(space.start_date, space.end_date));
  const spaceElapsed = Math.max(0, Math.min(100, Math.round((daysBetween(space.start_date, api.today) / total) * 100)));
  const elapsedOf = (o: Objective) => (o.quarter ? quarterElapsed(o.quarter, api.today) : spaceElapsed);
  const shown = objectives.filter((o) => (qf === 'all' ? true : qf === 'closed' ? o.status === 'closed' : o.quarter === qf && o.status === 'active'));
  const rows = shown.map((o) => {
    const p = objectiveProgress(o);
    return { o, p, h: o.status === 'closed' ? ('none' as OkrHealth) : okrHealth(p, elapsedOf(o)) };
  });
  const active = rows.filter((r) => r.o.status === 'active');
  const scored = active.filter((r) => r.p !== null);
  const overall = scored.length ? Math.round(scored.reduce((a, r) => a + (r.p ?? 0), 0) / scored.length) : null;
  const count = (h: OkrHealth) => active.filter((r) => r.h === h).length;
  const week = weekOf(api.today);
  const activeKrs = active.flatMap((r) => r.o.krs);
  const checkedIn = activeKrs.filter((k) => k.checkins.some((c) => c.week === week)).length;

  const run = (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.error) return void toast.error(res.error === 'aiDisabled' ? 'Jev ulanmagan' : res.error === 'aiFailed' ? 'Jev javob bermadi' : errText(res.error));
      toast.success(ok);
      after?.();
      router.refresh();
    });

  const createObjective = () => {
    if (!newObj?.title.trim()) return;
    run(
      () => saveObjectiveAction({ spaceId: space.id, title: newObj.title.trim(), ownerId: newObj.owner || null, quarter: newObj.quarter || null }),
      'Maqsad yaratildi',
      () => setNewObj(null),
    );
  };

  const saveKr = () => {
    if (!kr) return;
    const d = kr.draft;
    const [s, t, c] = [toNum(d.start || '0'), toNum(d.target), toNum(d.current || '0')];
    if (!d.title.trim() || [s, t, c].some(Number.isNaN)) return void toast.error('Raqamlarni to‘g‘ri kiriting');
    run(
      () =>
        saveKeyResultAction({
          id: kr.id,
          objectiveId: kr.objectiveId,
          title: d.title.trim(),
          metric: d.metric,
          startValue: s,
          targetValue: t,
          currentValue: c,
          unit: d.unit.trim(),
          ownerId: d.owner || null,
        }),
      kr.id ? 'Key result saqlandi' : 'Key result qo‘shildi',
      () => setKr(null),
    );
  };

  const quarterSelect = (value: string, onChange: (v: string) => void) => (
    <select className="sx-inp" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Chorak">
      <option value="">— Chorak —</option>
      {[...new Set([curQ, ...quarters, nextQuarter(curQ)])].sort().map((q) => (
        <option key={q} value={q}>
          {q.replace('-', ' · ')}
        </option>
      ))}
    </select>
  );

  return (
    <div className="grid gap-4">
      {/* Summary */}
      <div className="sx-card flex flex-wrap items-center gap-x-8 gap-y-4 p-5">
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 64 64" className="size-16" role="img" aria-label={`Bajarilish ${overall ?? 0}%`}>
            <circle cx="32" cy="32" r="27" fill="none" stroke="var(--au-ring-track)" strokeWidth="7" />
            <circle cx="32" cy="32" r="27" fill="none" stroke="var(--au-ink)" strokeWidth="7" strokeLinecap="round" pathLength={1} strokeDasharray={`${(overall ?? 0) / 100} 1`} transform="rotate(-90 32 32)" className="ms-arc" />
            <text x="32" y="37" textAnchor="middle" className="fill-au-ink text-[15px] font-bold">
              {overall === null ? '—' : `${overall}%`}
            </text>
          </svg>
          <div>
            <div className="text-xs font-semibold text-au-muted">Faol maqsadlar bajarilishi</div>
            <div className="text-sm text-au-faint">
              {active.length} ta maqsad · {activeKrs.length} ta KR
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-semibold text-au-muted">Shu haftadagi check-in</div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-36 overflow-hidden rounded-full bg-au-line/60">
              <div className="ms-fill h-full rounded-full bg-au-ok" style={{ width: `${activeKrs.length ? (checkedIn / activeKrs.length) * 100 : 0}%` }} />
            </div>
            <b className="text-sm tabular-nums">
              {checkedIn}/{activeKrs.length}
            </b>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['ok', 'risk', 'off'] as const).map((h) => (
            <span key={h} className={cn('rounded-full px-3 py-1 text-xs font-bold', HEALTH_CLS[h])}>
              {HEALTH_LABEL[h]} · {count(h)}
            </span>
          ))}
        </div>
        <div className="flex-1" />
        <button className="sx-btn" disabled={busy || !activeKrs.length} onClick={() => run(() => forecastKrsAction(space.id), 'Jev KR’larni baholadi')} title="Jev har bir KR maqsadga yetishini baholaydi">
          <Bot className="size-4" />
          Jev bahosi
        </button>
        <button className="sx-btn primary" onClick={() => setNewObj({ title: '', owner: '', quarter: curQ })}>
          <Plus className="size-4" />
          Yangi maqsad
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="sx-seg">
          <button className={cn(qf === 'all' && 'on')} onClick={() => setQf('all')}>
            Hammasi · {objectives.length}
          </button>
          {quarters.map((q) => (
            <button key={q} className={cn(qf === q && 'on')} onClick={() => setQf(q)}>
              {q.replace('-', ' ')}
              {q === curQ && ' · joriy'}
            </button>
          ))}
          <button className={cn(qf === 'closed' && 'on')} onClick={() => setQf('closed')}>
            Yopilgan · {objectives.filter((o) => o.status === 'closed').length}
          </button>
        </div>
      </div>

      {newObj !== null && (
        <div className="sx-card flex flex-wrap items-center gap-2 p-4">
          <Target className="size-5 text-au-accent-text" />
          <input
            className="sx-inp min-w-[240px] flex-1"
            autoFocus
            maxLength={200}
            placeholder="Maqsad (Objective) — masalan: Samarqandda yetakchi o‘quv markazi bo‘lish"
            value={newObj.title}
            onChange={(e) => setNewObj({ ...newObj, title: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && createObjective()}
          />
          {quarterSelect(newObj.quarter, (quarter) => setNewObj({ ...newObj, quarter }))}
          <select className="sx-inp" value={newObj.owner} onChange={(e) => setNewObj({ ...newObj, owner: e.target.value })} aria-label="Mas’ul">
            <option value="">— Mas’ul —</option>
            {api.people.map((pp) => (
              <option key={pp.id} value={pp.id}>
                {pp.first_name} {pp.last_name}
              </option>
            ))}
          </select>
          <button className="sx-btn sm" onClick={() => setNewObj(null)}>
            Bekor
          </button>
          <button className="sx-btn sm primary" disabled={busy || !newObj.title.trim()} onClick={createObjective}>
            Yaratish
          </button>
        </div>
      )}

      {objectives.length === 0 && newObj === null && (
        <div className="sx-card flex flex-col items-center gap-3 p-10 text-center">
          <Target className="size-10 text-au-faint" />
          <h3 className="text-base font-bold text-au-ink">Hali maqsad yo‘q</h3>
          <p className="max-w-md text-sm text-au-muted">
            Maqsad — erishmoqchi bo‘lgan natija. Key result’lar uni o‘lchaydi: lidlar, o‘quvchilar kabi ko‘rsatkichlar avtomatik yangilanadi,
            yoki KR’ni strategiya vazifalariga bog‘lab, ular bajarilgani sari progress o‘sadi.
          </p>
          <button className="sx-btn primary" onClick={() => setNewObj({ title: '', owner: '', quarter: curQ })}>
            <Plus className="size-4" />
            Birinchi maqsadni qo‘shish
          </button>
        </div>
      )}

      {rows.map(({ o, p, h }, oi) => {
        const owner = o.owner_id ? api.personById.get(o.owner_id) : undefined;
        const editing = editObj?.id === o.id;
        const closed = o.status === 'closed';
        const suggested = Math.round(((p ?? 0) / 100) * 10) / 10;
        return (
          <section key={o.id} className={cn('sx-card overflow-hidden', closed && 'opacity-85')} style={{ ['--i' as string]: oi }}>
            <header className="flex flex-wrap items-center gap-3 border-b border-au-line px-5 py-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-ink text-xs font-bold text-au-card">O{oi + 1}</span>
              {editing ? (
                <div className="flex min-w-[240px] flex-1 flex-wrap items-center gap-2">
                  <input className="sx-inp min-w-[200px] flex-1" autoFocus maxLength={200} value={editObj.title} onChange={(e) => setEditObj({ ...editObj, title: e.target.value })} />
                  {quarterSelect(editObj.quarter, (quarter) => setEditObj({ ...editObj, quarter }))}
                  <select className="sx-inp" value={editObj.owner} onChange={(e) => setEditObj({ ...editObj, owner: e.target.value })} aria-label="Mas’ul">
                    <option value="">— Mas’ul yo‘q —</option>
                    {api.people.map((pp) => (
                      <option key={pp.id} value={pp.id}>
                        {pp.first_name} {pp.last_name}
                      </option>
                    ))}
                  </select>
                  <button className="sx-btn sm" onClick={() => setEditObj(null)}>
                    Bekor
                  </button>
                  <button
                    className="sx-btn sm primary"
                    disabled={busy || !editObj.title.trim()}
                    onClick={() =>
                      run(
                        () => saveObjectiveAction({ id: o.id, spaceId: space.id, title: editObj.title.trim(), ownerId: editObj.owner || null, quarter: editObj.quarter || null }),
                        'Maqsad saqlandi',
                        () => setEditObj(null),
                      )
                    }
                  >
                    Saqlash
                  </button>
                </div>
              ) : (
                <>
                  <h3 className="min-w-0 flex-1 text-[15px] font-bold text-au-ink">{o.title}</h3>
                  {o.quarter && <span className="rounded-full bg-au-card-2 px-2 py-0.5 text-[11px] font-bold text-au-muted">{o.quarter.replace('-', ' ')}</span>}
                  <PersonAvatar person={owner} size={26} />
                  {closed && o.final_score !== null ? (
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums" style={{ background: `color-mix(in oklab, ${scoreTone(o.final_score)} 15%, transparent)`, color: scoreTone(o.final_score) }}>
                      Yakuniy baho {o.final_score.toFixed(1)}
                    </span>
                  ) : (
                    <Health h={h} />
                  )}
                  <b className="w-12 text-right text-sm tabular-nums text-au-ink">{p === null ? '—' : `${p}%`}</b>
                  {closed ? (
                    <button className="sx-chipb" title="Qayta ochish" aria-label="Maqsadni qayta ochish" onClick={() => run(() => reopenObjectiveAction(o.id), 'Maqsad qayta ochildi')}>
                      <RotateCcw className="size-3.5" />
                    </button>
                  ) : (
                    <button className="sx-chipb" title="Chorakni yopish va baholash" aria-label="Maqsadni yopish" onClick={() => setClosing(closing === o.id ? null : o.id)}>
                      <Archive className="size-3.5" />
                    </button>
                  )}
                  <button className="sx-chipb" aria-label="Maqsadni tahrirlash" onClick={() => setEditObj({ id: o.id, title: o.title, owner: o.owner_id ?? '', quarter: o.quarter ?? '' })}>
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    className="sx-chipb"
                    aria-label="Maqsadni o‘chirish"
                    onClick={async () => (await ask(`«${o.title}» maqsadi va uning ${o.krs.length} ta key result’i o‘chirilsinmi?`)) && run(() => deleteObjectiveAction(o.id), "Maqsad o'chirildi")}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
              <div className="basis-full">
                <Bar pct={p} h={closed ? 'ok' : h} />
              </div>
            </header>

            {closing === o.id && (
              <CloseForm
                o={o}
                suggested={suggested}
                busy={busy}
                onCancel={() => setClosing(null)}
                onSave={(score, retro) => run(() => closeObjectiveAction({ id: o.id, score, retro }), 'Maqsad yopildi va baholandi', () => setClosing(null))}
              />
            )}
            {closed && o.retro && <p className="border-b border-au-line bg-au-card-2/60 px-5 py-3 text-sm whitespace-pre-wrap text-au-muted">{o.retro}</p>}

            <div className="grid gap-1 p-3">
              {o.krs.map((k) => {
                const kp = krProgress(k);
                const kh = okrHealth(kp, elapsedOf(o));
                if (kr?.id === k.id)
                  return (
                    <KrEditor key={k.id} draft={kr.draft} finance={finance} busy={busy} people={api.people} onChange={(draft) => setKr({ ...kr, draft })} onSave={saveKr} onCancel={() => setKr(null)} />
                  );
                const auto = k.metric !== 'manual';
                const kOwner = k.owner_id ? api.personById.get(k.owner_id) : undefined;
                const last = k.checkins[k.checkins.length - 1];
                const doneThisWeek = last?.week === week;
                const linked = tasks.filter((t) => k.task_ids.includes(t.id));
                return (
                  <div key={k.id} className="grid gap-2">
                    <div className="group grid items-center gap-x-4 gap-y-1.5 rounded-au-ctl px-2 py-2.5 hover:bg-au-card-2 lg:grid-cols-[1fr_130px_200px_auto]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-au-ink">{k.title}</span>
                          <ConfidenceDot c={last?.confidence} />
                          <JevChip k={k} />
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-au-faint">
                          {auto ? <Zap className="size-3 text-au-accent-text" /> : <Pencil className="size-3" />}
                          {auto ? `Avto · ${OKR_METRICS[k.metric].n}` : 'Qo‘lda'}
                          {kOwner && (
                            <span className="inline-flex items-center gap-1">
                              · <PersonAvatar person={kOwner} size={16} /> {kOwner.first_name}
                            </span>
                          )}
                          {linked.length > 0 && (
                            <button className="inline-flex items-center gap-0.5 font-semibold text-au-info hover:underline" onClick={() => setPanel({ kind: 'link', krId: k.id })}>
                              · <Link2 className="size-3" /> {linked.filter((t) => t.status === 'done').length}/{linked.length} vazifa
                            </button>
                          )}
                        </div>
                      </div>
                      <Trail k={k} />
                      <div className="grid gap-1">
                        <div className="flex items-baseline justify-between text-xs tabular-nums">
                          <b className="text-au-ink">{fmtKr(k.current, k.unit)}</b>
                          <span className="text-au-faint">/ {fmtKr(k.target_value, k.unit)}</span>
                        </div>
                        <Bar pct={kp} h={kh} />
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <b className="w-10 text-right text-xs tabular-nums text-au-muted">{kp === null ? '—' : `${kp}%`}</b>
                        {!closed && (
                          <button
                            className={cn('sx-chipb', doneThisWeek ? 'text-au-ok' : 'text-au-accent-text')}
                            title={doneThisWeek ? 'Shu hafta check-in qilingan — yangilash' : 'Haftalik check-in'}
                            aria-label="Check-in"
                            onClick={() => setPanel(panel?.krId === k.id && panel.kind === 'checkin' ? null : { kind: 'checkin', krId: k.id })}
                          >
                            {doneThisWeek ? <CheckCircle2 className="size-3.5" /> : <ClipboardCheck className="size-3.5" />}
                          </button>
                        )}
                        <button className="sx-chipb opacity-60 group-hover:opacity-100" title="Vazifalarni bog‘lash" aria-label="Vazifalarni bog‘lash" onClick={() => setPanel(panel?.krId === k.id && panel.kind === 'link' ? null : { kind: 'link', krId: k.id })}>
                          <Link2 className="size-3.5" />
                        </button>
                        <button className="sx-chipb opacity-60 group-hover:opacity-100" aria-label="Key resultni tahrirlash" onClick={() => setKr({ objectiveId: o.id, id: k.id, draft: krDraftOf(k) })}>
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          className="sx-chipb opacity-60 group-hover:opacity-100"
                          aria-label="Key resultni o‘chirish"
                          onClick={async () => (await ask(`«${k.title}» o‘chirilsinmi?`)) && run(() => deleteKeyResultAction(k.id), "Key result o'chirildi")}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    {panel?.krId === k.id && panel.kind === 'checkin' && (
                      <CheckInForm
                        k={k}
                        busy={busy}
                        onCancel={() => setPanel(null)}
                        onSave={(v) => run(() => checkInKrAction({ krId: k.id, value: v.value, confidence: v.confidence, note: v.note }), 'Check-in saqlandi', () => setPanel(null))}
                      />
                    )}
                    {panel?.krId === k.id && panel.kind === 'link' && (
                      <LinkTasks k={k} tasks={tasks} busy={busy} onCancel={() => setPanel(null)} onSave={(ids) => run(() => setKrTasksAction(k.id, ids), 'Bog‘lanish saqlandi', () => setPanel(null))} />
                    )}
                  </div>
                );
              })}
              {!closed &&
                (kr && !kr.id && kr.objectiveId === o.id ? (
                  <KrEditor draft={kr.draft} finance={finance} busy={busy} people={api.people} onChange={(draft) => setKr({ ...kr, draft })} onSave={saveKr} onCancel={() => setKr(null)} />
                ) : (
                  <button className="sx-btn sm self-start text-au-muted" onClick={() => setKr({ objectiveId: o.id, draft: krDraftOf() })}>
                    <Plus className="size-3.5" />
                    Key result qo‘shish
                  </button>
                ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function nextQuarter(q: string) {
  const y = Number(q.slice(0, 4));
  const n = Number(q.slice(-1));
  return n === 4 ? `${y + 1}-Q1` : `${y}-Q${n + 1}`;
}
