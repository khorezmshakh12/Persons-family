'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, ChevronDown, Clock, Plus, RotateCcw, Send, Target, Trash2, Undo2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  KIND_LABEL,
  KPI_TEMPLATES,
  SCENARIOS,
  SCENARIO_HINT,
  SCENARIO_LABEL,
  STATUS_LABEL,
  deadlineOf,
  emptyItem,
  isLate,
  monthName,
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
  incomplete: 'Har bir ssenariy tavsifi va har bir ko‘rsatkichning 3 ta maqsadi to‘ldirilishi kerak',
  locked: 'Reja tasdiqlangan — o‘zgartirish uchun CEO qaytarishi kerak',
  noteRequired: 'Qaytarish uchun izoh yozing',
  notYet: 'Bu oy hali boshlanmagan',
  forbidden: "Ruxsat yo'q",
  invalidInput: "Ma'lumot noto'g'ri",
};
const errText = (c: string) => ERR[c] ?? "Saqlab bo'lmadi, qayta urinib ko'ring";

const som = (n: number | null | undefined) =>
  n == null ? '—' : `${n < 0 ? '−' : n > 0 ? '+' : ''}${formatUZS(Math.abs(Math.round(n)))} so‘m`;

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap', className)}>{children}</span>;
}

function Countdown({ month }: { month: string }) {
  const due = deadlineOf(month);
  const [now] = useState(() => Date.now());
  const days = Math.ceil((due.getTime() - now) / 86_400_000);
  const d = due.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', timeZone: 'Asia/Tashkent' });
  return (
    <Chip className={days <= 3 ? 'bg-au-bad/10 text-au-bad' : 'bg-au-card-2 text-au-muted'}>
      <Clock className="size-3" />
      Muddat: {d}, 23:59 · {days > 0 ? `${days} kun qoldi` : days === 0 ? 'bugun' : 'o‘tib ketdi'}
    </Chip>
  );
}

/* ------------------------------------------------------------ plan (read-only) */

function PlanView({ plan, showActual = false }: { plan: KpiPlan; showActual?: boolean }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        {SCENARIOS.map((s) => (
          <div key={s} className={cn(CARD, 'border-t-4 p-4', SC_STYLE[s].ring, plan.grade === s && 'ring-2 ring-au-accent')}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-au-ink">{SCENARIO_LABEL[s]}</span>
              <Chip className={SC_STYLE[s].chip}>
                {pctFor(plan, s) > 0 ? '+' : ''}
                {pctFor(plan, s)}%
              </Chip>
            </div>
            <p className="text-[13px] whitespace-pre-wrap text-au-muted">{plan.scenarios[s]?.summary || '—'}</p>
          </div>
        ))}
      </div>
      <div className={cn(CARD, 'overflow-x-auto')}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-au-line text-left text-[11px] font-semibold tracking-wide text-au-faint uppercase">
              <th className="px-4 py-2.5">Ko‘rsatkich</th>
              {SCENARIOS.map((s) => (
                <th key={s} className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <i className={cn('size-2 rounded-full', SC_STYLE[s].dot)} />
                    {SCENARIO_LABEL[s]}
                  </span>
                </th>
              ))}
              {showActual && <th className="px-3 py-2.5">Haqiqiy</th>}
            </tr>
          </thead>
          <tbody>
            {plan.items.map((it) => (
              <tr key={it.id ?? it.title} className="border-b border-au-line/60 align-top last:border-0">
                <td className="px-4 py-3">
                  <div className="font-semibold text-au-ink">{it.title}</div>
                  <div className="text-[11px] text-au-faint">
                    {KIND_LABEL[it.kind]}
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
  const locked = plan?.status === 'approved';
  const setItem = (i: number, p: Partial<KpiItem>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const save = (submit: boolean) =>
    start(async () => {
      const clean = items.filter((it) => it.title.trim());
      if (!clean.length) return void toast.error('Kamida bitta ko‘rsatkich kiriting');
      const res = await saveKpiPlanAction({
        month,
        submit,
        scenarios: { bad: { summary: scen.bad }, good: { summary: scen.good }, great: { summary: scen.great } },
        items: clean.map(({ title, kind, unit, target_bad, target_good, target_great }) => ({ title, kind, unit, target_bad, target_good, target_great })),
      });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      toast.success(submit ? 'KPI rejasi CEO’ga topshirildi' : 'Qoralama saqlandi');
      router.refresh();
    });

  if (locked && plan)
    return (
      <div className="grid gap-4">
        <Banner tone="ok" icon={<Check className="size-4" />}>
          {monthName(month)} rejangiz tasdiqlangan. O‘zgartirish kerak bo‘lsa, CEO bilan gaplashing.
        </Banner>
        <PlanView plan={plan} />
      </div>
    );

  return (
    <div className="grid gap-4">
      {plan?.status === 'returned' && plan.review_note && (
        <Banner tone="bad" icon={<Undo2 className="size-4" />}>
          <b>CEO qaytardi:</b> {plan.review_note}
        </Banner>
      )}
      {plan?.status === 'submitted' && (
        <Banner tone="accent" icon={<Clock className="size-4" />}>
          Reja CEO tasdig‘ini kutmoqda. Kerak bo‘lsa tahrirlab, qayta topshirishingiz mumkin.
        </Banner>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {SCENARIOS.map((s) => (
          <label key={s} className={cn(CARD, 'grid gap-2 border-t-4 p-4', SC_STYLE[s].ring)}>
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-au-ink">{SCENARIO_LABEL[s]}</span>
              <span className="text-[11px] text-au-faint">{SCENARIO_HINT[s]}</span>
            </span>
            <textarea
              className={cn(INP, 'min-h-[120px] resize-y')}
              maxLength={4000}
              placeholder={`${SCENARIO_LABEL[s]} oy qanday ko‘rinadi — natijalar, sabablar, nima qilinadi (to‘liq yozing)`}
              value={scen[s]}
              onChange={(e) => setScen({ ...scen, [s]: e.target.value })}
            />
          </label>
        ))}
      </div>

      <div className={cn(CARD, 'grid gap-0 overflow-hidden')}>
        <div className="flex flex-wrap items-center gap-2 border-b border-au-line px-4 py-3">
          <Target className="size-4 text-au-accent-text" />
          <h3 className="flex-1 text-sm font-bold text-au-ink">Ko‘rsatkichlar va maqsadlar</h3>
          <button
            className={cn(BTN_GHOST, 'py-1.5 text-xs')}
            onClick={() => setItems(KPI_TEMPLATES[role].map((t) => emptyItem(t)))}
            title="Lavozimingizga mos shablon"
          >
            <RotateCcw className="size-3.5" /> Shablon
          </button>
        </div>
        <div className="grid divide-y divide-au-line">
          {items.map((it, i) => (
            <div key={i} className="grid gap-2 p-4 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))_auto] lg:items-start">
              <div className="grid gap-1.5">
                <input className={cn(INP, 'font-semibold')} maxLength={200} placeholder="Ko‘rsatkich nomi" value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} />
                <div className="flex gap-1.5">
                  <select className={cn(INP, 'py-1.5 text-xs')} value={it.kind} onChange={(e) => setItem(i, { kind: e.target.value as KpiItemKind })} aria-label="Turi">
                    {(Object.keys(KIND_LABEL) as KpiItemKind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <input className={cn(INP, 'w-28 py-1.5 text-xs')} maxLength={20} placeholder="Birlik" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} />
                </div>
              </div>
              {SCENARIOS.map((s) => {
                const key = `target_${s}` as const;
                const multi = it.kind === 'projects' || it.kind === 'text';
                return (
                  <label key={s} className="grid gap-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-au-faint lg:hidden">
                      <i className={cn('size-2 rounded-full', SC_STYLE[s].dot)} />
                      {SCENARIO_LABEL[s]}
                    </span>
                    {multi ? (
                      <textarea
                        className={cn(INP, 'min-h-[68px] resize-y')}
                        maxLength={2000}
                        placeholder={it.kind === 'projects' ? 'Har qatorda bitta loyiha nomi' : SCENARIO_LABEL[s]}
                        value={it[key]}
                        onChange={(e) => setItem(i, { [key]: e.target.value })}
                      />
                    ) : (
                      <input
                        className={INP}
                        inputMode={it.kind === 'text' ? 'text' : 'decimal'}
                        maxLength={60}
                        placeholder={SCENARIO_LABEL[s]}
                        value={it[key]}
                        onChange={(e) => setItem(i, { [key]: e.target.value })}
                      />
                    )}
                  </label>
                );
              })}
              <button
                className="grid size-9 place-items-center justify-self-end rounded-full text-au-faint hover:bg-au-card-2 hover:text-au-bad"
                aria-label="Ko‘rsatkichni o‘chirish"
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
              {SCENARIO_LABEL[s]}
            </span>
          ))}
          <span className="w-9" />
        </div>
        {items.length < 15 && (
          <button className={cn(BTN_GHOST, 'm-3 justify-self-start')} onClick={() => setItems((l) => [...l, emptyItem()])}>
            <Plus className="size-4" /> Ko‘rsatkich qo‘shish
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className={BTN_PRIMARY} disabled={busy} onClick={() => save(true)}>
          <Send className="size-4" /> {plan?.status === 'submitted' ? 'Qayta topshirish' : 'CEO’ga topshirish'}
        </button>
        <button className={BTN_GHOST} disabled={busy} onClick={() => save(false)}>
          Qoralama saqlash
        </button>
        {plan && plan.status !== 'submitted' && (
          <button
            className={cn(BTN, 'text-au-bad hover:bg-au-bad/10')}
            disabled={busy}
            onClick={() =>
              start(async () => {
                const res = await deleteKpiPlanAction(plan.id);
                if (res.error !== undefined) return void toast.error(errText(res.error));
                toast.success('Reja o‘chirildi');
                router.refresh();
              })
            }
          >
            <Trash2 className="size-4" /> O‘chirish
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
  const router = useRouter();
  const [busy, start] = useTransition();
  const [result, setResult] = useState<Scenario | null>(plan.self_result);
  const [note, setNote] = useState(plan.self_note ?? '');
  const [actuals, setActuals] = useState<Record<string, string>>(Object.fromEntries(plan.items.map((i) => [i.id!, i.actual])));

  if (plan.grade)
    return (
      <Banner tone={plan.grade === 'bad' ? 'bad' : 'ok'} icon={<Check className="size-4" />}>
        <b>CEO bahosi: {SCENARIO_LABEL[plan.grade]}</b> ({(plan.grade_pct ?? 0) > 0 ? '+' : ''}
        {plan.grade_pct}%) · {som(plan.grade_amount)}
        {plan.grade_note ? <div className="mt-1 text-au-muted">{plan.grade_note}</div> : null}
      </Banner>
    );

  return (
    <div className={cn(CARD, 'grid gap-3 p-4')}>
      <h3 className="text-sm font-bold text-au-ink">Oy yakuni — o‘zingizni baholang</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {plan.items.map((it) => (
          <label key={it.id} className="grid gap-1 text-[12px] font-semibold text-au-muted">
            {it.title} — haqiqiy natija
            <input className={INP} maxLength={2000} value={actuals[it.id!] ?? ''} onChange={(e) => setActuals({ ...actuals, [it.id!]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s}
            className={cn(BTN, 'border', result === s ? cn('border-transparent', SC_STYLE[s].chip) : 'border-au-line bg-au-card text-au-muted')}
            onClick={() => setResult(s)}
          >
            {SCENARIO_LABEL[s]}
          </button>
        ))}
      </div>
      <textarea className={cn(INP, 'min-h-[80px]')} maxLength={4000} placeholder="Izoh: nima bo‘ldi, nima to‘sqinlik qildi" value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        className={cn(BTN_PRIMARY, 'justify-self-start')}
        disabled={busy || !result}
        onClick={() =>
          start(async () => {
            const res = await selfAssessKpiAction({ planId: plan.id, result: result!, note, actuals });
            if (res.error !== undefined) return void toast.error(errText(res.error));
            toast.success('Baholashingiz saqlandi — CEO ko‘rib chiqadi');
            router.refresh();
          })
        }
      >
        Saqlash
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ employee */

export function MyKpi({ plans, role, thisMonth, nextMonth }: { plans: KpiPlan[]; role: Role; thisMonth: string; nextMonth: string }) {
  const next = plans.find((p) => p.month === nextMonth);
  const cur = plans.find((p) => p.month === thisMonth);
  const past = plans.filter((p) => p.month < thisMonth);
  return (
    <Tabs defaultValue={cur && cur.status !== 'approved' ? 'current' : 'next'}>
      <div className="flex flex-wrap items-center gap-3">
        <TabsList className="border border-au-line bg-au-card-2">
          <TabsTrigger value="next">Keyingi oy · {monthName(nextMonth)}</TabsTrigger>
          <TabsTrigger value="current">Joriy oy</TabsTrigger>
          <TabsTrigger value="history">Tarix</TabsTrigger>
        </TabsList>
        <Countdown month={nextMonth} />
        {next && <Chip className={STATUS_CHIP[next.status]}>{STATUS_LABEL[next.status]}</Chip>}
      </div>
      <TabsContent value="next" className="mt-4 outline-none">
        <PlanEditor key={next?.id ?? 'new'} month={nextMonth} plan={next} role={role} />
      </TabsContent>
      <TabsContent value="current" className="mt-4 grid gap-4 outline-none">
        {!cur ? (
          <div className="grid gap-3">
            <Banner tone="bad" icon={<AlertTriangle className="size-4" />}>
              {monthName(thisMonth)} uchun KPI rejasi yo‘q. Hozir kiritib, CEO’ga topshiring.
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
        {past.length === 0 && <p className="text-sm text-au-muted">Hali tarix yo‘q.</p>}
        {past.map((p) => (
          <details key={p.id} className={cn(CARD, 'group p-4')}>
            <summary className="flex cursor-pointer list-none items-center gap-3">
              <span className="flex-1 text-sm font-bold text-au-ink">{monthName(p.month)}</span>
              {p.grade ? <Chip className={SC_STYLE[p.grade].chip}>{SCENARIO_LABEL[p.grade]}</Chip> : <Chip className={STATUS_CHIP[p.status]}>{STATUS_LABEL[p.status]}</Chip>}
              {p.grade_amount != null && <b className="text-sm tabular-nums text-au-ink">{som(p.grade_amount)}</b>}
              <ChevronDown className="size-4 text-au-faint transition group-open:rotate-180" />
            </summary>
            <div className="mt-4">
              <PlanView plan={p} showActual />
            </div>
          </details>
        ))}
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------------------------------------ CEO */

function ReviewCard({ plan, member }: { plan: KpiPlan; member: TeamMember }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(plan.status === 'submitted');
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
      if (res.error !== undefined) return void toast.error(errText(res.error));
      toast.success(decision === 'approve' ? 'Tasdiqlandi — xodimga xabar yuborildi' : 'Qaytarildi — xodimga xabar yuborildi');
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
            {plan.items.length} ko‘rsatkich · oylik {member.salary ? som(member.salary).replace('+', '') : 'kiritilmagan'}
          </span>
        </span>
        {late && <Chip className="bg-au-bad/10 text-au-bad">Kechikdi</Chip>}
        <Chip className={STATUS_CHIP[plan.status]}>{STATUS_LABEL[plan.status]}</Chip>
        <ChevronDown className={cn('size-4 text-au-faint transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-au-line p-4">
          <PlanView plan={plan} />
          {plan.status !== 'approved' || !plan.grade ? (
            <div className="grid gap-3 rounded-au-ctl bg-au-card-2 p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                {SCENARIOS.map((s) => (
                  <label key={s} className="grid gap-1 text-[11px] font-semibold text-au-muted">
                    {SCENARIO_LABEL[s]} — oylikka %
                    <input className={INP} inputMode="decimal" value={pcts[s]} onChange={(e) => setPcts({ ...pcts, [s]: e.target.value })} />
                  </label>
                ))}
              </div>
              <textarea className={cn(INP, 'min-h-[64px]')} maxLength={2000} placeholder="Izoh (qaytarishda majburiy)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <button className={BTN_PRIMARY} disabled={busy} onClick={() => decide('approve')}>
                  <Check className="size-4" /> {plan.status === 'approved' ? 'Foizlarni saqlash' : 'Tasdiqlash'}
                </button>
                <button className={BTN_GHOST} disabled={busy} onClick={() => decide('return')}>
                  <Undo2 className="size-4" /> Qaytarish
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function GradeCard({ plan, member }: { plan: KpiPlan; member: TeamMember }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(!plan.grade);
  const [grade, setGrade] = useState<Scenario | null>(plan.grade ?? plan.self_result);
  const [override, setOverride] = useState('');
  const [note, setNote] = useState(plan.grade_note ?? '');
  const base = member.salary ?? 0;
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
            {monthName(plan.month)}
            {plan.self_result ? ` · o‘zi: ${SCENARIO_LABEL[plan.self_result]}` : ' · o‘zini baholamagan'}
          </span>
        </span>
        {plan.grade ? (
          <>
            <Chip className={SC_STYLE[plan.grade].chip}>{SCENARIO_LABEL[plan.grade]}</Chip>
            <b className="text-sm tabular-nums text-au-ink">{som(plan.grade_amount)}</b>
          </>
        ) : (
          <Chip className="bg-au-accent-soft text-au-accent-text">Baholanmagan</Chip>
        )}
        <ChevronDown className={cn('size-4 text-au-faint transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-au-line p-4">
          <PlanView plan={plan} showActual />
          {plan.self_note && (
            <p className="rounded-au-ctl bg-au-card-2 p-3 text-[13px] whitespace-pre-wrap text-au-muted">
              <b className="text-au-ink">Xodim izohi:</b> {plan.self_note}
            </p>
          )}
          <div className="grid gap-3 rounded-au-ctl bg-au-card-2 p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {SCENARIOS.map((s) => (
                <button
                  key={s}
                  className={cn(CARD, 'grid gap-0.5 border-t-4 p-3 text-left transition', SC_STYLE[s].ring, grade === s ? 'ring-2 ring-au-accent' : 'opacity-80 hover:opacity-100')}
                  onClick={() => {
                    setGrade(s);
                    setOverride('');
                  }}
                >
                  <span className="text-sm font-bold text-au-ink">{SCENARIO_LABEL[s]}</span>
                  <span className="text-xs text-au-muted">
                    {pctFor(plan, s) > 0 ? '+' : ''}
                    {pctFor(plan, s)}% · {som(Math.round((base * pctFor(plan, s)) / 100))}
                  </span>
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
              <label className="grid gap-1 text-[11px] font-semibold text-au-muted">
                Summa (qo‘lda o‘zgartirish, so‘m)
                <input className={INP} inputMode="numeric" placeholder={String(computed)} value={override} onChange={(e) => setOverride(e.target.value)} />
              </label>
              <label className="grid gap-1 text-[11px] font-semibold text-au-muted">
                Izoh xodimga
                <input className={INP} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            {!member.salary && <p className="text-xs text-au-bad">Bu xodimning oyligi Moliya bo‘limida kiritilmagan — summa 0 hisoblanadi.</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button
                className={BTN_PRIMARY}
                disabled={busy || !grade || !Number.isFinite(amount)}
                onClick={() =>
                  start(async () => {
                    const res = await gradeKpiPlanAction({ planId: plan.id, grade: grade!, amount: override.trim() ? amount : null, note });
                    if (res.error !== undefined) return void toast.error(errText(res.error));
                    toast.success(`Baholandi: ${som(res.amount)} — Moliya va xodimga yuborildi`);
                    router.refresh();
                  })
                }
              >
                <Check className="size-4" /> {plan.grade ? 'Bahoni yangilash' : 'Baholash'}
              </button>
              <span className="text-sm text-au-muted">
                Oylikka ta’sir: <b className={amount < 0 ? 'text-au-bad' : amount > 0 ? 'text-au-ok' : 'text-au-ink'}>{som(amount)}</b>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TeamKpi({
  team,
  plans,
  thisMonth,
  nextMonth,
  prevMonth,
}: {
  team: TeamMember[];
  plans: KpiPlan[];
  thisMonth: string;
  nextMonth: string;
  prevMonth: string;
}) {
  const byUser = useMemo(() => new Map(team.map((m) => [m.id, m])), [team]);
  const planOf = (uid: string, month: string) => plans.find((p) => p.user_id === uid && p.month === month);
  const nextPlans = plans.filter((p) => p.month === nextMonth && p.status !== 'draft' && byUser.has(p.user_id));
  const order = { submitted: 0, returned: 1, approved: 2, draft: 3 } as const;
  nextPlans.sort((a, b) => order[a.status] - order[b.status]);
  const missingNext = team.filter((m) => {
    const p = planOf(m.id, nextMonth);
    return !p || p.status === 'draft';
  });
  const toGrade = plans
    .filter((p) => (p.month === thisMonth || p.month === prevMonth) && p.status === 'approved' && byUser.has(p.user_id))
    .sort((a, b) => Number(!!a.grade) - Number(!!b.grade) || b.month.localeCompare(a.month));
  const pendingReview = nextPlans.filter((p) => p.status === 'submitted').length;
  const pendingGrade = toGrade.filter((p) => !p.grade).length;
  const cell = (p: KpiPlan | undefined) =>
    !p || p.status === 'draft' ? (
      <Chip className={STATUS_CHIP.missing}>Topshirilmagan</Chip>
    ) : p.grade ? (
      <Chip className={SC_STYLE[p.grade].chip}>
        {SCENARIO_LABEL[p.grade]} · {som(p.grade_amount)}
      </Chip>
    ) : (
      <Chip className={STATUS_CHIP[p.status]}>{STATUS_LABEL[p.status]}</Chip>
    );

  return (
    <Tabs defaultValue={pendingReview ? 'review' : pendingGrade ? 'grade' : 'team'}>
      <div className="flex flex-wrap items-center gap-3">
        <TabsList className="border border-au-line bg-au-card-2">
          <TabsTrigger value="review">Tasdiqlash{pendingReview ? ` · ${pendingReview}` : ''}</TabsTrigger>
          <TabsTrigger value="grade">Baholash{pendingGrade ? ` · ${pendingGrade}` : ''}</TabsTrigger>
          <TabsTrigger value="team">Jamoa</TabsTrigger>
        </TabsList>
        <Countdown month={nextMonth} />
      </div>

      <TabsContent value="review" className="mt-4 grid gap-3 outline-none">
        <div className="flex flex-wrap items-center gap-2 text-sm text-au-muted">
          <b className="text-au-ink">{monthName(nextMonth)}</b> rejalari · {team.length - missingNext.length} / {team.length} topshirdi
        </div>
        {missingNext.length > 0 && (
          <div className={cn(CARD, 'grid gap-2 p-4')}>
            <span className="text-sm font-semibold text-au-ink">Hali topshirmaganlar · {missingNext.length}</span>
            <div className="flex flex-wrap gap-1.5">
              {missingNext.map((m) => (
                <Chip key={m.id} className="bg-au-card-2 text-au-muted">
                  {m.first_name} {m.last_name}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {nextPlans.length === 0 && <p className="text-sm text-au-muted">Hozircha topshirilgan reja yo‘q.</p>}
        {nextPlans.map((p) => (
          <ReviewCard key={p.id} plan={p} member={byUser.get(p.user_id)!} />
        ))}
      </TabsContent>

      <TabsContent value="grade" className="mt-4 grid gap-3 outline-none">
        {toGrade.length === 0 && <p className="text-sm text-au-muted">Baholanadigan tasdiqlangan reja yo‘q.</p>}
        {toGrade.map((p) => (
          <GradeCard key={p.id} plan={p} member={byUser.get(p.user_id)!} />
        ))}
      </TabsContent>

      <TabsContent value="team" className="mt-4 outline-none">
        <div className={cn(CARD, 'overflow-x-auto')}>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-au-line text-left text-[11px] font-semibold tracking-wide text-au-faint uppercase">
                <th className="px-4 py-2.5">Xodim</th>
                <th className="px-3 py-2.5">{monthName(prevMonth)}</th>
                <th className="px-3 py-2.5">{monthName(thisMonth)}</th>
                <th className="px-3 py-2.5">{monthName(nextMonth)}</th>
              </tr>
            </thead>
            <tbody>
              {team.map((m) => (
                <tr key={m.id} className="border-b border-au-line/60 last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-au-ink">
                    {m.first_name} {m.last_name}
                  </td>
                  <td className="px-3 py-2.5">{cell(planOf(m.id, prevMonth))}</td>
                  <td className="px-3 py-2.5">{cell(planOf(m.id, thisMonth))}</td>
                  <td className="px-3 py-2.5">{cell(planOf(m.id, nextMonth))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabsContent>
    </Tabs>
  );
}
