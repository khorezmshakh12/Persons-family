/**
 * Perforce v2 control logic — pure. Workload in DAYS (not points), the
 * project health suggestion with its reasons, and the "Bugun e'tibor kerak"
 * attention list. Tested in tests/perforce-load.test.ts.
 * Day keys are Tashkent 'YYYY-MM-DD'.
 */

export type LoadWeights = { stask: number; task: number; issue: number; capacity: number };
/** A project task ≈ 2 days of work per week it runs, a task ≈ 1 day, an open
 * issue ≈ half a day; a working week is 5 days. The CEO can change these. */
export const DEFAULT_WEIGHTS: LoadWeights = { stask: 2, task: 1, issue: 0.5, capacity: 5 };

export type LoadInput = {
  stasks: { id: string; title: string; assignee_id: string | null; start_date: string; end_date: string; status: string; space_id: string }[];
  tasks: { id: string; title: string; assigned_to: string | null; deadline: string | null; status: string }[];
  issues: { id: string; title: string; assigned_to: string | null; status: string; created_at: string }[];
};

export type LoadItem = { kind: 'stask' | 'task' | 'issue'; id: string; title: string; days: number; spaceId?: string };
export type WeekLoad = { days: number; items: LoadItem[]; leave: boolean };

function addDays(k: string, n: number) {
  const d = new Date(`${k}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dayNo = (k: string) => Math.round(new Date(`${k}T00:00:00Z`).getTime() / 86_400_000);

export function mondayOf(k: string) {
  return addDays(k, -((new Date(`${k}T00:00:00Z`).getUTCDay() + 6) % 7));
}

/** `n` week starts beginning with the week of `today`. */
export function weekStarts(today: string, n = 8): string[] {
  const m = mondayOf(today);
  return Array.from({ length: n }, (_, i) => addDays(m, i * 7));
}

const tk = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Per person × week workload in days. A project task adds `stask` days per
 * week, prorated by how many of the week's 7 days it overlaps; a task adds
 * `task` days in the week it is due (overdue ones weigh on this week); an
 * open issue adds `issue` days to this week. `leave` marks weeks fully off.
 */
export function loadMatrix(
  input: LoadInput,
  people: string[],
  weeks: string[],
  w: LoadWeights = DEFAULT_WEIGHTS,
  leave: { personId: string; from: string; to: string }[] = [],
): Map<string, WeekLoad[]> {
  const out = new Map(people.map((p) => [p, weeks.map(() => ({ days: 0, items: [] as LoadItem[], leave: false }))]));
  const add = (who: string | null, i: number, item: LoadItem) => {
    const row = who ? out.get(who) : undefined;
    if (!row || item.days <= 0) return;
    row[i].days = r1(row[i].days + item.days);
    row[i].items.push(item);
  };
  weeks.forEach((ws, i) => {
    const we = addDays(ws, 6);
    for (const t of input.stasks) {
      if (t.status === 'done' || t.start_date > we || t.end_date < ws) continue;
      const overlap = Math.min(dayNo(we), dayNo(t.end_date)) - Math.max(dayNo(ws), dayNo(t.start_date)) + 1;
      add(t.assignee_id, i, { kind: 'stask', id: t.id, title: t.title, days: r1((w.stask * overlap) / 7), spaceId: t.space_id });
    }
    for (const t of input.tasks) {
      if (t.status === 'done' || !t.deadline) continue;
      const d = tk(t.deadline);
      if ((d >= ws && d <= we) || (i === 0 && d < ws)) add(t.assigned_to, i, { kind: 'task', id: t.id, title: t.title, days: w.task });
    }
    if (i === 0) for (const s of input.issues) if (s.status !== 'done') add(s.assigned_to, i, { kind: 'issue', id: s.id, title: s.title, days: w.issue });
    for (const l of leave) {
      const row = out.get(l.personId);
      if (row && l.from <= ws && l.to >= addDays(ws, 4)) row[i].leave = true; // off the whole working week
    }
  });
  return out;
}

export type LoadLevel = 'free' | 'ok' | 'busy' | 'over';
export function level(days: number, capacity = DEFAULT_WEIGHTS.capacity): LoadLevel {
  if (days === 0) return 'free';
  if (days <= capacity * 0.7) return 'ok';
  if (days <= capacity) return 'busy';
  return 'over';
}

/** People over capacity this week or next, worst first. */
export function overloaded(m: Map<string, WeekLoad[]>, capacity = DEFAULT_WEIGHTS.capacity): { id: string; days: number; week: number }[] {
  const out: { id: string; days: number; week: number }[] = [];
  for (const [id, row] of m) {
    const i = row[0].days > capacity ? 0 : row[1]?.days > capacity ? 1 : -1;
    if (i >= 0) out.push({ id, days: row[i].days, week: i });
  }
  return out.sort((a, b) => b.days - a.days);
}

/* ------------------------------------------------------------ health */

export type Rag = 'green' | 'amber' | 'red';
export const RAG_META: Record<Rag, { n: string; c: string; soft: string }> = {
  green: { n: 'Yaxshi', c: 'var(--au-ok)', soft: 'color-mix(in oklab, var(--au-ok) 16%, transparent)' },
  amber: { n: 'Diqqat', c: '#e08a00', soft: 'color-mix(in oklab, #ff9f1c 20%, transparent)' },
  red: { n: 'Xavf', c: 'var(--au-bad)', soft: 'color-mix(in oklab, var(--au-bad) 16%, transparent)' },
};

export type Health = { progress: number; elapsed: number; behind: number; late: number; total: number; highRisks: number };

/** Suggested RAG and the plain-language reasons behind it. */
export function suggest(h: Health): { rag: Rag; reasons: string[] } {
  const lateShare = h.total ? h.late / h.total : 0;
  const reasons: string[] = [];
  if (h.late) reasons.push(`${h.late} ta kechikkan vazifa`);
  if (h.behind > 10) reasons.push(`${Math.round(h.behind)} punkt orqada`);
  if (h.highRisks) reasons.push(`${h.highRisks} ta yuqori xavf`);
  const rag: Rag = lateShare > 0.2 || h.behind > 25 || h.highRisks >= 2 ? 'red' : h.late > 0 || h.behind > 10 || h.highRisks === 1 ? 'amber' : 'green';
  if (!reasons.length) reasons.push('reja bo‘yicha');
  return { rag, reasons };
}

/** Back-compat name used by the status board. */
export function suggestRag(progress: number, elapsed: number, lateShare: number, highRisks: number): Rag {
  return suggest({ progress, elapsed, behind: elapsed - progress, late: lateShare > 0 ? 1 : 0, total: lateShare > 0 ? Math.round(1 / lateShare) : 1, highRisks }).rag;
}

/* ------------------------------------------------------------ attention */

export type Attention = { key: string; level: 'red' | 'amber'; text: string; tab: 'overview' | 'status' | 'load' | 'risks' | 'decisions'; ref?: string };

export function attention(input: {
  today: string;
  projects: { id: string; name: string; rag: Rag | null; lastStatusDay: string | null; active: boolean }[];
  decisions: { id: string; title: string; status: string; created_at: string }[];
  overloaded: { name: string; days: number; week: number }[];
  milestones: { id: string; title: string; date: string; project: string }[];
  risks: { id: string; title: string; score: number; status: string; review_date: string | null }[];
}): Attention[] {
  const { today } = input;
  const out: Attention[] = [];
  const age = (d: string) => dayNo(today) - dayNo(d.slice(0, 10));
  for (const p of input.projects.filter((x) => x.active && x.rag === 'red'))
    out.push({ key: `red-${p.id}`, level: 'red', text: `«${p.name}» — holati: Xavf`, tab: 'status', ref: p.id });
  for (const d of input.decisions.filter((x) => x.status === 'review'))
    out.push({ key: `dec-${d.id}`, level: age(d.created_at) >= 3 ? 'red' : 'amber', text: `Qaror kutmoqda: «${d.title}» (${age(d.created_at)} kun)`, tab: 'decisions', ref: d.id });
  for (const p of input.projects.filter((x) => x.active && (!x.lastStatusDay || age(x.lastStatusDay) > 7)))
    out.push({ key: `stale-${p.id}`, level: 'amber', text: p.lastStatusDay ? `«${p.name}» holati ${age(p.lastStatusDay)} kundan beri yozilmagan` : `«${p.name}» uchun hali holat yozilmagan`, tab: 'status', ref: p.id });
  for (const o of input.overloaded)
    out.push({ key: `load-${o.name}`, level: o.week === 0 ? 'red' : 'amber', text: `${o.name} ${o.week === 0 ? 'shu hafta' : 'keyingi hafta'} ${o.days} kun band (me’yordan ortiq)`, tab: 'load' });
  for (const m of input.milestones.filter((x) => x.date >= today && dayNo(x.date) - dayNo(today) <= 7))
    out.push({ key: `ms-${m.id}`, level: 'amber', text: `${m.date.slice(8)}.${m.date.slice(5, 7)} — «${m.title}» (${m.project})`, tab: 'overview' });
  for (const r of input.risks.filter((x) => x.status !== 'closed' && x.status !== 'occurred'))
    if (r.score >= 12) out.push({ key: `risk-${r.id}`, level: r.score >= 20 ? 'red' : 'amber', text: `Yuqori xavf: «${r.title}» (ball ${r.score})`, tab: 'risks', ref: r.id });
    else if (r.review_date && r.review_date < today) out.push({ key: `rev-${r.id}`, level: 'amber', text: `Xavfni qayta ko‘rish muddati o‘tdi: «${r.title}»`, tab: 'risks', ref: r.id });
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
}

/* ------------------------------------------------------------ decisions */

export const DECISION_KINDS = ['deadline', 'budget', 'scope', 'people', 'other'] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];
export const DECISION_KIND_LABEL: Record<DecisionKind, string> = {
  deadline: 'Muddat',
  budget: 'Budjet',
  scope: 'Maqsad / natija',
  people: 'Odamlar',
  other: 'Boshqa',
};
export const DECISION_STATUSES = ['draft', 'review', 'approved', 'rejected'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];
export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  draft: 'Qoralama',
  review: 'Ko‘rib chiqilmoqda',
  approved: 'Tasdiqlandi',
  rejected: 'Rad etildi',
};
/** Allowed moves: author submits / takes back; leadership decides or reopens. */
export const DECISION_FLOW: Record<DecisionStatus, DecisionStatus[]> = {
  draft: ['review'],
  review: ['approved', 'rejected', 'draft'],
  approved: ['review'],
  rejected: ['review'],
};
