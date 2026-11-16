'use client';

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Target, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { daysBetween, fmtDay, isLate, WORKSTREAMS, type StrategyMilestone, type StrategySpace, type StrategyTask } from '@/lib/strategy';
import { HEALTH_LABEL, objectiveProgress, okrHealth, type Objective, type OkrHealth } from '@/lib/strategy-okr';
import { growth, moneyMonth } from '@/lib/strategy-money';
import { PersonAvatar } from './bits';
import type { BooksLite } from './view-finance';
import type { WorkspaceApi } from './strategy-workspace';

const mln = (v: number) => `${(v / 1e6).toFixed(Math.abs(v) >= 1e8 ? 0 : 1).replace('.', ',')} mln`;
const plural = (n: number, w: string) => `${n} ta ${w}`;

type Attention = { key: string; kind: 'late' | 'nobody' | 'review' | 'goal'; title: string; sub: string; run: () => void };

/**
 * Umumiy — the strategy at a glance (owner, 2026-11-16, Strategiya v3):
 * health, time, the four numbers that matter, what needs attention now,
 * goals, the next milestones and who carries the work. Every list item
 * opens the thing it names.
 */
export function OverviewView({
  api,
  space,
  tasks,
  okr,
  milestones,
  books,
  activeStudents,
  newStudents,
  finance,
  onGoals,
  onTasks,
  onMoney,
  onSettings,
}: {
  api: WorkspaceApi;
  space: StrategySpace;
  tasks: StrategyTask[];
  okr: Objective[];
  milestones: StrategyMilestone[];
  books: BooksLite | null;
  /** Operatsiya HQ «faol» count / new this month (strategy.finance only; null = hidden). */
  activeStudents: number | null;
  newStudents: number | null;
  finance: boolean;
  onGoals: () => void;
  onTasks: (filter?: 'late' | 'nobody' | 'review') => void;
  onMoney: () => void;
  onSettings: () => void;
}) {
  const { today, personById, openTask } = api;
  const span = Math.max(1, daysBetween(space.start_date, space.end_date));
  const elapsed = Math.max(0, Math.min(100, Math.round((daysBetween(space.start_date, today) / span) * 100)));
  const daysLeft = daysBetween(today, space.end_date);

  const done = tasks.filter((t) => t.status === 'done').length;
  const late = tasks.filter((t) => isLate(t, today));
  const open = tasks.filter((t) => t.status !== 'done');
  const nobody = open.filter((t) => !t.assignee_id);
  const review = tasks.filter((t) => t.status === 'review');
  const taskPct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  const goals = useMemo(
    () =>
      okr
        .filter((o) => o.status === 'active')
        .map((o) => {
          const p = objectiveProgress(o);
          return { o, p, h: okrHealth(p, elapsed) };
        }),
    [okr, elapsed],
  );
  const atRisk = goals.filter((g) => g.h === 'risk' || g.h === 'off');
  // Overall: goals when there are any measured, else tasks done.
  const measured = goals.filter((g) => g.p !== null);
  const overall = measured.length ? Math.round(measured.reduce((a, g) => a + (g.p ?? 0), 0) / measured.length) : taskPct;
  const verdict: { t: string; tone: 'ok' | 'warn' | 'bad' } =
    tasks.length === 0 && goals.length === 0
      ? { t: 'Hali reja kiritilmagan', tone: 'warn' }
      : late.length > Math.max(2, open.length / 3) || overall < elapsed - 30
        ? { t: 'Rejadan orqada', tone: 'bad' }
        : late.length || atRisk.length || overall < elapsed - 10
          ? { t: 'E’tibor kerak', tone: 'warn' }
          : { t: 'Reja bo‘yicha', tone: 'ok' };
  const headline =
    tasks.length === 0 && goals.length === 0
      ? 'Maqsad va vazifalarni qo‘shing — holat shu yerda hisoblanadi'
      : `${overall}% bajarildi, vaqtning ${elapsed}% o‘tdi${atRisk.length ? ` · ${plural(atRisk.length, 'maqsad')} xavf ostida` : ''}${late.length ? ` · ${plural(late.length, 'vazifa')} kechikkan` : ''}`;

  const money = useMemo(() => {
    if (!finance || !books) return null;
    const ym = today.slice(0, 7);
    const [y, m] = ym.split('-').map(Number);
    const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
    const cur = moneyMonth(books.accounts, books.opening, books.entries, ym);
    const was = moneyMonth(books.accounts, books.opening, books.entries, prev);
    return { cur, g: growth(cur.income, was.income) };
  }, [finance, books, today]);

  const attention: Attention[] = [
    ...late
      .sort((a, b) => a.end_date.localeCompare(b.end_date))
      .map((t) => ({
        key: `l${t.id}`,
        kind: 'late' as const,
        title: t.title,
        sub: `${daysBetween(t.end_date, today)} kun kechikdi · ${personById.get(t.assignee_id ?? '')?.first_name ?? 'mas’ul yo‘q'}`,
        run: () => openTask(t.id),
      })),
    ...atRisk.map(({ o, p, h }) => ({
      key: `g${o.id}`,
      kind: 'goal' as const,
      title: o.title,
      sub: `${HEALTH_LABEL[h]} · ${p ?? 0}% (vaqt ${elapsed}%)`,
      run: onGoals,
    })),
    ...nobody
      .filter((t) => !isLate(t, today))
      .map((t) => ({ key: `n${t.id}`, kind: 'nobody' as const, title: t.title, sub: `Mas’ul tayinlanmagan · muddat ${fmtDay(t.end_date)}`, run: () => openTask(t.id) })),
    ...review.map((t) => ({
      key: `r${t.id}`,
      kind: 'review' as const,
      title: t.title,
      sub: `Tasdiqlashni kutyapti · ${personById.get(t.assignee_id ?? '')?.first_name ?? '—'}`,
      run: () => openTask(t.id),
    })),
  ];

  const upcoming = milestones.filter((m) => m.date >= today).slice(0, 4);
  const byPerson = new Map<string, { open: number; late: number }>();
  for (const t of open) {
    const k = t.assignee_id ?? '';
    const v = byPerson.get(k) ?? { open: 0, late: 0 };
    v.open++;
    if (isLate(t, today)) v.late++;
    byPerson.set(k, v);
  }
  const load = [...byPerson.entries()].sort((a, b) => b[1].open - a[1].open);
  const maxLoad = Math.max(5, ...load.map(([, v]) => v.open));

  return (
    <div className="s3">
      <section className="s3-hero">
        <div className="s3-ring" style={{ '--p': overall } as React.CSSProperties} aria-label={`Umumiy bajarilish ${overall}%`}>
          <div className="tabular-nums">{overall}%</div>
        </div>
        <div className="min-w-0">
          <div className="k">Strategiya holati</div>
          <h2>{headline}</h2>
          <div className="s3-time" aria-label={`Vaqt: ${elapsed}% o‘tdi`}>
            <i style={{ width: `${elapsed}%` }} />
            <b style={{ left: `${Math.min(99.5, overall)}%` }} title={`Bajarilish ${overall}%`} />
          </div>
          <div className="s3-timek">
            <span>{fmtDay(space.start_date)}</span>
            <span>
              Bugun · {fmtDay(today)} · {daysLeft >= 0 ? `${daysLeft} kun qoldi` : `${-daysLeft} kun o‘tib ketdi`}
            </span>
            <span>{fmtDay(space.end_date)}</span>
          </div>
        </div>
        <div className="s3-herox">
          <span className={cn('s3-status', verdict.tone)}>
            <i />
            {verdict.t}
          </span>
          <button className="s3-ghost" onClick={onSettings}>
            Loyiha sozlamalari
          </button>
        </div>
      </section>

      <div className="s3-kpis">
        <button className="sx-card s3-kpi s3-click" onClick={onGoals}>
          <div className="l">Maqsadlar</div>
          <div className="v tabular-nums">{goals.length}</div>
          <div className="d">
            {goals.length === 0 ? 'hali qo‘shilmagan' : `${goals.length - atRisk.length} rejada`}
            {atRisk.length > 0 && <span className="neg"> · {atRisk.length} xavfda</span>}
          </div>
        </button>
        <button className="sx-card s3-kpi s3-click" onClick={() => onTasks()}>
          <div className="l">Vazifalar</div>
          <div className="v tabular-nums">
            {done} / {tasks.length}
          </div>
          <div className="d">
            bajarildi{late.length > 0 ? <span className="neg"> · {late.length} kechikkan</span> : ' · kechikkan yo‘q'}
          </div>
        </button>
        {money ? (
          <button className="sx-card s3-kpi s3-click" onClick={onMoney}>
            <div className="l">Shu oy daromadi</div>
            <div className="v tabular-nums">{money.cur.booked ? mln(money.cur.income) : '—'}</div>
            <div className="d">
              {money.g === null ? 'o‘tgan oy bilan solishtirib bo‘lmaydi' : <span className={money.g >= 0 ? 'pos' : 'neg'}>{`${money.g >= 0 ? '▲' : '▼'} ${Math.abs(money.g)}% o‘tgan oyga nisbatan`}</span>}
            </div>
          </button>
        ) : (
          <div className="sx-card s3-kpi">
            <div className="l">Tekshiruvda</div>
            <div className="v tabular-nums">{review.length}</div>
            <div className="d">tasdiqlashni kutayotgan vazifalar</div>
          </div>
        )}
        {activeStudents !== null ? (
          <div className="sx-card s3-kpi">
            <div className="l">Faol o‘quvchilar</div>
            <div className="v tabular-nums">{activeStudents}</div>
            <div className="d">{newStudents ? <span className="pos">+{newStudents} bu oy yangi</span> : 'bu oy yangi o‘quvchi yo‘q'} · Operatsiya HQ</div>
          </div>
        ) : (
          <div className="sx-card s3-kpi">
            <div className="l">Mas’ulsiz vazifalar</div>
            <div className="v tabular-nums">{nobody.length}</div>
            <div className="d">ochiq vazifalardan</div>
          </div>
        )}
      </div>

      <div className="s3-main">
        <section className="sx-card s3-card">
          <div className="s3-ch">
            <h3>E’tibor talab qiladi</h3>
            {attention.length > 0 && <span className="s3-src">{attention.length} ta</span>}
          </div>
          {attention.length === 0 ? (
            <div className="s3-empty ok">
              <CheckCircle2 className="size-5" />
              Hozir shoshilinch narsa yo‘q — kechikkan, mas’ulsiz yoki tasdiq kutayotgan vazifa yo‘q.
            </div>
          ) : (
            <div className="s3-att">
              {attention.slice(0, 7).map((a) => (
                <button key={a.key} onClick={a.run}>
                  <span className={cn('ic', a.kind)}>
                    {a.kind === 'late' ? <AlertTriangle className="size-4" /> : a.kind === 'nobody' ? <UserX className="size-4" /> : a.kind === 'goal' ? <Target className="size-4" /> : <CircleDashed className="size-4" />}
                  </span>
                  <span className="min-w-0">
                    <b>{a.title}</b>
                    <small>{a.sub}</small>
                  </span>
                  <span className={cn('s3-pill', a.kind)}>{{ late: 'Kechikkan', nobody: 'Mas’ulsiz', review: 'Tekshiruvda', goal: 'Maqsad' }[a.kind]}</span>
                </button>
              ))}
              {attention.length > 7 && (
                <button className="more" onClick={() => onTasks(late.length ? 'late' : 'nobody')}>
                  Yana {attention.length - 7} ta → Vazifalar
                </button>
              )}
            </div>
          )}
        </section>

        <section className="sx-card s3-card">
          <div className="s3-ch">
            <h3>Maqsadlar</h3>
            <button className="s3-link" onClick={onGoals}>
              Hammasi →
            </button>
          </div>
          {goals.length === 0 ? (
            <div className="s3-empty">
              Maqsad hali yo‘q. Choraklik 2–4 ta maqsad va ularning o‘lchanadigan natijalarini qo‘shing.
              <button className="sx-btn sm primary mt-2" onClick={onGoals}>
                Maqsad qo‘shish
              </button>
            </div>
          ) : (
            <div className="s3-goals">
              {goals.slice(0, 5).map(({ o, p, h }) => (
                <button key={o.id} onClick={onGoals}>
                  <span className="t">{o.title}</span>
                  <span className={cn('s3-pill', toneOf(h))}>{HEALTH_LABEL[h]}</span>
                  <span className="s3-pb">
                    <i className={toneOf(h)} style={{ width: `${p ?? 0}%` }} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="s3-two">
        <section className="sx-card s3-card">
          <div className="s3-ch">
            <h3>Yaqin muhim sanalar</h3>
            <button className="s3-link" onClick={onSettings}>
              Tahrirlash
            </button>
          </div>
          {upcoming.length === 0 ? (
            <div className="s3-empty">Oldinda muhim sana yo‘q. Loyiha sozlamalarida qo‘shing — ular vaqt jadvalida ham ko‘rinadi.</div>
          ) : (
            <div className="s3-ms">
              {upcoming.map((m) => {
                const d = daysBetween(today, m.date);
                return (
                  <div key={m.id}>
                    <span className="dd tabular-nums">
                      {+m.date.slice(8, 10)}
                      <small>{fmtDay(m.date).split('-')[1]}</small>
                    </span>
                    <b className="min-w-0 truncate">{m.title}</b>
                    <span className={cn('s3-pill', d <= 7 ? 'late' : 'mute')}>{d === 0 ? 'bugun' : `${d} kun`}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="sx-card s3-card">
          <div className="s3-ch">
            <h3>Jamoa yuklamasi</h3>
            <span className="s3-src">ochiq vazifalar</span>
          </div>
          {load.length === 0 ? (
            <div className="s3-empty">Ochiq vazifa yo‘q.</div>
          ) : (
            <div className="s3-team">
              {load.slice(0, 6).map(([id, v]) => {
                const p = personById.get(id);
                return (
                  <div key={id || 'none'}>
                    <PersonAvatar person={p} size={28} />
                    <span className={cn('min-w-0 truncate', !p && 'text-au-muted')}>{p ? `${p.first_name} ${p.last_name}` : 'Mas’ulsiz'}</span>
                    <span className="s3-load" aria-label={`${v.open} ochiq, ${v.late} kechikkan`}>
                      <i style={{ width: `${(v.open / maxLoad) * 100}%` }} />
                      {v.late > 0 && <i className="late" style={{ width: `${(v.late / maxLoad) * 100}%` }} />}
                    </span>
                    <span className="tabular-nums text-xs text-au-muted">
                      {v.open}
                      {v.late > 0 && <span className="neg"> · {v.late}⚠</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="s3-ws">
            {Object.entries(WORKSTREAMS).map(([k, w]) => {
              const n = open.filter((t) => t.workstream === k).length;
              return n ? (
                <span key={k}>
                  <i style={{ background: w.c }} />
                  {w.n} · {n}
                </span>
              ) : null;
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

const toneOf = (h: OkrHealth) => (h === 'ok' ? 'ok' : h === 'risk' ? 'review' : h === 'off' ? 'late' : 'mute');
