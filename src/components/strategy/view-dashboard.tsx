'use client';

import { useEffect, useRef, useState } from 'react';
import {
  MON,
  PRIORITIES,
  STATUSES,
  WORKSTREAMS,
  budgetTotals,
  daysBetween,
  fmtDay,
  isLate,
  type StrategySpace,
  type StrategyTask,
  type Priority,
  type TaskStatus,
} from '@/lib/strategy';
import { Donut } from './bits';
import type { WorkspaceApi } from './strategy-workspace';

/** Counts up from 0 once on mount (skipped for reduced motion). After that
 * it shows `value` as-is — it used to keep the first animated number, so the
 * stat tiles went stale when a task moved (and froze mid-count if `value`
 * changed during the animation). */
function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [n, setN] = useState<number | null>(null);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ran.current = true;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      if (k < 1) {
        setN(Math.round(value * (1 - Math.pow(1 - k, 3))));
        raf = requestAnimationFrame(tick);
      } else setN(null);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setN(null);
    };
  }, [value]);
  return (
    <>
      {n ?? value}
      {suffix}
    </>
  );
}

export function DashboardView({
  api,
  space,
  tasks: T,
  all,
  onGantt,
  onEditSpace,
}: {
  api: WorkspaceApi;
  space: StrategySpace;
  tasks: StrategyTask[];
  all: StrategyTask[];
  onGantt: () => void;
  onEditSpace: () => void;
}) {
  const { today } = api;
  const pct = all.length ? Math.round(all.reduce((a, t) => a + t.progress, 0) / all.length) : 0;
  const cnt = (k: TaskStatus) => T.filter((t) => t.status === k).length;
  const lateN = T.filter((t) => isLate(t, today)).length;
  const { plan: bP, act: bA } = budgetTotals(space.budget);
  const bMax = Math.max(1, ...space.budget.map((b) => b.plan));

  const r0 = space.start_date;
  const span = daysBetween(r0, space.end_date) + 1;
  const todayL = Math.min(100, Math.max(0, (daysBetween(r0, today) / span) * 100));
  const rows = [...T].sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 14);
  const weeks: string[] = [];
  for (let d = 0; d < span; d += 7) {
    const day = new Date(Date.parse(r0) + d * 864e5);
    weeks.push(`${day.getUTCDate()}-${MON[day.getUTCMonth()]}`);
  }
  const reviewN = all.filter((t) => t.status === 'review').length;
  const unassigned = all.filter((t) => !t.assignee_id && t.status !== 'done').length;
  const pending = [
    { n: 'Tekshiruvda', v: reviewN, c: '#ff9f1c' },
    { n: 'Kechikkan', v: all.filter((t) => isLate(t, today)).length, c: '#c7322b' },
    { n: "Mas'ulsiz", v: unassigned, c: '#2477c9' },
  ];
  const pmax = Math.max(1, ...pending.map((p) => p.v));

  return (
    <div className="sx-dash">
      <div className="sx-card hero sx-rise" style={{ '--i': 0 } as React.CSSProperties}>
        <div>
          <div className="k">Loyiha</div>
          <div className="big">{space.name}</div>
          <div className="text-[13px] text-au-muted">{space.subtitle}</div>
        </div>
        <div>
          <div className="k">Bugun</div>
          <div className="v tabular-nums">{today.split('-').reverse().join('.')}</div>
        </div>
        <div>
          <div className="k">Holat</div>
          <div className="v" style={{ color: lateN ? 'var(--au-bad)' : 'var(--au-ok)' }}>
            {lateN ? 'E’tibor kerak' : 'Rejada boryapti'}
          </div>
        </div>
        <div>
          <div className="k">Muddat</div>
          <div className="v tabular-nums">{fmtDay(space.end_date)}</div>
        </div>
        <div className="pct">
          <div className="sx-ring">
            <svg viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(23,22,26,.1)" strokeWidth="4" />
              <circle
                className="sx-ring-arc"
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="var(--au-ink)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${(94.2 * pct) / 100} 94.2`}
              />
            </svg>
            <b className="tabular-nums">
              <CountUp value={pct} suffix="%" />
            </b>
          </div>
          <div>
            <div className="k">Bajarildi</div>
            <div className="text-[13px] text-au-muted">
              {all.filter((t) => t.status === 'done').length} / {all.length} vazifa
            </div>
          </div>
        </div>
      </div>

      {[
        { l: 'Jami vazifalar', v: T.length, d: `${cnt('progress')} ta jarayonda` },
        { l: 'Bajarildi', v: cnt('done'), d: `${cnt('review')} ta tekshiruvda`, c: 'var(--au-ok)' },
        {
          l: "Muddati o'tgan",
          v: lateN,
          d: lateN ? "Darhol e'tibor kerak" : "Hammasi o'z vaqtida",
          c: lateN ? 'var(--au-bad)' : undefined,
        },
        { l: 'Budjet sarfi', v: bP ? Math.round((bA / bP) * 100) : 0, s: '%', d: `${bA} / ${bP} mln so'm` },
      ].map((k, i) => (
        <div key={k.l} className="sx-card kpi sx-rise" style={{ '--i': i + 1 } as React.CSSProperties}>
          <div className="l">{k.l}</div>
          <div className="v tabular-nums" style={{ color: k.c }}>
            <CountUp value={k.v} suffix={k.s} />
          </div>
          <div className="d">{k.d}</div>
        </div>
      ))}

      <div className="sx-card mg sx-rise" style={{ '--i': 5 } as React.CSSProperties}>
        <div className="ct">
          <h3>Ish oqimi (timeline)</h3>
          <button className="sx-btn sm" onClick={onGantt}>
            To‘liq Gantt →
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-au-faint">Filtrga mos vazifa yo‘q</p>
        ) : (
          <div className="mg-grid">
            <div />
            <div className="mg-head">
              {weeks.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            {rows.map((t, i) => {
              const l = (daysBetween(r0, t.start_date) / span) * 100;
              const w = ((daysBetween(t.start_date, t.end_date) + 1) / span) * 100;
              return (
                <div key={t.id} className="contents">
                  <button className="mg-name" onClick={() => api.openTask(t.id)}>
                    {t.title}
                  </button>
                  <div className="mg-track">
                    <button
                      className="mg-bar"
                      title={`${t.title} · ${fmtDay(t.start_date)}–${fmtDay(t.end_date)}`}
                      onClick={() => api.openTask(t.id)}
                      style={{
                        left: `${Math.max(0, l)}%`,
                        width: `${Math.max(1.5, Math.min(w, 100 - Math.max(0, l)))}%`,
                        background: isLate(t, today) ? 'var(--au-bad)' : STATUSES[t.status].c,
                        animationDelay: `${Math.min(i, 12) * 40}ms`,
                      }}
                    />
                    <div className="mg-today" style={{ left: `${todayL}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="sx-card pie sx-rise" style={{ '--i': 6 } as React.CSSProperties}>
        <div className="ct">
          <h3>Vazifa holati</h3>
        </div>
        <div className="donut">
          <Donut
            parts={(Object.keys(STATUSES) as TaskStatus[]).map((k) => ({ v: cnt(k), c: STATUSES[k].c }))}
            total={T.length}
            label="vazifa"
          />
        </div>
        <div className="legend">
          {(Object.keys(STATUSES) as TaskStatus[]).map((k) => (
            <div key={k}>
              <i style={{ background: STATUSES[k].c }} />
              {STATUSES[k].n}
              <b>{cnt(k)}</b>
            </div>
          ))}
          <div>
            <i style={{ background: 'var(--au-bad)' }} />
            Kechikkan<b>{lateN}</b>
          </div>
        </div>
      </div>

      <div className="sx-card pie sx-rise" style={{ '--i': 7 } as React.CSSProperties}>
        <div className="ct">
          <h3>Ustuvorlik</h3>
        </div>
        <div className="donut">
          <Donut
            parts={(Object.keys(PRIORITIES) as Priority[]).map((k) => ({
              v: T.filter((t) => t.priority === k).length,
              c: PRIORITIES[k].c,
            }))}
            total={T.length}
            label="vazifa"
          />
        </div>
        <div className="legend">
          {(Object.keys(PRIORITIES) as Priority[]).map((k) => (
            <div key={k}>
              <i style={{ background: PRIORITIES[k].c }} />
              {PRIORITIES[k].n}
              <b>{T.filter((t) => t.priority === k).length}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="sx-card budget sx-rise" style={{ '--i': 8 } as React.CSSProperties}>
        <div className="ct">
          <h3>Budjet</h3>
          <small>mln so‘m · reja / fakt{bP > 0 ? ` · ${bA} / ${bP}` : ''}</small>
          <button className="sx-btn sm ml-auto" onClick={onEditSpace}>
            Tahrirlash
          </button>
        </div>
        {space.budget.length === 0 && (
          <p className="text-sm text-au-faint">Budjet kiritilmagan — «Tahrirlash» orqali yo‘nalishlar bo‘yicha reja va faktni kiriting.</p>
        )}
        {space.budget.map((b, i) => (
          <div key={b.ws} className="bgt-row">
            <div className="top">
              <span>{WORKSTREAMS[b.ws]?.n ?? b.ws}</span>
              <span className="tabular-nums">
                {b.act} / {b.plan}
              </span>
            </div>
            <div className="bgt-track">
              <div className="plan" style={{ width: `${(b.plan / bMax) * 100}%` }} />
              <div
                className="act"
                style={{
                  width: `${(b.act / bMax) * 100}%`,
                  background: WORKSTREAMS[b.ws]?.c,
                  animationDelay: `${200 + i * 70}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="sx-card pend sx-rise" style={{ '--i': 9 } as React.CSSProperties}>
        <div className="ct">
          <h3>E’tibor talab qiladi</h3>
        </div>
        <div className="vbars">
          {pending.map((p, i) => (
            <div key={p.n}>
              <b className="tabular-nums">{p.v}</b>
              <span
                style={{ height: `${Math.max(4, (p.v / pmax) * 100)}%`, background: p.c, animationDelay: `${i * 90}ms` }}
              />
            </div>
          ))}
        </div>
        <div className="vlabels">
          {pending.map((p) => (
            <span key={p.n}>{p.n}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
