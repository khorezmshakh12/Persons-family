/** Murojaatlar markazi (v8-A) — the pure, client-safe rules: kinds,
 * priorities, response/resolve deadlines, the derived stage, and the
 * "this keeps happening" grouping. The server actions and the UI both
 * read these, so the board and the database can never disagree. */

export const ISSUE_KINDS = ['problem', 'request', 'idea'] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];
export const KIND_META: Record<IssueKind, { n: string; hint: string }> = {
  problem: { n: 'Muammo', hint: 'Nimadir ishlamayapti yoki xalaqit beryapti' },
  request: { n: 'So‘rov', hint: 'Nimadir kerak: jihoz, ruxsat, yordam' },
  idea: { n: 'Taklif', hint: 'Yaxshilash g‘oyasi — xohlasangiz anonim' },
};

export const PRIORITIES = ['urgent', 'high', 'normal'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_META: Record<Priority, { n: string; respondH: number; resolveH: number }> = {
  urgent: { n: 'Shoshilinch', respondH: 2, resolveH: 24 },
  high: { n: 'Yuqori', respondH: 4, resolveH: 72 },
  normal: { n: 'Oddiy', respondH: 24, resolveH: 168 },
};

/** Jev (lib/ai-triage.ts) category keys → labels. */
export const CATEGORY_LABEL: Record<string, string> = {
  sayt_it: 'Sayt / IT',
  texnik_jihoz: 'Jihoz / bino',
  oquv_jarayoni: 'O‘quv jarayoni',
  moliya: 'Moliya',
  xodimlar: 'Xodimlar',
  boshqa: 'Boshqa',
};

/** Days a resolved issue waits for the reporter before closing itself. */
export const AUTO_CLOSE_DAYS = 3;

export const STAGES = ['new', 'accepted', 'in_progress', 'resolved', 'closed'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_META: Record<Stage, { n: string; tone: 'info' | 'accent' | 'ok' | 'neutral' | 'bad' }> = {
  new: { n: 'Yangi', tone: 'bad' },
  accepted: { n: 'Qabul qilindi', tone: 'info' },
  in_progress: { n: 'Jarayonda', tone: 'accent' },
  resolved: { n: 'Hal qilindi', tone: 'ok' },
  closed: { n: 'Yopildi', tone: 'neutral' },
};

export type StageInput = { status: string; accepted_at: string | null; closed_at: string | null };

export function stageOf(i: StageInput): Stage {
  if (i.status === 'done') return i.closed_at ? 'closed' : 'resolved';
  if (i.status === 'in_progress') return 'in_progress';
  return i.accepted_at ? 'accepted' : 'new';
}

/** Moves a manager or the assignee can make from each stage. Confirming /
 * reopening a resolved issue is the reporter's (confirmIssueAction). */
export const STAGE_MOVES: Record<Stage, Stage[]> = {
  new: ['accepted', 'in_progress', 'resolved'],
  accepted: ['in_progress', 'resolved'],
  in_progress: ['resolved', 'accepted'],
  resolved: ['in_progress'],
  closed: ['in_progress'],
};

export const MOVE_LABEL: Record<Stage, string> = {
  new: 'Yangi',
  accepted: 'Qabul qilish',
  in_progress: 'Ishni boshlash',
  resolved: 'Hal qilindi',
  closed: 'Yopish',
};

/** Deadlines for a priority, counted from `fromMs`. Ideas get a response
 * deadline only — an idea is answered, not "fixed". */
export function deadlines(priority: Priority, kind: IssueKind, fromMs: number): { respondBy: string; resolveBy: string | null } {
  const m = PRIORITY_META[priority];
  return {
    respondBy: new Date(fromMs + m.respondH * 3_600_000).toISOString(),
    resolveBy: kind === 'idea' ? null : new Date(fromMs + m.resolveH * 3_600_000).toISOString(),
  };
}

export type SlaInput = StageInput & { respond_by: string | null; resolve_by: string | null };
export type Sla = { what: 'respond' | 'resolve'; dueMs: number; leftMs: number; breached: boolean; pctUsed: number | null };

/** The deadline that matters right now (response while new, resolution while
 * being worked on), or null when there is none / the issue is resolved. */
export function slaOf(i: SlaInput & { created_at: string }, nowMs: number): Sla | null {
  const stage = stageOf(i);
  const due = stage === 'new' ? i.respond_by : stage === 'accepted' || stage === 'in_progress' ? i.resolve_by : null;
  if (!due) return null;
  const dueMs = Date.parse(due);
  const startMs = Date.parse(i.created_at);
  const span = dueMs - startMs;
  return {
    what: stage === 'new' ? 'respond' : 'resolve',
    dueMs,
    leftMs: dueMs - nowMs,
    breached: nowMs > dueMs,
    pctUsed: span > 0 ? Math.min(100, Math.max(0, Math.round(((nowMs - startMs) / span) * 100))) : null,
  };
}

/** "2 soat 15 daq", "3 kun 4 soat", "40 daq". Absolute value — callers say
 * "qoldi" or "o‘tdi". */
export function fmtSpan(ms: number): string {
  const m = Math.max(0, Math.round(Math.abs(ms) / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return h ? `${d} kun ${h} soat` : `${d} kun`;
  if (h > 0) return mm ? `${h} soat ${mm} daq` : `${h} soat`;
  return `${mm} daq`;
}

/** Jev's 0..3 urgency score → the priority it suggests. */
export function priorityFromUrgency(u: number | null | undefined): Priority | null {
  if (u == null || !Number.isFinite(u)) return null;
  return u >= 2.5 ? 'urgent' : u >= 1.5 ? 'high' : 'normal';
}

/* ------------------------------------------------------------ recurrence */

const STOP = new Set([
  'va', 'bilan', 'uchun', 'emas', 'yoq', 'yo‘q', 'bor', 'ham', 'bu', 'shu', 'u', 'bir', 'juda', 'kerak', 'qilish', 'ishlamayapti',
  'и', 'в', 'не', 'на', 'с', 'the', 'a', 'is', 'not', 'and', 'to', 'of',
]);

export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[ʻʼ'`’‘]/g, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3 && !STOP.has(w))
      .map((w) => w.slice(0, 7)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

export type SimilarInput = { id: string; title: string; description: string | null; category: string | null; created_at: string };

/** Issues in the 30 days around `target` that look like the same problem:
 * same Jev category (when both have one) and enough shared words, or simply
 * very similar wording. Deterministic — no extra Jev call. */
export function similarIssues<T extends SimilarInput>(target: SimilarInput, all: T[], days = 30): T[] {
  const tt = tokens(`${target.title} ${target.description ?? ''}`);
  const t0 = Date.parse(target.created_at);
  return all.filter((o) => {
    if (o.id === target.id) return false;
    if (Math.abs(Date.parse(o.created_at) - t0) > days * 86_400_000) return false;
    const s = jaccard(tt, tokens(`${o.title} ${o.description ?? ''}`));
    const sameCat = target.category && o.category && target.category === o.category;
    return s >= 0.5 || (sameCat && s >= 0.25);
  });
}

/** The reporter as other people may see them: anonymous ideas hide the name
 * from everyone but the reporter. */
export function reporterLabel(anonymous: boolean, isSelf: boolean, name: string | null): string {
  if (anonymous && !isSelf) return 'Anonim';
  return name || '—';
}
