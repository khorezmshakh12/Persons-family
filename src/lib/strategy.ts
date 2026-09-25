// Strategy workspace — shared types, labels and pure date helpers (client-safe).
// Dates are 'YYYY-MM-DD' strings throughout (db/client.ts parses `date` to a
// string); day arithmetic is done in UTC so it never drifts with the viewer's
// timezone.

export type Workstream = 'aka' | 'it' | 'mkt' | 'fil' | 'mol' | 'hr';
export type TaskStatus = 'todo' | 'progress' | 'review' | 'done';
export type Priority = 'high' | 'med' | 'low';
export type NodeStatus = 'todo' | 'progress' | 'done' | 'skip';

export type StrategyTask = {
  id: string;
  space_id: string;
  title: string;
  description: string;
  workstream: Workstream;
  assignee_id: string | null;
  start_date: string;
  end_date: string;
  status: TaskStatus;
  priority: Priority;
  progress: number;
  roadmap_id: string | null;
  roadmap_node: string | null;
};

export type StrategyMind = {
  t: string;
  ch: { t: string; c: string; ws?: Workstream; ch: { t: string }[] }[];
};

export type StrategySpace = {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  start_date: string;
  end_date: string;
  mind: StrategyMind;
  budget: { ws: Workstream; plan: number; act: number }[];
};

export type RoadmapSection = { id: string; t: string; q: string; left: string[]; right: string[] };

export type StrategyRoadmap = {
  id: string;
  key: string;
  name: string;
  subtitle: string;
  icon: string;
  sections: RoadmapSection[];
  node_status: Record<string, NodeStatus>;
};

export type StrategyMilestone = { id: string; title: string; date: string };

export type StrategyPerson = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  role: string;
};

export const WORKSTREAMS: Record<Workstream, { n: string; c: string }> = {
  aka: { n: 'Akademik', c: '#ff9f1c' },
  it: { n: 'IT / LMS', c: '#2477c9' },
  mkt: { n: 'Marketing', c: '#e8567a' },
  fil: { n: 'Filial', c: '#7a5af8' },
  mol: { n: 'Moliya', c: '#139a52' },
  hr: { n: 'Jamoa / HR', c: '#0ea5a4' },
};

export const STATUSES: Record<TaskStatus, { n: string; c: string }> = {
  todo: { n: 'Rejada', c: '#b9b2a6' },
  progress: { n: 'Jarayonda', c: '#2477c9' },
  review: { n: 'Tekshiruvda', c: '#ff9f1c' },
  done: { n: 'Bajarildi', c: '#139a52' },
};

export const PRIORITIES: Record<Priority, { n: string; c: string }> = {
  high: { n: 'Yuqori', c: '#c7322b' },
  med: { n: "O'rta", c: '#ff9f1c' },
  low: { n: 'Past', c: '#c9c3b8' },
};

export const NODE_STATUSES: [NodeStatus, string][] = [
  ['todo', 'Rejada'],
  ['progress', 'Jarayonda'],
  ['done', 'Bajarildi'],
  ['skip', "O'tkazish"],
];

export const MIND_COLORS = ['#ff9f1c', '#e8567a', '#2477c9', '#7a5af8', '#139a52', '#0ea5a4', '#d97706', '#db2777'];

export const MON = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];
export const MONF = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

const DAY = 864e5;
/** 'YYYY-MM-DD' → UTC epoch day number. */
export const dayNum = (s: string) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY);
export const fromDayNum = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => fromDayNum(dayNum(s) + n);
export const daysBetween = (a: string, b: string) => dayNum(b) - dayNum(a);
export const fmtDay = (s: string) => `${+s.slice(8, 10)}-${MON[+s.slice(5, 7) - 1]}`;
/** 0 = Sunday … 6 = Saturday */
export const weekday = (s: string) => new Date(dayNum(s) * DAY).getUTCDay();

export const isLate = (t: Pick<StrategyTask, 'status' | 'end_date'>, today: string) =>
  t.status !== 'done' && t.end_date < today;

/** Rough workstream guess from a title — used when a roadmap node or mind-map
 * idea is turned into a task. */
export function guessWorkstream(t: string): Workstream {
  const s = t.toLowerCase();
  if (/lms|ilova|coin|davomat|portal|tech/.test(s)) return 'it';
  if (/brend|reels|marketing|social|ota-ona|tavsiya/.test(s)) return 'mkt';
  if (/filial|fransh/.test(s)) return 'fil';
  if (/budjet|fond|cashback|narx|venchur/.test(s)) return 'mol';
  if (/o'qituvchi|kpi|yollash|jamoa|mentor|yulduz/.test(s)) return 'hr';
  return 'aka';
}

/** Node ids a roadmap produces: section ids plus `${sec}-l${i}` / `${sec}-r${i}`. */
export function roadmapNodeName(r: StrategyRoadmap, nodeId: string): string | null {
  for (const sec of r.sections) {
    if (sec.id === nodeId) return sec.t;
    for (const side of ['left', 'right'] as const) {
      const i = sec[side].findIndex((_, j) => `${sec.id}-${side[0]}${j}` === nodeId);
      if (i > -1) return sec[side][i];
    }
  }
  return null;
}

/** Progress a task should carry after a status change: done is always 100%,
 * a finished task sent back to "todo" starts over, anything else keeps it. */
export function progressForStatus(prev: Pick<StrategyTask, 'status' | 'progress'>, status: TaskStatus): number {
  if (status === 'done') return 100;
  if (status === 'todo' && prev.status === 'done' && prev.progress === 100) return 0;
  return prev.progress;
}

type BudgetRow = StrategySpace['budget'][number];

/** Budget rows in workstream order, amounts rounded to 0.1 mln, empty rows dropped. */
export function normalizeBudget(rows: BudgetRow[]): BudgetRow[] {
  const order = Object.keys(WORKSTREAMS) as Workstream[];
  const r1 = (v: number) => Math.round((Number.isFinite(v) ? Math.max(0, v) : 0) * 10) / 10;
  return rows
    .filter((r) => order.includes(r.ws))
    .map((r) => ({ ws: r.ws, plan: r1(r.plan), act: r1(r.act) }))
    .filter((r) => r.plan > 0 || r.act > 0)
    .sort((a, b) => order.indexOf(a.ws) - order.indexOf(b.ws));
}

/** Totals for a space budget: plan, actual, remaining and usage (0..n). */
export function budgetTotals(rows: BudgetRow[]) {
  const plan = Math.round(rows.reduce((a, r) => a + r.plan, 0) * 10) / 10;
  const act = Math.round(rows.reduce((a, r) => a + r.act, 0) * 10) / 10;
  return { plan, act, left: Math.round((plan - act) * 10) / 10, used: plan > 0 ? act / plan : 0, over: act > plan };
}
