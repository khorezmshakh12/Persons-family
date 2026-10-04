'use client';

import { useState, useTransition } from 'react';
import { Pencil, Plus, Target, Trash2, Zap } from 'lucide-react';
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
  deleteKeyResultAction,
  deleteObjectiveAction,
  saveKeyResultAction,
  saveObjectiveAction,
} from '@/lib/actions/strategy-okr';
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

type KrDraft = { title: string; metric: OkrMetric; start: string; target: string; current: string; unit: string };
const krDraftOf = (k?: KeyResult): KrDraft => ({
  title: k?.title ?? '',
  metric: k?.metric ?? 'manual',
  start: String(k?.start_value ?? 0),
  target: k ? String(k.target_value) : '',
  current: k && k.metric === 'manual' && k.current !== null ? String(k.current) : '0',
  unit: k?.unit ?? '',
});
const toNum = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

function KrEditor({
  draft,
  finance,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
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
            onChange({ ...draft, metric, unit: metric === 'manual' ? draft.unit : OKR_METRICS[metric].unit });
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
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs text-au-faint">{OKR_METRICS[draft.metric].hint}</span>
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

export function OkrView({
  api,
  space,
  objectives,
  finance,
}: {
  api: WorkspaceApi;
  space: StrategySpace;
  objectives: Objective[];
  finance: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [newObj, setNewObj] = useState<{ title: string; owner: string } | null>(null);
  const [editObj, setEditObj] = useState<{ id: string; title: string; owner: string } | null>(null);
  const [kr, setKr] = useState<{ objectiveId: string; id?: string; draft: KrDraft } | null>(null);

  const total = Math.max(1, daysBetween(space.start_date, space.end_date));
  const elapsed = Math.max(0, Math.min(100, Math.round((daysBetween(space.start_date, api.today) / total) * 100)));
  const rows = objectives.map((o) => {
    const p = objectiveProgress(o);
    return { o, p, h: okrHealth(p, elapsed) };
  });
  const scored = rows.filter((r) => r.p !== null);
  const overall = scored.length ? Math.round(scored.reduce((a, r) => a + (r.p ?? 0), 0) / scored.length) : null;
  const count = (h: OkrHealth) => rows.filter((r) => r.h === h).length;

  const run = (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.error) return void toast.error(errText(res.error));
      toast.success(ok);
      after?.();
      router.refresh();
    });

  const createObjective = () => {
    if (!newObj?.title.trim()) return;
    run(
      () => saveObjectiveAction({ spaceId: space.id, title: newObj.title.trim(), ownerId: newObj.owner || null }),
      'Maqsad yaratildi',
      () => setNewObj(null),
    );
  };

  const saveKr = () => {
    if (!kr) return;
    const d = kr.draft;
    const [s, t, c] = [toNum(d.start), toNum(d.target), toNum(d.current || '0')];
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
        }),
      kr.id ? 'Key result saqlandi' : 'Key result qo‘shildi',
      () => setKr(null),
    );
  };

  return (
    <div className="grid gap-4">
      {/* Summary */}
      <div className="sx-card flex flex-wrap items-center gap-x-8 gap-y-4 p-5">
        <div className="flex items-center gap-4">
          <div className="grid size-16 place-items-center rounded-full border-4 border-au-line text-lg font-bold tabular-nums text-au-ink">
            {overall === null ? '—' : `${overall}%`}
          </div>
          <div>
            <div className="text-xs font-semibold text-au-muted">Maqsadlar bajarilishi</div>
            <div className="text-sm text-au-faint">
              Vaqtning {elapsed}% o‘tdi · {objectives.length} ta maqsad
            </div>
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
        <button className="sx-btn primary" onClick={() => setNewObj({ title: '', owner: '' })}>
          <Plus className="size-4" />
          Yangi maqsad
        </button>
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
            Maqsad — erishmoqchi bo‘lgan natija. Key result’lar uni o‘lchaydi: lidlar, o‘quvchilar, daromad kabi ko‘rsatkichlar avtomatik
            yangilanadi.
          </p>
          <button className="sx-btn primary" onClick={() => setNewObj({ title: '', owner: '' })}>
            <Plus className="size-4" />
            Birinchi maqsadni qo‘shish
          </button>
        </div>
      )}

      {rows.map(({ o, p, h }, oi) => {
        const owner = o.owner_id ? api.personById.get(o.owner_id) : undefined;
        const editing = editObj?.id === o.id;
        return (
          <section key={o.id} className="sx-card overflow-hidden">
            <header className="flex flex-wrap items-center gap-3 border-b border-au-line px-5 py-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-ink text-xs font-bold text-au-card">O{oi + 1}</span>
              {editing ? (
                <div className="flex min-w-[240px] flex-1 flex-wrap items-center gap-2">
                  <input
                    className="sx-inp min-w-[200px] flex-1"
                    autoFocus
                    maxLength={200}
                    value={editObj.title}
                    onChange={(e) => setEditObj({ ...editObj, title: e.target.value })}
                  />
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
                        () => saveObjectiveAction({ id: o.id, spaceId: space.id, title: editObj.title.trim(), ownerId: editObj.owner || null }),
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
                  <PersonAvatar person={owner} size={26} />
                  <Health h={h} />
                  <b className="w-12 text-right text-sm tabular-nums text-au-ink">{p === null ? '—' : `${p}%`}</b>
                  <button
                    className="sx-chipb"
                    aria-label="Maqsadni tahrirlash"
                    onClick={() => setEditObj({ id: o.id, title: o.title, owner: o.owner_id ?? '' })}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    className="sx-chipb"
                    aria-label="Maqsadni o‘chirish"
                    onClick={async () =>
                      (await ask(`«${o.title}» maqsadi va uning ${o.krs.length} ta key result’i o‘chirilsinmi?`)) &&
                      run(() => deleteObjectiveAction(o.id), "Maqsad o'chirildi")
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
              <div className="basis-full">
                <Bar pct={p} h={h} />
              </div>
            </header>

            <div className="grid gap-1 p-3">
              {o.krs.map((k) => {
                const kp = krProgress(k);
                const kh = okrHealth(kp, elapsed);
                if (kr?.id === k.id)
                  return (
                    <KrEditor
                      key={k.id}
                      draft={kr.draft}
                      finance={finance}
                      busy={busy}
                      onChange={(draft) => setKr({ ...kr, draft })}
                      onSave={saveKr}
                      onCancel={() => setKr(null)}
                    />
                  );
                const auto = k.metric !== 'manual';
                return (
                  <div key={k.id} className="group grid items-center gap-x-4 gap-y-1.5 rounded-au-ctl px-2 py-2.5 hover:bg-au-card-2 sm:grid-cols-[1fr_200px_auto]">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-au-ink">{k.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-au-faint">
                        {auto ? <Zap className="size-3 text-au-accent-text" /> : <Pencil className="size-3" />}
                        {auto ? `Avto · ${OKR_METRICS[k.metric].n}` : 'Qo‘lda'}
                      </div>
                    </div>
                    <div className="grid gap-1">
                      <div className="flex items-baseline justify-between text-xs tabular-nums">
                        <b className="text-au-ink">{fmtKr(k.current, k.unit)}</b>
                        <span className="text-au-faint">/ {fmtKr(k.target_value, k.unit)}</span>
                      </div>
                      <Bar pct={kp} h={kh} />
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <b className="w-10 text-right text-xs tabular-nums text-au-muted">{kp === null ? '—' : `${kp}%`}</b>
                      <button
                        className="sx-chipb opacity-60 group-hover:opacity-100"
                        aria-label="Key resultni tahrirlash"
                        onClick={() => setKr({ objectiveId: o.id, id: k.id, draft: krDraftOf(k) })}
                      >
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
                );
              })}
              {kr && !kr.id && kr.objectiveId === o.id ? (
                <KrEditor
                  draft={kr.draft}
                  finance={finance}
                  busy={busy}
                  onChange={(draft) => setKr({ ...kr, draft })}
                  onSave={saveKr}
                  onCancel={() => setKr(null)}
                />
              ) : (
                <button
                  className="sx-btn sm self-start text-au-muted"
                  onClick={() => setKr({ objectiveId: o.id, draft: krDraftOf() })}
                >
                  <Plus className="size-3.5" />
                  Key result qo‘shish
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
