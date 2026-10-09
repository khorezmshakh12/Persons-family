/**
 * Resource load — pure. Per person, per week: how many pieces of work they
 * carry (strategy tasks whose date range overlaps the week, site tasks due
 * that week, issues still open). Weighted into "load points" against a
 * weekly capacity so the Perforce Resurslar heat map can flag overload.
 * Tested in tests/perforce-load.test.ts. Day keys are Tashkent 'YYYY-MM-DD'.
 */

export const CAPACITY = 10; // points per person per week
export const WEIGHT = { stask: 4, task: 2, issue: 1 } as const;

export type LoadInput = {
  stasks: { id: string; title: string; assignee_id: string | null; start_date: string; end_date: string; status: string; space_id: string }[];
  tasks: { id: string; title: string; assigned_to: string | null; deadline: string | null; status: string }[];
  issues: { id: string; title: string; assigned_to: string | null; status: string; created_at: string }[];
};

export type LoadItem = { kind: keyof typeof WEIGHT; id: string; title: string; spaceId?: string };
export type WeekLoad = { points: number; items: LoadItem[] };

function addDays(k: string, n: number) {
  const d = new Date(`${k}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(k: string) {
  return addDays(k, -((new Date(`${k}T00:00:00Z`).getUTCDay() + 6) % 7));
}

/** `n` week starts beginning with the week of `today`. */
export function weekStarts(today: string, n = 8): string[] {
  const m = mondayOf(today);
  return Array.from({ length: n }, (_, i) => addDays(m, i * 7));
}

const tk = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().slice(0, 10);

export function loadMatrix(input: LoadInput, people: string[], weeks: string[]): Map<string, WeekLoad[]> {
  const out = new Map(people.map((p) => [p, weeks.map(() => ({ points: 0, items: [] as LoadItem[] }))]));
  const add = (who: string | null, w: number, item: LoadItem) => {
    const row = who ? out.get(who) : undefined;
    if (!row) return;
    row[w].points += WEIGHT[item.kind];
    row[w].items.push(item);
  };
  weeks.forEach((ws, w) => {
    const we = addDays(ws, 6);
    for (const t of input.stasks)
      if (t.status !== 'done' && t.start_date <= we && t.end_date >= ws) add(t.assignee_id, w, { kind: 'stask', id: t.id, title: t.title, spaceId: t.space_id });
    for (const t of input.tasks) {
      if (t.status === 'done' || !t.deadline) continue;
      const d = tk(t.deadline);
      // Overdue open work weighs on the current week.
      if ((d >= ws && d <= we) || (w === 0 && d < ws)) add(t.assigned_to, w, { kind: 'task', id: t.id, title: t.title });
    }
    // Open issues sit on the current week only (no due date).
    if (w === 0) for (const i of input.issues) if (i.status !== 'done') add(i.assigned_to, w, { kind: 'issue', id: i.id, title: i.title });
  });
  return out;
}

export type LoadLevel = 'free' | 'ok' | 'busy' | 'over';
export function level(points: number, capacity = CAPACITY): LoadLevel {
  if (points === 0) return 'free';
  if (points <= capacity * 0.7) return 'ok';
  if (points <= capacity) return 'busy';
  return 'over';
}

/** People over capacity this week or next, worst first. */
export function overloaded(m: Map<string, WeekLoad[]>, capacity = CAPACITY): { id: string; points: number; week: number }[] {
  const out: { id: string; points: number; week: number }[] = [];
  for (const [id, row] of m) {
    const w = row[0].points > capacity ? 0 : row[1]?.points > capacity ? 1 : -1;
    if (w >= 0) out.push({ id, points: row[w].points, week: w });
  }
  return out.sort((a, b) => b.points - a.points);
}

export type Rag = 'green' | 'amber' | 'red';
export const RAG_META: Record<Rag, { n: string; c: string }> = {
  green: { n: 'Rejada', c: 'var(--au-ok)' },
  amber: { n: 'E’tibor kerak', c: '#ff9f1c' },
  red: { n: 'Xavfli', c: 'var(--au-bad)' },
};

/** Suggested RAG from the numbers, so the PM starts from the data. */
export function suggestRag(progress: number, elapsed: number, lateShare: number, highRisks: number): Rag {
  if (lateShare > 0.2 || elapsed - progress > 25 || highRisks >= 2) return 'red';
  if (lateShare > 0 || elapsed - progress > 10 || highRisks === 1) return 'amber';
  return 'green';
}
