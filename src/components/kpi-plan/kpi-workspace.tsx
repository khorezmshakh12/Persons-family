'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Clock, Plus, RotateCcw, Send, Sparkles, Target, Trash2, Undo2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale, useTranslations } from 'next-intl';
import { monthYear } from '@/lib/month-names';
import {
  KPI_TEMPLATES,
  SCENARIOS,
  deadlineOf,
  emptyItem,
  isLate,
  pctFor,
  type KpiItem,
  type KpiItemKind,
  type KpiPlan,
  type Scenario,
} from '@/lib/kpi-plan';
import {
  deleteKpiPlanAction,
  gradeKpiPlanAction,
  reviewKpiPlanAction,
  saveKpiPlanAction,
  selfAssessKpiAction,
} from '@/lib/actions/kpi-plan';
import type { Role } from '@/lib/permissions';
import type { TeamMember } from '@/lib/kpi-plan-data';
import { forecast } from '@/lib/kpi-forecast';
import { celebrate } from '@/components/motion/events';
import { ForecastGauge, GradeCalibration, GradeHistory, KpiHeatmap, KpiStepper, planStep } from './kpi-visuals';

/* ------------------------------------------------------------ bits */

const SC_STYLE: Record<Scenario, { ring: string; chip: string; dot: string }> = {
  bad: { ring: 'border-t-au-bad', chip: 'bg-au-bad/10 text-au-bad', dot: 'bg-au-bad' },
  good: { ring: 'border-t-au-accent', chip: 'bg-au-accent-soft text-au-accent-text', dot: 'bg-au-accent' },
  great: { ring: 'border-t-au-ok', chip: 'bg-au-ok/12 text-au-ok', dot: 'bg-au-ok' },
};
const STATUS_CHIP: Record<string, string> = {
  draft: 'bg-au-card-2 text-au-muted',
  submitted: 'bg-au-accent-soft text-au-accent-text',
  returned: 'bg-au-bad/10 text-au-bad',
  approved: 'bg-au-ok/12 text-au-ok',
  missing: 'bg-au-bad/10 text-au-bad',
};
const CARD = 'rounded-au-card border border-au-line bg-au-card shadow-au-card';
const INP =
  'w-full rounded-au-ctl border border-au-line bg-au-card px-3 py-2 text-sm text-au-ink outline-none transition focus:border-au-accent focus:ring-2 focus:ring-au-accent/20 disabled:bg-au-card-2 disabled:text-au-muted';
const BTN = 'inline-flex items-center justify-center gap-1.5 rounded-au-ctl px-3.5 py-2 text-sm font-semibold transition active:scale-[.97] disabled:opacity-50';
const BTN_PRIMARY = cn(BTN, 'bg-au-primary text-au-primary-ink hover:opacity-90');
const BTN_GHOST = cn(BTN, 'border border-au-line bg-au-card text-au-ink hover:bg-au-card-2');

const ERR: Record<string, string> = {
  incomplete: 'eIncomplete',
  locked: 'eLocked',
  noteRequired: 'eNote',
  notYet: 'eNotYet',
  forbidden: 'eForbidden',
  invalidInput: 'eInvalid',
};
const KINDS: KpiItemKind[] = ['number', 'money', 'percent', 'projects', 'text'];
const rec = <T extends string>(keys: readonly T[], f: (k: T) => string) => Object.fromEntries(keys.map((k) => [k, f(k)])) as Record<T, string>;

/** Labels for the KPI screens in the viewer's language. */
function useKpi() {
  const t = useTranslations('kpw');
  const locale = useLocale();
  return {
    t,
    locale,
    sc: rec(SCENARIOS, (s) => t(`sc.${s}`)),
    hint: rec(SCENARIOS, (s) => t(`hint.${s}`)),
    kind: rec(KINDS, (k) => t(`kind.${k}`)),
    st: rec(['draft', 'submitted', 'returned', 'approved', 'missing'] as const, (k) => t(`st.${k}`)) as Record<string, string>,
    mN: (month: string) => monthYear(locale, month),
    errText: (c: string) => t(ERR[c] ?? 'eOther'),
    som: (n: number | null | undefined) => (n == null ? '—' : t('som', { n: `${n < 0 ? '−' : n > 0 ? '+' : ''}${formatUZS(Math.abs(Math.round(n)))}` })),
  };
}

/** The CEO's defaults (kpi_plans column defaults) until a plan has its own. */
const DEFAULT_PCT = { pct_bad: -10, pct_good: 0, pct_great: 15 };

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap', className)}>{children}</span>;
}

function Countdown({ month }: { month: string }) {
  const K = useKpi();
  const due = deadlineOf(month);
  const [now] = useState(() => Date.now());
  const days = Math.ceil((due.getTime() - now) / 86_400_000);
  const d = due.toLocaleDateString(K.locale === 'uz' ? 'uz-UZ' : K.locale, { day: 'numeric', month: 'long', timeZone: 'Asia/Tashkent' });
  return (
    <Chip className={days <= 3 ? 'bg-au-bad/10 text-au-bad' : 'bg-au-card-2 text-au-muted'}>
      <Clock className="size-3" />
      {K.t('deadline', { d, left: days > 0 ? K.t('daysLeft', { n: days }) : days === 0 ? K.t('today') : K.t('passed') })}
    </Chip>
  );
}

/* ------------------------------------------------------------ plan (read-only) */

function PlanView({ plan, showActual = false }: { plan: KpiPlan; showActual?: boolean }) {
  const K = useKpi();
  // The % is of what was given for the month so far (no fixed salary, 2026-11-18).
  const salary = plan.paid;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        {SCENARIOS.map((s) => (
          <div key={s} className={cn(CARD, 'ms-rise border-t-4 p-4', SC_STYLE[s].ring, plan.grade === s && 'ms-glow ring-2 ring-au-accent')} style={{ ['--i' as string]: SCENARIOS.indexOf(s) }}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-au-ink">{K.sc[s]}</span>
              <Chip className={SC_STYLE[s].chip}>
                {pctFor(plan, s) > 0 ? '+' : ''}
                {pctFor(plan, s)}%
              </Chip>
            </div>
            {!!salary && (
              <div className={cn('mb-2 text-lg font-bold tabular-nums', pctFor(plan, s) < 0 ? 'text-au-bad' : pctFor(plan, s) > 0 ? 'text-au-ok' : 'text-au-ink')}>
                {pctFor(plan, s) === 0 ? K.t('noChange') : K.som((salary * pctFor(plan, s)) / 100)}
                <span className="block text-[11px] font-normal text-au-faint">{K.t('ofGiven', { n: K.som(salary).replace('+', '') })}</span>
              </div>
            )}
            <p className="text-[13px] whitespace-pre-wrap text-au-muted">{plan.scenarios[s]?.summary || '—'}</p>
          </div>
        ))}
      </div>
      <div className={cn(CARD, 'overflow-x-auto')}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-au-line text-left text-[11px] font-semibold tracking-wide text-au-faint uppercase">
              <th className="px-4 py-2.5">{K.t('metric')}</th>
              {SCENARIOS.map((s) => (
                <th key={s} className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <i className={cn('size-2 rounded-full', SC_STYLE[s].dot)} />
                    {K.sc[s]}
                  </span>
                </th>
              ))}
              {showActual && <th className="px-3 py-2.5">{K.t('actual')}</th>}
            </tr>
          </thead>
          <tbody>
            {plan.items.map((it) => (
              <tr key={it.id ?? it.title} className="border-b border-au-line/60 align-top last:border-0">
                <td className="px-4 py-3">
                  <div className="font-semibold text-au-ink">{it.title}</div>
                  <div className="text-[11px] text-au-faint">
                    {K.kind[it.kind]}
                    {it.unit ? ` · ${it.unit}` : ''}
                  </div>
                </td>
                {SCENARIOS.map((s) => (
                  <td key={s} className="px-3 py-3 whitespace-pre-wrap text-au-ink">
                    {it[`target_${s}`] || '—'}
                  </td>
                ))}
                {showActual && <td className="px-3 py-3 font-semibold whitespace-pre-wrap text-au-ink">{it.actual || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ editor */

function PlanEditor({ month, plan, role }: { month: string; plan: KpiPlan | undefined; role: Role }) {
  const K = useKpi();
  const pcts = plan ?? DEFAULT_PCT;
  const router = useRouter();
  const [busy, start] = useTransition();
  const [scen, setScen] = useState<Record<Scenario, string>>({
    bad: plan?.scenarios.bad?.summary ?? '',
    good: plan?.scenarios.good?.summary ?? '',
    great: plan?.scenarios.great?.summary ?? '',
  });
  const [items, setItems] = useState<KpiItem[]>(() =>
    plan?.items.length ? plan.items : KPI_TEMPLATES[role].map((t) => emptyItem(t)),
  );
  // One submission per month (owner, 2026-11-16): once sent, the plan is
  // read-only until the CEO returns it.
  const locked = plan?.status === 'approved' || plan?.status === 'submitted';
  const setItem = (i: number, p: Partial<KpiItem>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const save = (submit: boolean) =>
    start(async () => {
      const clean = items.filter((it) => it.title.trim());
      if (!clean.length) return void toast.error(K.t('needOne'));
      const res = await saveKpiPlanAction({
        month,
        submit,
        scenarios: { bad: { summary: scen.bad }, good: { summary: scen.good }, great: { summary: scen.great } },
        items: clean.map(({ title, kind, unit, target_bad, target_good, target_great }) => ({ title, kind, unit, target_bad, target_good, target_great })),
      });
      if (res.error !== undefined) return void toast.error(K.errText(res.error));
      toast.success(submit ? K.t('submitted') : K.t('draftSaved'));
      router.refresh();
    });

  if (locked && plan)
    return (
      <div className="grid gap-4">
        {plan.status === 'approved' ? (
          <Banner tone="ok" icon={<Check className="size-4" />}>
            {K.t('approvedBanner', { m: K.mN(month) })}
          </Banner>
        ) : (
          <Banner tone="accent" icon={<Clock className="size-4" />}>
            {K.t('pendingBanner', { m: K.mN(month) })}
          </Banner>
        )}
        <PlanView plan={plan} />
      </div>
    );

  return (
    <div className="grid gap-4">
      {plan?.status === 'returned' && plan.review_note && (
        <Banner tone="bad" icon={<Undo2 className="size-4" />}>
          <b>{K.t('ceoReturned')}</b> {plan.review_note}
        </Banner>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {SCENARIOS.map((s) => (
          <label key={s} className={cn(CARD, 'ms-rise grid gap-2 border-t-4 p-4 transition-shadow focus-within:shadow-au-card-hover focus-within:ring-2 focus-within:ring-au-accent/30', SC_STYLE[s].ring)} style={{ ['--i' as string]: SCENARIOS.indexOf(s) }}>
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-au-ink">{K.sc[s]}</span>
              <Chip className={SC_STYLE[s].chip}>
                {pctFor(pcts, s) > 0 ? '+' : ''}
                {pctFor(pcts, s)}%
              </Chip>
            </span>
            <span className="text-[11px] text-au-faint">{K.hint[s]}</span>
            <textarea
              className={cn(INP, 'min-h-[120px] resize-y')}
              maxLength={4000}
              placeholder={K.t('scenPh', { s: K.sc[s] })}
              value={scen[s]}
              onChange={(e) => setScen({ ...scen, [s]: e.target.value })}
            />
          </label>
        ))}
      </div>

      <div className={cn(CARD, 'grid gap-0 overflow-hidden')}>
        <div className="flex flex-wrap items-center gap-2 border-b border-au-line px-4 py-3">
          <Target className="size-4 text-au-accent-text" />
          <h3 className="flex-1 text-sm font-bold text-au-ink">{K.t('metricsTargets')}</h3>
          <button
            className={cn(BTN_GHOST, 'py-1.5 text-xs')}
            onClick={() => setItems(KPI_TEMPLATES[role].map((t) => emptyItem(t)))}
            title={K.t('templateTitle')}
          >
            <RotateCcw className="size-3.5" /> {K.t('template')}
          </button>
        </div>
        <div className="grid divide-y divide-au-line">
          {items.map((it, i) => (
            <div key={i} className="grid gap-2 p-4 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))_auto] lg:items-start">
              <div className="grid gap-1.5">
                <input className={cn(INP, 'font-semibold')} maxLength={200} placeholder={K.t('metricName')} value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} />
                <div className="flex gap-1.5">
                  <select className={cn(INP, 'py-1.5 text-xs')} value={it.kind} onChange={(e) => setItem(i, { kind: e.target.value as KpiItemKind })} aria-label={K.t('kindAria')}>
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {K.kind[k]}
                      </option>
                    ))}
                  </select>
                  <input className={cn(INP, 'w-28 py-1.5 text-xs')} maxLength={20} placeholder={K.t('unit')} value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} />
                </div>
              </div>
              {SCENARIOS.map((s) => {
                const key = `target_${s}` as const;
                const multi = it.kind === 'projects' || it.kind === 'text';
                return (
                  <label key={s} className="grid gap-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-au-faint lg:hidden">
                      <i className={cn('size-2 rounded-full', SC_STYLE[s].dot)} />
                      {K.sc[s]}
                    </span>
                    {multi ? (
                      <textarea
                        className={cn(INP, 'min-h-[68px] resize-y')}
                        maxLength={2000}
                        placeholder={it.kind === 'projects' ? K.t('projectsPh') : K.sc[s]}
                        value={it[key]}
                        onChange={(e) => setItem(i, { [key]: e.target.value })}
                      />
                    ) : (
                      <input
                        className={INP}
                        inputMode={it.kind === 'text' ? 'text' : 'decimal'}
                        maxLength={60}
                        placeholder={K.sc[s]}
                        value={it[key]}
                        onChange={(e) => setItem(i, { [key]: e.target.value })}
                      />
                    )}
                  </label>
                );
              })}
              <button
                className="grid size-9 place-items-center justify-self-end rounded-full text-au-faint hover:bg-au-card-2 hover:text-au-bad"
                aria-label={K.t('delMetric')}
                onClick={() => setItems((l) => l.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="hidden grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))_auto] gap-2 border-t border-au-line bg-au-card-2 px-4 py-2 text-[11px] font-semibold text-au-faint lg:grid">
          <span />
          {SCENARIOS.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <i className={cn('size-2 rounded-full', SC_STYLE[s].dot)} />
              {K.sc[s]}
            </span>
          ))}
          <span className="w-9" />
        </div>
        {items.length < 15 && (
          <button className={cn(BTN_GHOST, 'm-3 justify-self-start')} onClick={() => setItems((l) => [...l, emptyItem()])}>
            <Plus className="size-4" /> {K.t('addMetric')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className={BTN_PRIMARY} disabled={busy} onClick={() => save(true)}>
          <Send className="size-4" /> {plan?.status === 'returned' ? K.t('resubmit') : K.t('submit')}
        </button>
        <button className={BTN_GHOST} disabled={busy} onClick={() => save(false)}>
          {K.t('saveDraft')}
        </button>
        {plan && (
          <button
            className={cn(BTN, 'text-au-bad hover:bg-au-bad/10')}
            disabled={busy}
            onClick={() =>
              start(async () => {
                const res = await deleteKpiPlanAction(plan.id);
                if (res.error !== undefined) return void toast.error(K.errText(res.error));
                toast.success(K.t('planDeleted'));
                router.refresh();
              })
            }
          >
            <Trash2 className="size-4" /> {K.t('delete')}
          </button>
        )}
      </div>
    </div>
  );
}

function Banner({ tone, icon, children }: { tone: 'ok' | 'bad' | 'accent'; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = tone === 'ok' ? 'border-au-ok/30 bg-au-ok/8 text-au-ink' : tone === 'bad' ? 'border-au-bad/30 bg-au-bad/8 text-au-ink' : 'border-au-accent/40 bg-au-accent-soft text-au-ink';
  return (
    <div className={cn('flex items-start gap-2.5 rounded-au-ctl border px-4 py-3 text-sm', cls)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------ self assessment */

function SelfAssess({ plan }: { plan: KpiPlan }) {
  const K = useKpi();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [result, setResult] = useState<Scenario | null>(plan.self_result);
  const [note, setNote] = useState(plan.self_note ?? '');
  const [actuals, setActuals] = useState<Record<string, string>>(Object.fromEntries(plan.items.map((i) => [i.id!, i.actual])));
  // Live forecast from the numbers typed so far.
  const live = useMemo(() => forecast(plan.items.map((i) => ({ ...i, actual: actuals[i.id!] ?? '' }))), [plan.items, actuals]);

  if (plan.grade)
    return (
      <Banner tone={plan.grade === 'bad' ? 'bad' : 'ok'} icon={<Check className="size-4" />}>
        <b>{K.t('ceoGrade', { g: K.sc[plan.grade] })}</b> ({(plan.grade_pct ?? 0) > 0 ? '+' : ''}
        {plan.grade_pct}%) · {K.som(plan.grade_amount)}
        {plan.grade_note ? <div className="mt-1 text-au-muted">{plan.grade_note}</div> : null}
      </Banner>
    );

  return (
    <div className={cn(CARD, 'grid gap-4 p-4 lg:grid-cols-[1fr_240px]')}>
      <div className="grid content-start gap-3">
      <h3 className="text-sm font-bold text-au-ink">{K.t('selfTitle')}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {plan.items.map((it) => (
          <label key={it.id} className="grid gap-1 text-[12px] font-semibold text-au-muted">
            {K.t('actualFor', { t: it.title })}
            <input className={INP} maxLength={2000} value={actuals[it.id!] ?? ''} onChange={(e) => setActuals({ ...actuals, [it.id!]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s + (result === s ? '-on' : '')}
            className={cn(BTN, 'border', result === s ? cn('ms-pop-in border-transparent', SC_STYLE[s].chip) : 'border-au-line bg-au-card text-au-muted')}
            onClick={() => setResult(s)}
          >
            {K.sc[s]}
          </button>
        ))}
      </div>
      <textarea className={cn(INP, 'min-h-[80px]')} maxLength={4000} placeholder={K.t('selfNotePh')} value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        className={cn(BTN_PRIMARY, 'justify-self-start')}
        disabled={busy || !result}
        onClick={() =>
          start(async () => {
            const res = await selfAssessKpiAction({ planId: plan.id, result: result!, note, actuals });
            if (res.error !== undefined) return void toast.error(K.errText(res.error));
            toast.success(K.t('selfSaved'));
            router.refresh();
          })
        }
      >
        {K.t('save')}
      </button>
      </div>
      <div className="grid content-start justify-items-center gap-2 rounded-au-ctl bg-au-card-2 p-3">
        <span className="text-[11px] font-semibold tracking-wide text-au-faint uppercase">{K.t('forecast')}</span>
        <ForecastGauge value={live} />
        {live && live.scenario !== result && (
          <button className={cn(BTN_GHOST, 'py-1.5 text-xs')} onClick={() => setResult(live.scenario)}>
            <Sparkles className="size-3.5" /> {K.t('pick', { s: K.sc[live.scenario] })}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ employee */

export function MyKpi({ plans, role, thisMonth, nextMonth }: { plans: KpiPlan[]; role: Role; thisMonth: string; nextMonth: string }) {
  const K = useKpi();
  const next = plans.find((p) => p.month === nextMonth);
  const cur = plans.find((p) => p.month === thisMonth);
  const past = plans.filter((p) => p.month < thisMonth);
  const step = planStep(cur);
  const nextAction = K.t(`next.${step}`);
  return (
    <div className="grid gap-5">
      <section className={cn(CARD, 'grid gap-5 p-5')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.06em] text-au-accent-text uppercase">{K.t('curMonth')}</div>
            <h2 className="font-display text-2xl font-bold text-au-ink">{K.t('monthKpi', { m: K.mN(thisMonth) })}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {cur?.grade && <Chip className={SC_STYLE[cur.grade].chip}>{K.sc[cur.grade]}</Chip>}
            {cur?.grade_amount != null && <b className="text-lg tabular-nums text-au-ink">{K.som(cur.grade_amount)}</b>}
          </div>
        </div>
        <KpiStepper plan={cur} />
        <p className="flex items-center gap-2 text-sm text-au-muted">
          <ChevronRight className="size-4 text-au-accent-text" /> {nextAction}
        </p>
      </section>
    <Tabs defaultValue={cur && cur.status !== 'approved' ? 'current' : 'next'}>
      <div className="flex flex-wrap items-center gap-3">
        <TabsList className="border border-au-line bg-au-card-2">
          <TabsTrigger value="next">{K.t('nextTab', { m: K.mN(nextMonth) })}</TabsTrigger>
          <TabsTrigger value="current">{K.t('curMonth')}</TabsTrigger>
          <TabsTrigger value="history">{K.t('history')}</TabsTrigger>
        </TabsList>
        <Countdown month={nextMonth} />
        {next && <Chip className={STATUS_CHIP[next.status]}>{K.st[next.status]}</Chip>}
      </div>
      <TabsContent value="next" className="mt-4 outline-none">
        <PlanEditor key={next?.id ?? 'new'} month={nextMonth} plan={next} role={role} />
      </TabsContent>
      <TabsContent value="current" className="mt-4 grid gap-4 outline-none">
        {!cur ? (
          <div className="grid gap-3">
            <Banner tone="bad" icon={<AlertTriangle className="size-4" />}>
              {K.t('noPlan', { m: K.mN(thisMonth) })}
            </Banner>
            <PlanEditor month={thisMonth} plan={undefined} role={role} />
          </div>
        ) : cur.status === 'approved' ? (
          <>
            <PlanView plan={cur} showActual />
            <SelfAssess plan={cur} />
          </>
        ) : (
          <PlanEditor month={thisMonth} plan={cur} role={role} />
        )}
      </TabsContent>
      <TabsContent value="history" className="mt-4 grid gap-3 outline-none">
        {past.length === 0 && <p className="text-sm text-au-muted">{K.t('noHistory')}</p>}
        <GradeHistory plans={plans} />
        {past.map((p) => (
          <details key={p.id} className={cn(CARD, 'group p-4')}>
            <summary className="flex cursor-pointer list-none items-center gap-3">
              <span className="flex-1 text-sm font-bold text-au-ink">{K.mN(p.month)}</span>
              {p.grade ? <Chip className={SC_STYLE[p.grade].chip}>{K.sc[p.grade]}</Chip> : <Chip className={STATUS_CHIP[p.status]}>{K.st[p.status]}</Chip>}
              {p.grade_amount != null && <b className="text-sm tabular-nums text-au-ink">{K.som(p.grade_amount)}</b>}
              <ChevronDown className="size-4 text-au-faint transition group-open:rotate-180" />
            </summary>
            <div className="mt-4">
              <PlanView plan={p} showActual />
            </div>
          </details>
        ))}
      </TabsContent>
    </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------ CEO */

/** Who decided what, when — percentages, grades and manual overrides. */
function AuditTrail({ plan }: { plan: KpiPlan }) {
  const K = useKpi();
  if (!plan.audit?.length) return null;
  return (
    <details className="group rounded-au-ctl border border-au-line px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-au-muted">
        <Clock className="size-3.5" /> {K.t('changes', { n: plan.audit.length })}
        <ChevronDown className="ml-auto size-3.5 transition group-open:rotate-180" />
      </summary>
      <ol className="mt-2 grid gap-1.5 border-l-2 border-au-line pl-3">
        {plan.audit.map((a, i) => (
          <li key={i} className="text-xs text-au-muted">
            <b className="text-au-ink">{new Date(a.at).toLocaleString(K.locale === 'uz' ? 'uz-UZ' : K.locale, { timeZone: 'Asia/Tashkent', day: 'numeric', month: 'short', hour: '2-digit', hourCycle: 'h23', minute: '2-digit' })}</b>
            {' · '}
            {a.actor ?? '—'}:{' '}
            {a.action === 'review'
              ? `${a.detail.decision === 'approve' ? K.t('approvedA') : K.t('returnedA')}${a.detail.pct ? ` (${a.detail.pct.map((x) => `${x}%`).join(' / ')})` : ''}`
              : `${K.t('gradedA', { g: a.detail.grade ? K.sc[a.detail.grade] : '', sum: K.som(a.detail.amount) })}${a.detail.override != null ? K.t('manual') : ''}`}
            {a.detail.note ? ` — “${a.detail.note}”` : ''}
          </li>
        ))}
      </ol>
    </details>
  );
}

function ReviewCard({ plan, member, onDone }: { plan: KpiPlan; member: TeamMember; onDone?: () => void }) {
  const K = useKpi();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(true);
  const [pcts, setPcts] = useState({ bad: String(plan.pct_bad), good: String(plan.pct_good), great: String(plan.pct_great) });
  const [note, setNote] = useState('');
  const late = isLate(plan);
  const decide = (decision: 'approve' | 'return') =>
    start(async () => {
      const res = await reviewKpiPlanAction({
        planId: plan.id,
        decision,
        note,
        pctBad: Number(pcts.bad) || 0,
        pctGood: Number(pcts.good) || 0,
        pctGreat: Number(pcts.great) || 0,
      });
      if (res.error !== undefined) return void toast.error(K.errText(res.error));
      toast.success(decision === 'approve' ? K.t('approvedT') : K.t('returnedT'));
      if (decision === 'approve') celebrate();
      onDone?.();
      router.refresh();
    });
  return (
    <div className={cn(CARD, 'overflow-hidden')}>
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-au-ink">
            {member.first_name} {member.last_name}
          </span>
          <span className="text-[11px] text-au-faint">
            {K.t('nMetrics', { n: plan.items.length })}
          </span>
        </span>
        {late && <Chip className="bg-au-bad/10 text-au-bad">{K.t('late')}</Chip>}
        <Chip className={STATUS_CHIP[plan.status]}>{K.st[plan.status]}</Chip>
        <ChevronDown className={cn('size-4 text-au-faint transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-au-line p-4">
          <PlanView plan={plan} />
          <AuditTrail plan={plan} />
          {plan.status !== 'approved' || !plan.grade ? (
            <div className="grid gap-3 rounded-au-ctl bg-au-card-2 p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                {SCENARIOS.map((s) => (
                  <label key={s} className="grid gap-1 text-[11px] font-semibold text-au-muted">
                    {K.t('pctFor', { s: K.sc[s] })}
                    <input className={INP} inputMode="decimal" value={pcts[s]} onChange={(e) => setPcts({ ...pcts, [s]: e.target.value })} />
                  </label>
                ))}
              </div>
              <textarea className={cn(INP, 'min-h-[64px]')} maxLength={2000} placeholder={K.t('notePh')} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <button className={BTN_PRIMARY} disabled={busy} onClick={() => decide('approve')}>
                  <Check className="size-4" /> {plan.status === 'approved' ? K.t('savePct') : K.t('approve')}
                </button>
                <button className={BTN_GHOST} disabled={busy} onClick={() => decide('return')}>
                  <Undo2 className="size-4" /> {K.t('return')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function GradeCard({ plan, member, onDone }: { plan: KpiPlan; member: TeamMember; onDone?: () => void }) {
  const K = useKpi();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(true);
  const live = useMemo(() => forecast(plan.items), [plan.items]);
  const [grade, setGrade] = useState<Scenario | null>(plan.grade ?? plan.self_result);
  const [override, setOverride] = useState('');
  const [note, setNote] = useState(plan.grade_note ?? '');
  // KPI = what was given for the month at grading time × % (owner,
  // 2026-11-18); the amount is stored at grading and does not move after.
  const base = plan.paid;
  const computed = grade ? Math.round((base * pctFor(plan, grade)) / 100) : 0;
  const amount = override.trim() ? Number(override.replace(/\s/g, '')) : computed;
  return (
    <div className={cn(CARD, 'overflow-hidden')}>
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-au-ink">
            {member.first_name} {member.last_name}
          </span>
          <span className="text-[11px] text-au-faint">
            {K.mN(plan.month)}
            {plan.self_result ? K.t('self', { s: K.sc[plan.self_result] }) : K.t('noSelf')}
          </span>
        </span>
        {plan.grade ? (
          <>
            <Chip className={SC_STYLE[plan.grade].chip}>{K.sc[plan.grade]}</Chip>
            <b className="text-sm tabular-nums text-au-ink">{K.som(plan.grade_amount)}</b>
          </>
        ) : (
          <Chip className="bg-au-accent-soft text-au-accent-text">{K.t('notGraded')}</Chip>
        )}
        <ChevronDown className={cn('size-4 text-au-faint transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-au-line p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <PlanView plan={plan} showActual />
            <div className="grid content-start justify-items-center gap-1 rounded-au-ctl bg-au-card-2 p-3">
              <span className="text-[11px] font-semibold tracking-wide text-au-faint uppercase">{K.t('byResults')}</span>
              <ForecastGauge value={live} />
            </div>
          </div>
          <AuditTrail plan={plan} />
          {plan.self_note && (
            <p className="rounded-au-ctl bg-au-card-2 p-3 text-[13px] whitespace-pre-wrap text-au-muted">
              <b className="text-au-ink">{K.t('staffNote')}</b> {plan.self_note}
            </p>
          )}
          <div className="grid gap-3 rounded-au-ctl bg-au-card-2 p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {SCENARIOS.map((s) => (
                <button
                  key={s + (grade === s ? '-on' : '')}
                  className={cn(CARD, 'grid gap-0.5 border-t-4 p-3 text-left transition', SC_STYLE[s].ring, grade === s ? 'ms-pop-in scale-[1.02] shadow-au-card-hover ring-2 ring-au-accent' : 'opacity-60 hover:opacity-100')}
                  onClick={() => {
                    setGrade(s);
                    setOverride('');
                  }}
                >
                  <span className="text-sm font-bold text-au-ink">{K.sc[s]}</span>
                  <span className="text-xs text-au-muted">
                    {pctFor(plan, s) > 0 ? '+' : ''}
                    {pctFor(plan, s)}% · {K.som(Math.round((base * pctFor(plan, s)) / 100))}
                  </span>
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
              <label className="grid gap-1 text-[11px] font-semibold text-au-muted">
                {K.t('override')}
                <input className={INP} inputMode="numeric" placeholder={String(computed)} value={override} onChange={(e) => setOverride(e.target.value)} />
              </label>
              <label className="grid gap-1 text-[11px] font-semibold text-au-muted">
                {K.t('noteToStaff')}
                <input className={INP} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            <p className="text-xs text-au-muted">
              {K.t.rich('baseHint', { m: K.mN(plan.month), n: K.som(base).replace('+', ''), b: (c) => <b className="tabular-nums text-au-ink">{c}</b> })}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className={BTN_PRIMARY}
                disabled={busy || !grade || !Number.isFinite(amount)}
                onClick={() =>
                  start(async () => {
                    const res = await gradeKpiPlanAction({ planId: plan.id, grade: grade!, amount: override.trim() ? amount : null, note });
                    if (res.error !== undefined) return void toast.error(K.errText(res.error));
                    toast.success(K.t('gradedT', { n: K.som(res.amount) }));
                    if (grade === 'great') celebrate(K.t('great'));
                    onDone?.();
                    router.refresh();
                  })
                }
              >
                <Check className="size-4" /> {plan.grade ? K.t('regrade') : K.t('grade')}
              </button>
              <span className="text-sm text-au-muted">
                {K.t('effect')} <b className={amount < 0 ? 'text-au-bad' : amount > 0 ? 'text-au-ok' : 'text-au-ink'}>{K.som(amount)}</b>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** One row in a two-pane queue (left list). */
function QueueRow({
  member,
  meta,
  chip,
  active,
  onClick,
  index,
}: {
  member: TeamMember;
  meta: string;
  chip: React.ReactNode;
  active: boolean;
  onClick: () => void;
  index: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'ms-rise flex w-full items-center gap-3 rounded-au-ctl px-3 py-2.5 text-left transition-colors',
        active ? 'bg-au-accent-soft ring-1 ring-au-accent/40' : 'hover:bg-au-card-2',
      )}
      style={{ ['--i' as string]: Math.min(index, 8) }}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-au-card-2 text-xs font-bold text-au-muted uppercase">
        {member.first_name[0]}
        {member.last_name[0]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-au-ink">
          {member.first_name} {member.last_name}
        </span>
        <span className="block truncate text-[11px] text-au-faint">{meta}</span>
      </span>
      {chip}
    </button>
  );
}

/** List on the left, the selected item on the right; after a decision the
 * next pending one slides in. On phones the list sits above the detail. */
function TwoPane({ list, detail, progress }: { list: React.ReactNode; detail: React.ReactNode; progress?: { done: number; total: number } }) {
  const K = useKpi();
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
      <div className={cn(CARD, 'grid gap-1 p-2 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto')}>
        {progress && progress.total > 0 && (
          <div className="px-2 pt-1 pb-2">
            <div className="mb-1 flex justify-between text-[11px] font-semibold text-au-muted">
              <span>{K.t('done')}</span>
              <span className="tabular-nums">
                {progress.done}/{progress.total}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-au-card-2">
              <div className="h-full rounded-full bg-au-ok transition-[width] duration-500 ease-out" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          </div>
        )}
        {list}
      </div>
      <div className="min-w-0">{detail}</div>
    </div>
  );
}

export function TeamKpi({
  team,
  plans,
  thisMonth,
  nextMonth,
  prevMonth,
  heatMonths,
}: {
  team: TeamMember[];
  plans: KpiPlan[];
  thisMonth: string;
  nextMonth: string;
  prevMonth: string;
  /** Oldest → newest, for the team heat map. */
  heatMonths: string[];
}) {
  const K = useKpi();
  const byUser = useMemo(() => new Map(team.map((m) => [m.id, m])), [team]);
  const planOf = (uid: string, month: string) => plans.find((p) => p.user_id === uid && p.month === month);
  const order = { submitted: 0, returned: 1, approved: 2, draft: 3 } as const;
  // Staff may also file the current month's plan (My KPI › Joriy oy) — those
  // must reach this queue too, or the CEO never sees them.
  const nextPlans = plans
    .filter((p) => (p.month === nextMonth || (p.month === thisMonth && p.status !== 'approved')) && p.status !== 'draft' && byUser.has(p.user_id))
    .sort((a, b) => order[a.status] - order[b.status] || a.month.localeCompare(b.month));
  const missingNext = team.filter((m) => {
    const p = planOf(m.id, nextMonth);
    return !p || p.status === 'draft';
  });
  const toGrade = plans
    .filter((p) => (p.month === thisMonth || p.month === prevMonth) && p.status === 'approved' && byUser.has(p.user_id))
    .sort((a, b) => Number(!!a.grade) - Number(!!b.grade) || b.month.localeCompare(a.month));
  const pendingReview = nextPlans.filter((p) => p.status === 'submitted').length;
  const pendingGrade = toGrade.filter((p) => !p.grade).length;

  // Selection per queue; after a decision jump to the next still-pending item.
  const [reviewSel, setReviewSel] = useState<string | null>(() => nextPlans.find((p) => p.status === 'submitted')?.id ?? nextPlans[0]?.id ?? null);
  const [gradeSel, setGradeSel] = useState<string | null>(() => toGrade.find((p) => !p.grade)?.id ?? toGrade[0]?.id ?? null);
  const nextAfter = (list: KpiPlan[], current: string | null, pending: (p: KpiPlan) => boolean) => {
    const i = list.findIndex((p) => p.id === current);
    const rest = [...list.slice(i + 1), ...list.slice(0, Math.max(0, i))];
    return rest.find(pending)?.id ?? current;
  };
  const reviewPlan = nextPlans.find((p) => p.id === reviewSel) ?? nextPlans[0];
  const gradePlan = toGrade.find((p) => p.id === gradeSel) ?? toGrade[0];
  const gradedThisMonth = plans.filter((p) => p.month === thisMonth || p.month === prevMonth);

  return (
    <Tabs defaultValue={pendingReview ? 'review' : pendingGrade ? 'grade' : 'team'}>
      <div className="flex flex-wrap items-center gap-3">
        <TabsList className="border border-au-line bg-au-card-2">
          <TabsTrigger value="review">{K.t('tabReview')}{pendingReview ? ` · ${pendingReview}` : ''}</TabsTrigger>
          <TabsTrigger value="grade">{K.t('tabGrade')}{pendingGrade ? ` · ${pendingGrade}` : ''}</TabsTrigger>
          <TabsTrigger value="team">{K.t('tabTeam')}</TabsTrigger>
        </TabsList>
        <Countdown month={nextMonth} />
      </div>

      <TabsContent value="review" className="mt-4 grid gap-4 outline-none">
        <div className="flex flex-wrap items-center gap-2 text-sm text-au-muted">
          {K.t.rich('plansOf', { m: K.mN(nextMonth), done: team.length - missingNext.length, total: team.length, b: (c) => <b className="text-au-ink">{c}</b> })}
        </div>
        {missingNext.length > 0 && (
          <div className={cn(CARD, 'grid gap-2 p-4')}>
            <span className="text-sm font-semibold text-au-ink">{K.t('notSubmitted', { n: missingNext.length })}</span>
            <div className="flex flex-wrap gap-1.5">
              {missingNext.map((m) => (
                <Chip key={m.id} className="bg-au-card-2 text-au-muted">
                  {m.first_name} {m.last_name}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {nextPlans.length === 0 ? (
          <p className="text-sm text-au-muted">{K.t('noSubmitted')}</p>
        ) : (
          <TwoPane
            progress={{ done: nextPlans.length - pendingReview, total: nextPlans.length }}
            list={nextPlans.map((p, i) => {
              const m = byUser.get(p.user_id)!;
              return (
                <QueueRow
                  key={p.id}
                  index={i}
                  member={m}
                  meta={`${K.mN(p.month)} · ${K.t('nMetrics', { n: p.items.length })}${isLate(p) ? K.t('lateMeta') : ''}`}
                  chip={<Chip className={STATUS_CHIP[p.status]}>{K.st[p.status]}</Chip>}
                  active={p.id === reviewPlan?.id}
                  onClick={() => setReviewSel(p.id)}
                />
              );
            })}
            detail={
              reviewPlan && (
                <div key={reviewPlan.id} className="ms-enter-right">
                  <ReviewCard
                    plan={reviewPlan}
                    member={byUser.get(reviewPlan.user_id)!}
                    onDone={() => setReviewSel(nextAfter(nextPlans, reviewPlan.id, (p) => p.status === 'submitted' && p.id !== reviewPlan.id))}
                  />
                </div>
              )
            }
          />
        )}
      </TabsContent>

      <TabsContent value="grade" className="mt-4 grid gap-4 outline-none">
        <GradeCalibration plans={gradedThisMonth} />
        {toGrade.length === 0 ? (
          <p className="text-sm text-au-muted">{K.t('noToGrade')}</p>
        ) : (
          <TwoPane
            progress={{ done: toGrade.length - pendingGrade, total: toGrade.length }}
            list={toGrade.map((p, i) => {
              const m = byUser.get(p.user_id)!;
              return (
                <QueueRow
                  key={p.id}
                  index={i}
                  member={m}
                  meta={`${K.mN(p.month)}${p.self_result ? K.t('self', { s: K.sc[p.self_result] }) : ''}`}
                  chip={p.grade ? <Chip className={SC_STYLE[p.grade].chip}>{K.sc[p.grade]}</Chip> : <Chip className="bg-au-accent-soft text-au-accent-text">{K.t('waiting')}</Chip>}
                  active={p.id === gradePlan?.id}
                  onClick={() => setGradeSel(p.id)}
                />
              );
            })}
            detail={
              gradePlan && (
                <div key={gradePlan.id} className="ms-enter-right">
                  <GradeCard
                    plan={gradePlan}
                    member={byUser.get(gradePlan.user_id)!}
                    onDone={() => setGradeSel(nextAfter(toGrade, gradePlan.id, (p) => !p.grade && p.id !== gradePlan.id))}
                  />
                </div>
              )
            }
          />
        )}
      </TabsContent>

      <TabsContent value="team" className="mt-4 outline-none">
        <KpiHeatmap team={team} plans={plans} months={heatMonths} />
      </TabsContent>
    </Tabs>
  );
}
