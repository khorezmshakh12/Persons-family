import type { NodeStatus } from '@/lib/strategy';

/**
 * HR › Roadmap va Mind map — har bir xodimning shaxsiy rivojlanish rejasi.
 * Ko'rinishi Strategy'dagi Roadmap / Mind map bilan bir xil; farqi:
 * - har bir mavzu va shox ichiga cheksiz band qo'shiladi (daraxt);
 * - roadmap «CEO'ga topshirish»dan keyingina CEO'ga ko'rinadi;
 * - bosqich: xodim «yakunladim» → CEO tasdiqlaydi → keyingi bosqich ochiladi.
 * Mind map CEO'ga doim ko'rinadi (faqat o'qish). Client-safe.
 */

export type GrowthNode = { id: string; t: string; ch: GrowthNode[] };
export type GrowthStage = { id: string; t: string; q: string; left: GrowthNode[]; right: GrowthNode[] };
export type GrowthRoadmap = { name: string; subtitle: string; sections: GrowthStage[] };

export type StageReview =
  | { s: 'self_done'; at: string }
  | { s: 'approved'; at: string; by: string; note?: string }
  | { s: 'returned'; at: string; by: string; note: string };

export type MindNode = { id: string; t: string; c?: string; ch: MindNode[] };
export type GrowthMind = { t: string; ch: MindNode[] };

export type GrowthPlan = {
  userId: string;
  name: string;
  role: string;
  roadmap: GrowthRoadmap;
  nodeStatus: Record<string, NodeStatus>;
  stageState: Record<string, StageReview>;
  mind: GrowthMind;
  submittedAt: string | null;
};

/** One row of the CEO's team list. */
export type GrowthPerson = {
  userId: string;
  name: string;
  role: string;
  submitted: boolean;
  stages: number;
  approved: number;
  waiting: number;
  mindNodes: number;
};

export const EMPTY_ROADMAP: GrowthRoadmap = { name: '', subtitle: '', sections: [] };
export const EMPTY_MIND: GrowthMind = { t: '', ch: [] };

/** Limits that keep one plan a sane size ("cheksiz" for any real use). */
export const GROWTH_MAX_NODES = 1500;
export const GROWTH_MAX_DEPTH = 24;

export const growthId = () =>
  `g${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 7)}`.replace(/[^a-z0-9]/g, '');

export type StagePhase = 'approved' | 'waiting' | 'current' | 'locked';

/** Stages pass strictly in order: only the first not-approved stage is open. */
export function stagePhases(r: GrowthRoadmap, state: Record<string, StageReview>): Record<string, StagePhase> {
  const out: Record<string, StagePhase> = {};
  let open = true;
  for (const s of r.sections) {
    const st = state[s.id]?.s;
    if (st === 'approved' && open) out[s.id] = 'approved';
    else if (open) {
      out[s.id] = st === 'self_done' ? 'waiting' : 'current';
      open = false;
    } else out[s.id] = 'locked';
  }
  return out;
}

export function walkNodes<T extends { ch: T[] }>(list: T[], f: (n: T, depth: number) => void, depth = 1) {
  for (const n of list) {
    f(n, depth);
    walkNodes(n.ch, f, depth + 1);
  }
}

/** Every node id inside a stage (topics and their sub-items). */
export function stageNodeIds(s: GrowthStage): string[] {
  const ids: string[] = [];
  walkNodes([...s.left, ...s.right], (n) => ids.push(n.id));
  return ids;
}

/** A stage is finished when every topic and sub-item is done or skipped. */
export function stageComplete(s: GrowthStage, status: Record<string, NodeStatus>): boolean {
  const ids = stageNodeIds(s);
  return ids.every((id) => status[id] === 'done' || status[id] === 'skip');
}

export function findStageOf(r: GrowthRoadmap, nodeId: string): GrowthStage | undefined {
  return r.sections.find((s) => s.id === nodeId || stageNodeIds(s).includes(nodeId));
}

export function findNode<T extends { id: string; ch: T[] }>(list: T[], id: string): T | undefined {
  for (const n of list) {
    if (n.id === id) return n;
    const hit = findNode(n.ch, id);
    if (hit) return hit;
  }
  return undefined;
}

/** Immutable update of one node anywhere in a tree. */
export function mapNode<T extends { id: string; ch: T[] }>(list: T[], id: string, f: (n: T) => T | null): T[] {
  const out: T[] = [];
  for (const n of list) {
    if (n.id === id) {
      const next = f(n);
      if (next) out.push(next);
    } else out.push({ ...n, ch: mapNode(n.ch, id, f) });
  }
  return out;
}

export function countNodes<T extends { ch: T[] }>(list: T[]): number {
  let n = 0;
  walkNodes(list, () => n++);
  return n;
}
