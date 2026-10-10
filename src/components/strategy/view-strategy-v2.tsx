'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, CalendarClock, ClipboardCheck, GitMerge, Link2, Target, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { STATUSES, fmtDay, isLate, type StrategyTask } from '@/lib/strategy';
import { HEALTH_LABEL, fmtKr, krProgress, objectiveProgress, okrHealth, type Objective, type OkrHealth } from '@/lib/strategy-okr';
import { CONFIDENCE, JEV_VERDICT, quarterElapsed, type Dep } from '@/lib/strategy-plan';
import type { PortfolioRow } from '@/lib/strategy-portfolio';
import { PersonAvatar } from './bits';
import type { WorkspaceApi } from './strategy-workspace';

const H_TONE: Record<OkrHealth, string> = { ok: 'var(--au-ok)', risk: 'var(--au-accent)', off: 'var(--au-bad)', none: 'var(--au-faint)' };

function Ring({ pct, tone, size = 56 }: { pct: number | null; tone: string; size?: number }) {
  return (
    <svg viewBox="0 0 56 56" style={{ width: size, height: size }} role="img" aria-label={`${pct ?? 0}%`}>
      <circle cx="28" cy="28" r="23" fill="none" stroke="var(--au-ring-track)" strokeWidth="6" />
      <circle cx="28" cy="28" r="23" fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round" pathLength={1} strokeDasharray={`${(pct ?? 0) / 100} 1`} transform="rotate(-90 28 28)" className="ms-arc" />
      <text x="28" y="32" textAnchor="middle" className="fill-au-ink text-[12px] font-bold">
        {pct === null ? '—' : `${pct}%`}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------ portfolio */

export function PortfolioView({ rows, currentId, today }: { rows: PortfolioRow[]; currentId: string; today: string }) {
  const router = useRouter();
  const tot = rows.reduce((a, r) => ({ t: a.t + r.tasks_total, d: a.d + r.tasks_done, l: a.l + r.tasks_late, r: a.r + r.at_risk, c: a.c + r.checkins_due }), { t: 0, d: 0, l: 0, r: 0, c: 0 });
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { l: 'Strategik maydonlar', v: rows.length, d: 'faol portfel' },
          { l: 'Vazifalar bajarilishi', v: tot.t ? `${Math.round((tot.d / tot.t) * 100)}%` : '—', d: `${tot.d}/${tot.t} vazifa` },
          { l: 'Kechikkan vazifalar', v: tot.l, d: 'muddati o‘tgan', bad: tot.l > 0 },
          { l: 'Xavfdagi maqsadlar', v: tot.r, d: `${tot.c} ta KR check-in kutyapti`, bad: tot.r > 0 },
        ].map((k, i) => (
          <div key={k.l} className="sx-card kpi sx-rise p-4" style={{ ['--i' as string]: i }}>
            <div className="text-xs font-semibold text-au-muted">{k.l}</div>
            <div className={cn('mt-1 text-2xl font-bold tabular-nums', k.bad ? 'text-au-bad' : 'text-au-ink')}>{k.v}</div>
            <div className="text-[11px] text-au-faint">{k.d}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r, i) => {
          const done = r.tasks_total ? Math.round((r.tasks_done / r.tasks_total) * 100) : null;
          const health: OkrHealth = r.okr_progress === null ? 'none' : r.at_risk === 0 ? 'ok' : r.at_risk >= Math.max(1, r.objectives / 2) ? 'off' : 'risk';
          return (
            <button
              key={r.id}
              onClick={() => router.push(`/strategy?space=${r.id}`)}
              className={cn('sx-card sx-rise relative flex flex-col gap-3 overflow-hidden p-4 text-left transition-[transform,box-shadow] hover:-translate-y-0.5', r.id === currentId && 'ring-2 ring-au-accent')}
              style={{ ['--i' as string]: i }}
            >
              <i className="absolute inset-x-0 top-0 h-1" style={{ background: r.color }} />
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-bold text-au-ink">{r.name}</h3>
                  <p className="text-[11px] text-au-faint">
                    {fmtDay(r.start_date)} → {fmtDay(r.end_date)}
                    {r.end_date < today && ' · tugagan'}
                  </p>
                </div>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `color-mix(in oklab, ${H_TONE[health]} 14%, transparent)`, color: H_TONE[health] }}>
                  {HEALTH_LABEL[health]}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center gap-0.5">
                  <Ring pct={r.okr_progress} tone={H_TONE[health]} />
                  <span className="text-[10px] font-semibold text-au-faint">OKR</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Ring pct={done} tone="var(--au-ink)" />
                  <span className="text-[10px] font-semibold text-au-faint">Vazifalar</span>
                </div>
                <ul className="min-w-0 flex-1 space-y-1 text-xs text-au-muted">
                  <li className="flex items-center gap-1.5">
                    <Target className="size-3.5" /> {r.objectives} maqsad · {r.at_risk} xavfda
                  </li>
                  <li className={cn('flex items-center gap-1.5', r.tasks_late > 0 && 'font-semibold text-au-bad')}>
                    <AlertTriangle className="size-3.5" /> {r.tasks_late} kechikkan
                  </li>
                  <li className="flex items-center gap-1.5">
                    <ClipboardCheck className="size-3.5" /> {r.checkins_due} check-in kutilmoqda
                  </li>
                </ul>
              </div>
              {r.next_milestone && (
                <div className="flex items-center gap-2 rounded-au-ctl bg-au-card-2 px-3 py-2 text-xs">
                  <CalendarClock className="size-3.5 text-au-info" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-au-ink">{r.next_milestone.title}</span>
                  <span className="text-au-faint">{fmtDay(r.next_milestone.date)}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ OKR tree */

/** Objective → key results → the tasks that move them, as one tree. */
export function OkrTree({ api, objectives, tasks, spaceElapsed }: { api: WorkspaceApi; objectives: Objective[]; tasks: StrategyTask[]; spaceElapsed: number }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(objectives.map((o) => o.id)));
  const active = objectives.filter((o) => o.status === 'active');
  const orphan = tasks.filter((t) => !active.some((o) => o.krs.some((k) => k.task_ids.includes(t.id))));
  if (!active.length)
    return (
      <div className="sx-card p-10 text-center text-sm text-au-muted">
        <Target className="mx-auto mb-2 size-8 text-au-faint" />
        Faol maqsad yo‘q — OKR bo‘limida maqsad qo‘shing.
      </div>
    );
  return (
    <div className="grid gap-4">
      {active.map((o, oi) => {
        const p = objectiveProgress(o);
        const h = okrHealth(p, o.quarter ? quarterElapsed(o.quarter, api.today) : spaceElapsed);
        const isOpen = open.has(o.id);
        return (
          <section key={o.id} className="sx-card sx-rise overflow-hidden p-4" style={{ ['--i' as string]: oi }}>
            <button
              className="flex w-full items-center gap-3 text-left"
              onClick={() =>
                setOpen((s) => {
                  const n = new Set(s);
                  if (n.has(o.id)) n.delete(o.id);
                  else n.add(o.id);
                  return n;
                })
              }
              aria-expanded={isOpen}
            >
              <Ring pct={p} tone={H_TONE[h]} size={48} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[15px] font-bold text-au-ink">{o.title}</h3>
                <p className="text-xs text-au-faint">
                  {o.quarter?.replace('-', ' ') ?? 'Chorak belgilanmagan'} · {o.krs.length} KR · {HEALTH_LABEL[h]}
                </p>
              </div>
              <PersonAvatar person={o.owner_id ? api.personById.get(o.owner_id) : undefined} size={28} />
            </button>
            {isOpen && (
              <ul className="mt-3 ml-6 flex flex-col gap-3 border-l-2 border-au-line pl-5">
                {o.krs.map((k, ki) => {
                  const kp = krProgress(k);
                  const last = k.checkins[k.checkins.length - 1];
                  const linked = tasks.filter((t) => k.task_ids.includes(t.id));
                  return (
                    <li key={k.id} className="ms-rise relative" style={{ ['--i' as string]: ki }}>
                      <i className="absolute top-4 -left-5 h-0.5 w-4 bg-au-line" />
                      <div className="rounded-au-ctl border border-au-line bg-au-card-2 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 text-sm font-semibold text-au-ink">{k.title}</span>
                          {last && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: CONFIDENCE[last.confidence].c }}>
                              <i className="size-1.5 rounded-full" style={{ background: CONFIDENCE[last.confidence].c }} /> {CONFIDENCE[last.confidence].n}
                            </span>
                          )}
                          {k.jev_verdict && (
                            <span className="text-[11px] font-bold" style={{ color: JEV_VERDICT[k.jev_verdict].c }}>
                              Jev: {JEV_VERDICT[k.jev_verdict].n}
                            </span>
                          )}
                          <b className="text-xs tabular-nums">
                            {fmtKr(k.current, k.unit)} / {fmtKr(k.target_value, k.unit)}
                          </b>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-au-line/60">
                          <div className="ms-fill h-full rounded-full bg-au-ink" style={{ width: `${kp ?? 0}%` }} />
                        </div>
                      </div>
                      {linked.length > 0 && (
                        <ul className="mt-2 ml-5 flex flex-col gap-1 border-l border-dashed border-au-line pl-4">
                          {linked.map((t) => (
                            <li key={t.id} className="relative">
                              <i className="absolute top-3 -left-4 h-px w-3 bg-au-line" />
                              <button onClick={() => api.openTask(t.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-au-card-2">
                                <i className="size-2 shrink-0 rounded-full" style={{ background: STATUSES[t.status].c }} />
                                <span className={cn('min-w-0 flex-1 truncate', t.status === 'done' && 'text-au-faint line-through')}>{t.title}</span>
                                {isLate(t, api.today) && <AlertTriangle className="size-3 text-au-bad" />}
                                <PersonAvatar person={t.assignee_id ? api.personById.get(t.assignee_id) : undefined} size={18} />
                                <span className="w-16 text-right text-au-faint">{fmtDay(t.end_date)}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      {orphan.length > 0 && (
        <div className="sx-card p-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-au-ink">
            <Link2 className="size-4 text-au-faint" /> Hech qaysi KR’ga bog‘lanmagan vazifalar · {orphan.length}
          </h3>
          <p className="mb-3 text-xs text-au-faint">Har bir ish maqsadga xizmat qilishi kerak — OKR bo‘limida KR’ga bog‘lang yoki keraksizini yoping.</p>
          <div className="flex flex-wrap gap-1.5">
            {orphan.slice(0, 40).map((t) => (
              <button key={t.id} onClick={() => api.openTask(t.id)} className="rounded-full border border-au-line px-2.5 py-1 text-xs hover:bg-au-card-2">
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ task deps (drawer) */

export function DepsField({ api, taskId }: { api: WorkspaceApi; taskId: string }) {
  const [pending, start] = useTransition();
  const mine = api.deps.filter((d) => d.task_id === taskId).map((d) => d.depends_on);
  const blocks = api.deps.filter((d) => d.depends_on === taskId).map((d) => d.task_id);
  const byId = new Map(api.tasks.map((t) => [t.id, t]));
  const options = api.tasks.filter((t) => t.id !== taskId && !mine.includes(t.id));
  const save = (ids: string[]) => start(() => api.setDeps(taskId, ids));
  return (
    <div className="fld">
      <label className="flex items-center gap-1.5">
        <GitMerge className="size-3.5" /> Oldin bajarilishi kerak
      </label>
      <div className="flex flex-wrap gap-1.5">
        {mine.map((id) => {
          const t = byId.get(id);
          const late = t && byId.get(taskId) && byId.get(taskId)!.start_date <= t.end_date;
          return (
            <span key={id} className={cn('ms-pop-in inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs font-semibold', late ? 'bg-au-bad-soft text-au-bad' : 'bg-au-card-2 text-au-ink')} title={late ? 'Bu vazifa tugashidan oldin boshlanadi' : undefined}>
              {t?.title ?? '—'}
              <button disabled={pending} aria-label="Bog‘liqlikni olib tashlash" onClick={() => save(mine.filter((x) => x !== id))}>
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        <select className="sx-inp h-8 max-w-[220px] text-xs" value="" disabled={pending} onChange={(e) => e.target.value && save([...mine, e.target.value])} aria-label="Bog‘liqlik qo‘shish">
          <option value="">+ vazifa tanlash</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>
      {blocks.length > 0 && (
        <p className="mt-1 text-[11px] text-au-faint">
          Bu vazifani kutayotganlar: {blocks.map((id) => byId.get(id)?.title).filter(Boolean).join(', ')}
        </p>
      )}
    </div>
  );
}

export type { Dep };
