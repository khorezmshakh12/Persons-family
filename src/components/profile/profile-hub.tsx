'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  BadgeCheck,
  BookOpen,
  CalendarHeart,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  FileDown,
  Gauge,
  KeyRound,
  Lock,
  NotebookPen,
  Pencil,
  Plus,
  Send,
  Smile,
  Sparkles,
  Star,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { TaskCommentsDrawer } from '@/components/tasks/task-comments-drawer';
import { cn } from '@/lib/utils';
import { CARD_TITLE, CHIP_ACCENT, CHIP_BAD, CHIP_INFO, CHIP_NEUTRAL, CHIP_OK, INPUT, SURFACE_CARD } from '@/lib/glass';
import {
  addPrivateNoteAction,
  deleteOneOnOneAction,
  deletePrivateNoteAction,
  deleteSkillAction,
  getProfileMetricsAction,
  saveOneOnOneAction,
  saveSkillAction,
  updateBioAction,
  verifySkillAction,
} from '@/lib/actions/profile-hub';
import { PROFILE_METRIC, type ProfileMetricKey } from '@/lib/profile-metrics';
import type { ActivityItem, OneOnOne, PrivateNote, ProfileCard, ProfileMetrics, Skill, WorkSnapshot } from '@/lib/profile-insights';
import { useLocale, useTranslations } from 'next-intl';
import { monthName } from '@/lib/month-names';

const BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-au-ctl px-3 h-8 text-xs font-semibold transition active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none';
const BTN_GHOST = cn(BTN, 'border border-au-line bg-au-card text-au-ink hover:bg-au-card-2');
const BTN_PRIMARY = cn(BTN, 'bg-au-primary text-au-primary-ink hover:opacity-90');
type Tr = ReturnType<typeof useTranslations>;
const ERR: Record<string, string> = { forbidden: 'eForbidden', invalidInput: 'eInvalid' };
/** Translated helpers for every card of the profile. */
function useHub() {
  const t = useTranslations('profile.hub');
  const tm = useTranslations('profile.metric');
  const locale = useLocale();
  const errText = (c: string) => t(ERR[c] ?? 'eOther');
  const mShort = (m: string) => monthName(locale, Number(m.slice(5, 7)), true);
  const metricN = (k: ProfileMetricKey) => tm(k);
  const unitOf = (k: ProfileMetricKey) => (k === 'selfDev' ? t('unitBall') : PROFILE_METRIC[k].unit);
  return { t, errText, mShort, metricN, unitOf };
}

function Card({ title, icon, i = 0, action, children, className }: { title: string; icon: ReactNode; i?: number; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section style={{ ['--i' as string]: i }} className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-3 p-4 sm:p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
          <span className="text-au-muted">{icon}</span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------ hero strip */

const STATUS: Record<string, string> = { lesson: 'stLesson', meeting: 'stMeeting', busy: 'stBusy', away: 'stAway' };

/** null = no hire date, 'new' = under a month. */
function tenure(hire: string | null, today: string, t: Tr): string | null {
  if (!hire) return null;
  const [y1, m1] = hire.split('-').map(Number);
  const [y2, m2] = today.split('-').map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1);
  if (months < 1) return 'new';
  return months >= 12 ? `${t('years', { y: Math.floor(months / 12) })} ${months % 12 ? t('months', { m: months % 12 }) : ''}`.trim() : t('months', { m: months });
}

function daysUntil(md: string | null, today: string) {
  if (!md) return null;
  const [, m, d] = md.split('-').map(Number);
  const [y] = today.split('-').map(Number);
  const now = Date.UTC(y, Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  let next = Date.UTC(y, m - 1, d);
  if (next < now) next = Date.UTC(y + 1, m - 1, d);
  return Math.round((next - now) / 86_400_000);
}

export function ProfileStrip({
  staffId,
  card,
  positions,
  today,
  isSelf,
  isLead,
  showPct,
  metrics,
  name,
}: {
  staffId: string;
  card: ProfileCard;
  positions: string[];
  today: string;
  isSelf: boolean;
  isLead: boolean;
  /** HR view: the profile % ring as the CEO sees it (owner, 2026-11-23). */
  showPct?: boolean;
  metrics: ProfileMetrics;
  name: string;
}) {
  const { t, metricN, unitOf, mShort } = useHub();
  const ten = tenure(card.hire_date, today, t);
  const bday = daysUntil(card.date_of_birth, today);
  const anniv = card.hire_date ? daysUntil(card.hire_date, today) : null;
  const pct = card.completeness.pct;
  return (
    <div className="ms-rise flex flex-wrap items-center gap-2">
      {positions.map((p) => (
        <span key={p} className={CHIP_ACCENT}>
          {p}
        </span>
      ))}
      {ten && <span className={CHIP_NEUTRAL}>{t('tenure', { t: ten === 'new' ? t('newHire') : ten })}</span>}
      {card.chat_status && <span className={CHIP_INFO}>{STATUS[card.chat_status] ? t(STATUS[card.chat_status]) : card.chat_status}</span>}
      {bday !== null && bday <= 7 && (
        <span className={CHIP_OK}>
          <CalendarHeart className="size-3" /> {bday === 0 ? t('bdayToday') : t('bdayIn', { n: bday })}
        </span>
      )}
      {anniv !== null && anniv <= 7 && ten && ten !== 'new' && <span className={CHIP_OK}>{anniv === 0 ? t('annivToday') : t('annivIn', { n: anniv })}</span>}
      {!card.telegram && <span className={CHIP_BAD}>{t('noTg')}</span>}
      <div className="ml-auto flex items-center gap-2">
        {(isSelf || isLead || showPct) && (
          <span className="flex items-center gap-1.5 text-xs text-au-muted" title={card.completeness.missing.length ? t('missing', { m: card.completeness.missing.join(', ') }) : t('complete')}>
            <Ring pct={pct} /> {t('profilePct', { n: pct })}
          </span>
        )}
        {isLead && (
          <button className={BTN_GHOST} onClick={() => exportProfilePdf(name, positions, card, metrics, { head: t('pdfMetric'), metricN, unitOf, mShort })}>
            <FileDown className="size-3.5" /> PDF
          </button>
        )}
      </div>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" className="-rotate-90">
      <circle cx={10} cy={10} r={r} fill="none" stroke="var(--au-ring-track, var(--au-line))" strokeWidth={3} />
      <circle
        cx={10}
        cy={10}
        r={r}
        fill="none"
        stroke={pct >= 80 ? 'var(--au-ok)' : 'var(--au-accent)'}
        strokeWidth={3}
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        strokeLinecap="round"
        className="ms-arc"
      />
    </svg>
  );
}

/* ------------------------------------------------------------ metrics */

export function MetricsCard({ metrics, people, staffId, isLead }: { metrics: ProfileMetrics; people: { id: string; name: string }[]; staffId: string; isLead: boolean }) {
  const keys = Object.keys(PROFILE_METRIC) as ProfileMetricKey[];
  const [sel, setSel] = useState<ProfileMetricKey>('tasksDone');
  const [cmp, setCmp] = useState<{ name: string; metrics: ProfileMetrics } | null>(null);
  const [busy, start] = useTransition();
  const { t, errText, mShort, metricN, unitOf } = useHub();
  const vals = metrics.series[sel];
  const other = cmp?.metrics.series[sel];
  const max = Math.max(1, ...vals.map((v) => Math.abs(v ?? 0)), ...(other ?? []).map((v) => Math.abs(v ?? 0)));
  const unit = unitOf(sel);
  const fmt = (v: number | null) => (v === null ? '—' : `${Math.round(v)}${unit}`);
  const lastOf = (k: ProfileMetricKey) => {
    const s = metrics.series[k];
    for (let i = s.length - 1; i >= 0; i--) if (s[i] !== null) return s[i];
    return null;
  };

  return (
    <Card
      title={t('metrics')}
      icon={<Gauge className="size-4" />}
      i={1}
      action={
        isLead ? (
          <select
            className={cn(INPUT, 'h-8 w-auto text-xs')}
            value=""
            disabled={busy}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              start(async () => {
                const res = await getProfileMetricsAction(id);
                if (res.error !== undefined) return void toast.error(errText(res.error));
                setCmp({ name: res.name, metrics: res.metrics });
              });
            }}
          >
            <option value="">{cmp ? t('compareWith', { n: cmp.name }) : t('compare')}</option>
            {people
              .filter((p) => p.id !== staffId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {keys.map((k, i) => (
          <button
            key={k}
            onClick={() => setSel(k)}
            style={{ ['--i' as string]: i }}
            className={cn('ms-rise flex flex-col rounded-au-ctl border px-3 py-2 text-left transition', sel === k ? 'border-au-accent bg-au-accent-soft' : 'border-au-line hover:bg-au-card-2')}
          >
            <span className="text-[11px] font-semibold text-au-muted">{metricN(k)}</span>
            <span className="text-lg font-bold tabular-nums">
              {lastOf(k) === null ? '—' : `${Math.round(lastOf(k)!)}${unitOf(k)}`}
            </span>
          </button>
        ))}
      </div>
      <div className="flex h-36 items-end gap-1.5">
        {vals.map((v, i) => (
          <div key={metrics.months[i]} className="group flex h-full flex-1 items-end justify-center gap-0.5" title={`${metrics.months[i].slice(0, 7)}: ${fmt(v)}${other ? ` · ${cmp?.name}: ${fmt(other[i])}` : ''}`}>
            <span
              style={{ height: `${v === null ? 0 : Math.max(3, (Math.abs(v) / max) * 100)}%`, ['--i' as string]: i }}
              className={cn('ms-grow-y w-full max-w-5 rounded-t', i === vals.length - 1 ? 'bg-au-accent' : (v ?? 0) < 0 ? 'bg-au-bad/60' : 'bg-au-ink/30 group-hover:bg-au-ink/50')}
            />
            {other && (
              <span
                style={{ height: `${other[i] === null ? 0 : Math.max(3, (Math.abs(other[i]!) / max) * 100)}%`, ['--i' as string]: i }}
                className="ms-grow-y w-full max-w-5 rounded-t bg-au-info/60"
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 text-center text-[10px] text-au-muted">
        {metrics.months.map((m) => (
          <span key={m} className="flex-1">
            {mShort(m)}
          </span>
        ))}
      </div>
      {cmp && (
        <p className="flex items-center gap-3 text-[11px] text-au-muted">
          <span className="flex items-center gap-1">
            <i className="size-2 rounded-full bg-au-ink/40" /> {t('thisStaff')}
          </span>
          <span className="flex items-center gap-1">
            <i className="size-2 rounded-full bg-au-info" /> {cmp.name}
          </span>
          <button className="ml-auto hover:text-au-ink" onClick={() => setCmp(null)}>
            {t('closeCompare')}
          </button>
        </p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ activity */

const KIND_ICON: Record<ActivityItem['kind'], ReactNode> = {
  task: <CheckCircle2 className="size-3.5 text-au-ok" />,
  selfdev: <BookOpen className="size-3.5 text-au-info" />,
  kpi: <Target className="size-3.5 text-au-accent-text" />,
  issue: <CircleDot className="size-3.5 text-au-ok" />,
  star: <Star className="size-3.5 text-au-accent-text" />,
  oneOnOne: <Users className="size-3.5 text-au-muted" />,
};

export function ActivityCard({ items }: { items: ActivityItem[] }) {
  const { t } = useHub();
  const ta = useTranslations('profile.act');
  const textOf = (a: ActivityItem) => (a.k ? ta(a.k, a.v) : a.text);
  return (
    <Card title={t('activity')} icon={<Sparkles className="size-4" />} i={2}>
      {items.length === 0 ? (
        <p className="text-sm text-au-muted">{t('noActivity')}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((a, i) => (
            <li key={i} style={{ ['--i' as string]: Math.min(i, 12) }} className="ms-rise flex items-start gap-2 text-sm">
              <span className="mt-0.5">{KIND_ICON[a.kind]}</span>
              <span className="min-w-0 flex-1">
                {a.href ? (
                  <Link href={a.href} className="hover:underline">
                    {textOf(a)}
                  </Link>
                ) : (
                  textOf(a)
                )}
              </span>
              <span className="shrink-0 text-[11px] text-au-muted tabular-nums">{a.at.slice(5, 10).replace('-', '.')}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ about + skills */

export function AboutCard({ staffId, bio, skills: initial, canEdit, isLead }: { staffId: string; bio: string | null; skills: Skill[]; canEdit: boolean; isLead: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(bio ?? '');
  const [skills, setSkills] = useState(initial);
  const [name, setName] = useState('');
  const [level, setLevel] = useState(3);
  const [busy, start] = useTransition();
  const { t, errText } = useHub();

  const saveBio = () =>
    start(async () => {
      const res = await updateBioAction(staffId, text);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setEditing(false);
      router.refresh();
    });
  const addSkill = (n = name, l = level) =>
    start(async () => {
      const res = await saveSkillAction({ staffId, name: n.trim(), level: l });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setSkills([...skills.filter((s) => s.name.toLowerCase() !== n.trim().toLowerCase()), { id: res.id, name: n.trim(), level: l, verified: isLead }].sort((a, b) => b.level - a.level));
      setName('');
    });
  const del = (id: string) =>
    start(async () => {
      const res = await deleteSkillAction(id);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setSkills(skills.filter((s) => s.id !== id));
    });
  const verify = (s: Skill) =>
    start(async () => {
      const res = await verifySkillAction(s.id, !s.verified);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setSkills(skills.map((x) => (x.id === s.id ? { ...x, verified: !s.verified } : x)));
    });

  return (
    <Card
      title={t('about')}
      icon={<Smile className="size-4" />}
      i={3}
      action={
        canEdit && !editing ? (
          <button className={BTN_GHOST} onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> {t('edit')}
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1000} className={cn(INPUT, 'py-2')} placeholder={t('bioPh')} />
          <div className="flex justify-end gap-2">
            <button className={BTN_GHOST} onClick={() => setEditing(false)}>
              {t('cancel')}
            </button>
            <button className={BTN_PRIMARY} disabled={busy} onClick={saveBio}>
              {t('save')}
            </button>
          </div>
        </div>
      ) : bio ? (
        <p className="text-sm whitespace-pre-wrap">{bio}</p>
      ) : (
        <p className="text-sm text-au-muted italic">{canEdit ? t('writeAbout') : t('noInfo')}</p>
      )}

      <div className="flex flex-col gap-2 border-t border-au-line pt-3">
        <span className="text-xs font-bold tracking-wide text-au-muted uppercase">{t('skills')}</span>
        {skills.length === 0 && <p className="text-sm text-au-muted">{t('noSkills')}</p>}
        <ul className="flex flex-col gap-1.5">
          {skills.map((s, i) => (
            <li key={s.id} style={{ ['--i' as string]: i }} className="ms-rise flex items-center gap-2">
              <span className="w-36 truncate text-sm font-semibold">{s.name}</span>
              <span className="flex flex-1 gap-0.5" aria-label={t('level', { n: s.level })}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    disabled={!canEdit || busy}
                    onClick={() => addSkill(s.name, n)}
                    className={cn('h-2 flex-1 rounded-full transition', n <= s.level ? 'bg-au-accent' : 'bg-au-card-2', canEdit && 'hover:opacity-80')}
                  />
                ))}
              </span>
              {s.verified ? (
                <button disabled={!isLead} onClick={() => verify(s)} className={CHIP_OK} title={t('ceoVerified')}>
                  <BadgeCheck className="size-3" />
                </button>
              ) : isLead ? (
                <button onClick={() => verify(s)} className={cn(CHIP_NEUTRAL, 'hover:text-au-ink')} title={t('verify')}>
                  <BadgeCheck className="size-3" />
                </button>
              ) : null}
              {canEdit && (
                <button onClick={() => del(s.id)} className="text-au-muted hover:text-au-bad" aria-label={t('delete')}>
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('skillPh')} className={cn(INPUT, 'h-8 flex-1 text-sm')} />
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className={cn(INPUT, 'h-8 w-16 text-sm')}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button className={BTN_GHOST} disabled={busy || name.trim().length < 2} onClick={() => addSkill()}>
              <Plus className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ work tab */

const TASK_STATUS: Record<string, [string, string]> = {
  pending: ['sPending', CHIP_NEUTRAL],
  in_progress: ['sInProgress', CHIP_INFO],
  submitted: ['sSubmitted', CHIP_ACCENT],
  awaiting_upload: ['sAwaiting', CHIP_ACCENT],
  done: ['sDone', CHIP_OK],
};

/** `commenterId`: HR / CEO viewing someone's work — each task gets its comment thread (owner, 2026-11-23). */
function TaskDetails({ t: task, late }: { t: WorkSnapshot['tasks'][number]; late: boolean }) {
  const { t } = useHub();
  const row = (k: string, v: ReactNode) => (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-au-muted">{k}</dt>
      <dd className="min-w-0 flex-1">{v}</dd>
    </div>
  );
  return (
    <dl className="mt-2 ml-5 flex flex-col gap-1 rounded-au-ctl bg-au-card-2 px-3 py-2 text-xs">
      {row(t('dDesc'), task.description?.trim() ? <span className="whitespace-pre-wrap">{task.description}</span> : <span className="text-au-muted">—</span>)}
      {row(t('dDue'), task.due_at ? <span className={cn('tabular-nums', late && 'font-bold text-au-bad')}>{task.due_at}{late ? t('late') : ''}</span> : t('noDue'))}
      {row(t('dGiven'), <span className="tabular-nums">{task.created}{task.assigner ? ` · ${task.assigner}` : ''}</span>)}
      {task.done_at && row(t('dDone'), <span className="tabular-nums">{task.done_at}</span>)}
      {row(t('dReward'), task.star_reward > 0 ? `+${task.star_reward} ★` : '—')}
      {row(
        t('dPenalty'),
        task.star_penalty > 0 ? (
          <span className={task.penalty_applied ? 'font-bold text-au-bad' : undefined}>
            −{task.star_penalty} ★ {task.penalty_applied ? t('penApplied') : t('penIfLate')}
          </span>
        ) : (
          '—'
        ),
      )}
      {task.requires_proof && row(t('dProof'), t('proofNeeded'))}
    </dl>
  );
}

export function WorkTab({ work, today, commenterId }: { work: WorkSnapshot; today: string; commenterId?: string }) {
  const open = work.tasks.filter((t) => t.status !== 'done').length;
  const [openId, setOpenId] = useState<string | null>(null);
  const { t } = useHub();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title={t('tasks', { open, done: work.tasks.length - open })} icon={<CheckCircle2 className="size-4" />} i={0} className="lg:row-span-2">
        {work.tasks.length === 0 ? (
          <p className="text-sm text-au-muted">{t('noTasks')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-au-line">
            {work.tasks.map((task, i) => {
              const late = task.deadline && task.deadline.slice(0, 10) < today && (task.status === 'pending' || task.status === 'in_progress');
              const [n, cls] = TASK_STATUS[task.status] ? [t(TASK_STATUS[task.status][0]), TASK_STATUS[task.status][1]] : [task.status, CHIP_NEUTRAL];
              const tt = task;
              return (
                <li key={tt.id} style={{ ['--i' as string]: Math.min(i, 12) }} className="ms-rise flex flex-col py-2">
                  <div className="flex items-center gap-2">
                    {/* Title opens the details (owner, 2026-11-23: HR sees description, deadline, stars). */}
                    <button
                      type="button"
                      onClick={() => setOpenId(openId === tt.id ? null : tt.id)}
                      className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm font-semibold hover:underline"
                    >
                      <ChevronDown className={cn('size-3.5 shrink-0 text-au-muted transition', openId === tt.id && 'rotate-180')} />
                      <span className="truncate">{tt.title}</span>
                    </button>
                    {tt.deadline && <span className={cn('text-[11px] tabular-nums', late ? 'font-bold text-au-bad' : 'text-au-muted')}>{tt.deadline.slice(5, 10).replace('-', '.')}</span>}
                    <span className={cls}>{n}</span>
                    {commenterId && (
                      <TaskCommentsDrawer taskId={tt.id} taskTitle={tt.title} currentUserId={commenterId} canComment commentCount={tt.comments} />
                    )}
                  </div>
                  {openId === tt.id && <TaskDetails t={tt} late={!!late} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title={t('okr')} icon={<Target className="size-4" />} i={1}>
        {work.krs.length === 0 ? (
          <p className="text-sm text-au-muted">{t('noKr')}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {work.krs.map((k) => (
              <li key={k.id} className="flex flex-col gap-1">
                <span className="text-sm font-semibold">{k.title}</span>
                <span className="text-[11px] text-au-muted">{k.objective}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-au-card-2">
                  <i className="ms-fill block h-full rounded-full bg-au-accent" style={{ width: `${k.progress ?? 0}%` }} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t('groups', { n: work.groups.length })} icon={<Users className="size-4" />} i={2}>
        {work.groups.length === 0 ? (
          <p className="text-sm text-au-muted">{t('noGroups')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {work.groups.map((g) => (
              <Link key={g.id} href={`/lesson-plans/${g.id}`} className={cn(CHIP_NEUTRAL, 'hover:text-au-ink')}>
                {g.name}
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ 1:1 + notes */

const MOOD = ['', '😟', '😕', '😐', '🙂', '😄'];

export function PeopleTab({
  staffId,
  name,
  meetings: initial,
  notes: initialNotes,
  isLead,
  today,
}: {
  staffId: string;
  name: string;
  meetings: OneOnOne[];
  notes: PrivateNote[] | null;
  isLead: boolean;
  today: string;
}) {
  const router = useRouter();
  const [meetings, setMeetings] = useState(initial);
  const [form, setForm] = useState<{ id?: string; heldOn: string; agenda: string; notes: string; mood: number | null } | null>(null);
  const [notes, setNotes] = useState(initialNotes ?? []);
  const [note, setNote] = useState('');
  const [busy, start] = useTransition();
  const { t, errText } = useHub();

  const save = () =>
    form &&
    start(async () => {
      const res = await saveOneOnOneAction({ staffId, ...form });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      const row: OneOnOne = { id: res.id, held_on: form.heldOn, agenda: form.agenda, notes: form.notes, mood: form.mood, lead: t('you'), task_ids: [] };
      setMeetings([row, ...meetings.filter((m) => m.id !== res.id)].sort((a, b) => (a.held_on < b.held_on ? 1 : -1)));
      setForm(null);
      toast.success(t('saved11'));
      router.refresh();
    });
  const del = (id: string) =>
    start(async () => {
      const res = await deleteOneOnOneAction(id);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setMeetings(meetings.filter((m) => m.id !== id));
    });
  const addNote = () =>
    start(async () => {
      const res = await addPrivateNoteAction(staffId, note);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setNotes([{ id: res.id, body: note.trim(), at: new Date().toISOString(), author: t('you') }, ...notes]);
      setNote('');
    });
  const delNote = (id: string) =>
    start(async () => {
      const res = await deletePrivateNoteAction(id);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setNotes(notes.filter((n) => n.id !== id));
    });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card
        title={t('oneOnOnes')}
        icon={<Users className="size-4" />}
        i={0}
        action={
          isLead && !form ? (
            <button className={BTN_PRIMARY} onClick={() => setForm({ heldOn: today, agenda: '', notes: '', mood: null })}>
              <Plus className="size-3.5" /> {t('new')}
            </button>
          ) : undefined
        }
      >
        {form && (
          <div className="ms-pop-in flex flex-col gap-2 rounded-au-ctl border border-au-line bg-au-card-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={form.heldOn} onChange={(e) => setForm({ ...form, heldOn: e.target.value })} className={cn(INPUT, 'h-8 w-auto text-sm')} />
              <span className="flex gap-1" aria-label={t('mood')}>
                {[1, 2, 3, 4, 5].map((m) => (
                  <button key={m} onClick={() => setForm({ ...form, mood: form.mood === m ? null : m })} className={cn('rounded-md px-1.5 text-lg transition', form.mood === m ? 'bg-au-accent-soft' : 'opacity-50 hover:opacity-100')}>
                    {MOOD[m]}
                  </button>
                ))}
              </span>
            </div>
            <textarea value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} rows={2} placeholder={t('agenda')} className={cn(INPUT, 'py-2 text-sm')} />
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} placeholder={t('notesPh')} className={cn(INPUT, 'py-2 text-sm')} />
            <div className="flex flex-wrap justify-end gap-2">
              <button className={BTN_GHOST} onClick={() => setForm(null)}>
                {t('cancel')}
              </button>
              <button className={BTN_PRIMARY} disabled={busy} onClick={save}>
                {t('save')}
              </button>
            </div>
          </div>
        )}
        {meetings.length === 0 && !form ? (
          <p className="text-sm text-au-muted">{isLead ? t('no11With', { n: name }) : t('no11')}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {meetings.map((m, i) => (
              <li key={m.id} style={{ ['--i' as string]: Math.min(i, 10) }} className="ms-rise flex flex-col gap-1.5 rounded-au-ctl border border-au-line p-3">
                <div className="flex items-center gap-2">
                  <b className="text-sm tabular-nums">{m.held_on}</b>
                  {m.mood && <span title={t('mood')}>{MOOD[m.mood]}</span>}
                  <span className="text-[11px] text-au-muted">{m.lead}</span>
                  {isLead && (
                    <span className="ml-auto flex gap-1">
                      <button className="text-au-muted hover:text-au-ink" onClick={() => setForm({ id: m.id, heldOn: m.held_on, agenda: m.agenda, notes: m.notes, mood: m.mood })} aria-label={t('edit')}>
                        <Pencil className="size-3.5" />
                      </button>
                      <button className="text-au-muted hover:text-au-bad" onClick={() => del(m.id)} aria-label={t('delete')}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  )}
                </div>
                {m.agenda && (
                  <p className="text-sm">
                    <b className="text-[11px] font-bold text-au-muted uppercase">{t('agendaL')}</b> {m.agenda}
                  </p>
                )}
                {m.notes && <p className="text-sm whitespace-pre-wrap">{m.notes}</p>}
                {isLead && (
                  <Link
                    href={`/tasks?new=1&title=${encodeURIComponent(`1:1 (${m.held_on}): `)}&desc=${encodeURIComponent(m.notes.slice(0, 500))}`}
                    className="inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-au-muted hover:text-au-ink"
                  >
                    <Send className="size-3" /> {t('taskFrom')}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {isLead && (
        <Card title={t('privateNotes')} icon={<Lock className="size-4" />} i={1}>
          <p className="text-[11px] text-au-muted">{t('privateHint')}</p>
          <div className="flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePh')} className={cn(INPUT, 'h-8 flex-1 text-sm')} />
            <button className={BTN_GHOST} disabled={busy || note.trim().length < 2} onClick={addNote}>
              <NotebookPen className="size-3.5" />
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {notes.map((n) => (
              <li key={n.id} className="flex items-start gap-2 rounded-au-ctl bg-au-card-2 px-3 py-2 text-sm">
                <span className="flex-1">
                  {n.body}
                  <span className="block text-[11px] text-au-muted">
                    {n.author} · {n.at.slice(0, 10)}
                  </span>
                </span>
                <button className="text-au-muted hover:text-au-bad" onClick={() => delNote(n.id)} aria-label={t('delete')}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ account tab */

export function AccountTab({ card, isSelf }: { card: ProfileCard; isSelf: boolean }) {
  const { t } = useHub();
  const rows: [string, ReactNode][] = [
    ['Telegram', card.telegram ? <span className={CHIP_OK}>{t('connected')}</span> : <span className={CHIP_BAD}>{t('notConnected')}</span>],
    [t('lastSeen'), card.last_seen_at ? card.last_seen_at.slice(0, 16).replace('T', ' ') : <span className="text-au-muted">{t('noData')}</span>],
    [t('completeness'), `${card.completeness.pct}%`],
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title={t('account')} icon={<KeyRound className="size-4" />} i={0}>
        <dl className="flex flex-col divide-y divide-au-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2 text-sm">
              <dt className="text-au-muted">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        {card.completeness.missing.length > 0 && (
          <p className="text-xs text-au-muted">
            {t('notFilled')} <b className="text-au-ink">{card.completeness.missing.join(', ')}</b>
          </p>
        )}
      </Card>
      {isSelf && (
        <Card title={t('settings')} icon={<Lock className="size-4" />} i={1}>
          <div className="flex flex-col gap-2">
            <Link href="/settings" className={cn(BTN_GHOST, 'h-9 justify-start')}>
              <KeyRound className="size-4" /> {t('pwTheme')}
            </Link>
            {!card.telegram && (
              <Link href="/settings" className={cn(BTN_GHOST, 'h-9 justify-start')}>
                <Send className="size-4" /> {t('connectTg')}
              </Link>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ PDF */

const latin = (s: string) => s.replace(/[‘’ʻʼ`]/g, "'").replace(/[−–—]/g, '-').replace(/·/g, '-').replace(/★/g, '*');

type PdfLabels = { head: string; metricN: (k: ProfileMetricKey) => string; unitOf: (k: ProfileMetricKey) => string; mShort: (m: string) => string };

async function exportProfilePdf(name: string, positions: string[], card: ProfileCard, metrics: ProfileMetrics, L: PdfLabels) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFillColor(27, 31, 42);
  doc.rect(0, 0, 297, 24, 'F');
  doc.setTextColor(255);
  doc.setFontSize(15);
  doc.text(latin(name), 14, 12);
  doc.setFontSize(9);
  doc.text(latin(positions.join(', ')), 14, 19);
  doc.setTextColor(20);
  if (card.bio) {
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(latin(card.bio), 270), 14, 32);
  }
  autoTable(doc, {
    startY: card.bio ? 44 : 32,
    head: [[latin(L.head), ...metrics.months.map((m) => latin(L.mShort(m)))]],
    body: (Object.keys(PROFILE_METRIC) as ProfileMetricKey[]).map((k) => [
      latin(L.metricN(k)),
      ...metrics.series[k].map((v) => (v === null ? '-' : `${Math.round(v)}${latin(L.unitOf(k))}`)),
    ]),
    headStyles: { fillColor: [45, 52, 70] },
    styles: { fontSize: 8 },
  });
  doc.save(`profil-${latin(name).replace(/\s+/g, '-')}.pdf`);
}
