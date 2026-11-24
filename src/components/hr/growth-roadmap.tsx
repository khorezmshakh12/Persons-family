'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, CornerDownRight, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { ask, toast } from '@/components/strategy/suite-shell';
import { NODE_STATUSES, type NodeStatus } from '@/lib/strategy';
import {
  countNodes,
  growthId,
  mapNode,
  stageComplete,
  stageNodeIds,
  type GrowthLogEntry,
  type GrowthNode,
  type GrowthRoadmap,
  type GrowthStage,
  type StagePhase,
  type StageReview,
} from '@/lib/hr-growth';

/* =====================================================================
   Roadmap canvas — the exact Strategy › Roadmap layout (view-roadmap.tsx):
   stages down the spine, topics left / right. Topic ids are stable, and a
   topic's sub-items (any depth) live in its drawer; the badge counts them.
   ===================================================================== */

type Node = { id: string; t: string; q?: string; main: boolean; x: number; y: number; w: number; h: number; sub: number };
type Link = { x1: number; y1: number; x2: number; y2: number; main: boolean };

const W = 820;
const CX = W / 2;
const MW = 210;
const MH = 52;
const TW = 196;
const TH = 40;
const GAP_Y = 180;
const ROW = TH + 18;

function layout(r: GrowthRoadmap) {
  const nodes: Node[] = [];
  const links: Link[] = [];
  let y = 40;
  let prevY = 0;
  r.sections.forEach((sec, i) => {
    if (i > 0) links.push({ x1: CX, y1: prevY + MH, x2: CX, y2: y, main: true });
    nodes.push({ id: sec.id, t: sec.t, q: sec.q, main: true, x: CX - MW / 2, y, w: MW, h: MH, sub: 0 });
    (['left', 'right'] as const).forEach((side) =>
      sec[side].forEach((tp, j) => {
        const x = side === 'left' ? 16 : W - 16 - TW;
        const ny = y - 30 + j * (TH + 18) + (MH / 2 - TH / 2) + 2;
        nodes.push({ id: tp.id, t: tp.t, main: false, x, y: ny, w: TW, h: TH, sub: countNodes(tp.ch) });
        links.push({
          x1: side === 'left' ? CX - MW / 2 : CX + MW / 2,
          y1: y + MH / 2,
          x2: side === 'left' ? x + TW : x,
          y2: ny + TH / 2,
          main: false,
        });
      }),
    );
    prevY = y;
    y += Math.max(GAP_Y, Math.max(sec.left.length, sec.right.length) * ROW + 64);
  });
  return { nodes, links, H: y };
}

const path = (l: Link) =>
  l.main
    ? `M${l.x1} ${l.y1} L${l.x2} ${l.y2}`
    : `M${l.x1} ${l.y1} C${(l.x1 + l.x2) / 2} ${l.y1}, ${(l.x1 + l.x2) / 2} ${l.y2}, ${l.x2} ${l.y2}`;

const PHASE_CLASS: Record<StagePhase, string> = { approved: 'done', waiting: 'progress', current: 'todo', locked: 'skip' };
const PHASES: StagePhase[] = ['approved', 'waiting', 'current', 'locked'];
const LOGS: GrowthLogEntry['s'][] = ['self_done', 'unmarked', 'approved', 'returned', 'unapproved'];

/** Roadmap labels in the viewer's language. */
function useGr() {
  const t = useTranslations('gr');
  const tp = useTranslations('gr.ph');
  const tl = useTranslations('gr.log');
  const tn = useTranslations('gr.ns');
  return {
    t,
    ph: Object.fromEntries(PHASES.map((p) => [p, tp(p)])) as Record<StagePhase, string>,
    log: Object.fromEntries(LOGS.map((p) => [p, tl(p)])) as Record<GrowthLogEntry['s'], string>,
    ns: NODE_STATUSES.map(([k]) => [k, tn(k)] as [NodeStatus, string]),
  };
}

/* A small pencil at the node's right edge. It used to cover the whole node
   (absolute inset-0), so every click renamed instead of opening the drawer —
   ticking topics and «Bosqichni yakunladim» were unreachable. */
function InlineRename({ title, onSave }: { title: string; onSave: (t: string) => void }) {
  const G = useGr();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(title);
  const save = () => {
    const t = v.trim();
    setEditing(false);
    if (t && t !== title) onSave(t);
    else setV(title);
  };
  if (!editing)
    return (
      <span
        role="button"
        tabIndex={-1}
        aria-label={G.t('rename')}
        title={G.t('rename')}
        className="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded bg-au-card opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setV(title);
          setEditing(true);
        }}
      >
        <Pencil className="size-3 shrink-0 text-au-muted" />
      </span>
    );
  return (
    <input
      autoFocus
      type="text"
      maxLength={120}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') {
          setEditing(false);
          setV(title);
        }
      }}
      onBlur={save}
      onClick={(e) => e.stopPropagation()}
      className="absolute inset-0 rounded bg-au-card px-1 text-xs font-medium outline-none ring-1 ring-au-accent"
      style={{ fontSize: 'inherit', fontWeight: 'inherit' }}
    />
  );
}

export function GrowthRoadmapView({
  roadmap,
  status,
  phases,
  selected,
  editable,
  emptyText,
  onNode,
  onNew,
  onRename,
  onTick,
  today,
  side,
}: {
  roadmap: GrowthRoadmap;
  status: Record<string, NodeStatus>;
  phases: Record<string, StagePhase>;
  selected: string | null;
  editable: boolean;
  emptyText: string;
  onNode: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, t: string) => void;
  /** Tick a topic right on the canvas (owner, open stage only). */
  onTick?: (id: string, s: NodeStatus) => void;
  today: string;
  /** Right column top card (owner / person picker). */
  side: React.ReactNode;
}) {
  const G = useGr();
  const { nodes, links, H } = layout(roadmap);
  const stageOf = new Map(roadmap.sections.flatMap((s) => [...s.left, ...s.right].map((t) => [t.id, s.id] as const)));
  const dueOf = new Map(roadmap.sections.map((s) => [s.id, s.due]));
  const st = (n: Node) => (n.main ? PHASE_CLASS[phases[n.id] ?? 'current'] : (status[n.id] ?? 'todo'));
  const topics = nodes.filter((n) => !n.main);
  const doneN = topics.filter((n) => st(n) === 'done').length;
  const progN = topics.filter((n) => st(n) === 'progress').length;
  const pct = topics.length ? Math.round((doneN / topics.length) * 100) : 0;
  const stages = roadmap.sections.length;
  const approved = roadmap.sections.filter((s) => phases[s.id] === 'approved').length;

  return (
    <div className="sx-rm-wrap">
      <div className="sx-card rm">
        {stages === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <h3 className="text-base font-bold text-au-ink">{G.t('noRoadmap')}</h3>
            <p className="max-w-md text-sm text-au-muted">{emptyText}</p>
            {editable && (
              <button className="sx-btn primary" onClick={onNew}>
                <Plus className="size-4" /> {G.t('create')}
              </button>
            )}
          </div>
        ) : (
          <div className="rm-canvas" style={{ width: W, height: H }}>
            <svg className="links" width={W} height={H}>
              {links.map((l, i) => (
                <path
                  key={i}
                  d={path(l)}
                  fill="none"
                  stroke={l.main ? 'var(--au-ink)' : '#2477c9'}
                  strokeWidth={l.main ? 3 : 2}
                  strokeDasharray={l.main ? undefined : '1 7'}
                  strokeLinecap="round"
                  className={l.main ? 'sx-draw' : 'sx-march'}
                />
              ))}
            </svg>
            {nodes.map((n, i) => {
              const tick = !n.main && editable && !!onTick && phases[stageOf.get(n.id) ?? ''] === 'current';
              const done = st(n) === 'done' || st(n) === 'skip';
              const due = n.main ? dueOf.get(n.id) : undefined;
              const late = !!due && due < today && phases[n.id] !== 'approved';
              return (
              <button
                key={n.id}
                className={cn('rn group relative', n.main ? 'main' : 'topic', st(n), selected === n.id && 'sel', tick && '!pl-8')}
                style={{ left: n.x, top: n.y, width: n.w, height: n.h, animationDelay: `${Math.min(i, 30) * 25}ms` }}
                onClick={() => onNode(n.id)}
                title={n.main ? G.ph[phases[n.id] ?? 'current'] : undefined}
              >
                {n.main && (
                  <span className={cn('q', late && '!text-au-bad')}>
                    {phases[n.id] === 'locked' && <Lock className="mr-0.5 inline size-2.5" />}
                    {n.q || G.ph[phases[n.id] ?? 'current']}
                    {due && ` · ${due.slice(8, 10)}.${due.slice(5, 7)}.${due.slice(0, 4)}${late ? G.t('late') : ''}`}
                  </span>
                )}
                {tick && (
                  <span
                    role="checkbox"
                    aria-checked={done}
                    aria-label={done ? G.t('unmark') : G.t('mark')}
                    tabIndex={0}
                    className={cn(
                      'absolute top-1/2 left-2 grid size-[18px] -translate-y-1/2 place-items-center rounded border',
                      done ? 'border-au-ok bg-au-ok text-white' : 'border-au-line bg-au-card',
                    )}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTick!(n.id, done ? 'todo' : 'done');
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== ' ' && e.key !== 'Enter') return;
                      e.preventDefault();
                      e.stopPropagation();
                      onTick!(n.id, done ? 'todo' : 'done');
                    }}
                  >
                    {done && <Check className="size-3" />}
                  </span>
                )}
                <span className="truncate">{n.t}</span>
                {n.sub > 0 && <span className="cnt">{n.sub}</span>}
                {editable && <InlineRename title={n.t} onSave={(t) => onRename(n.id, t)} />}
              </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="rm-side">
        {side}
        <div className="sx-card rm-prog">
          <div className="ct">
            <h3>{G.t('progress')}</h3>
            <small>
              {G.t('stagesApproved', { a: approved, n: stages })}
            </small>
          </div>
          <div className="big tabular-nums">{pct}%</div>
          <div className="bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-au-muted">
            {G.t.rich('summary', { d: doneN, p: progN, l: topics.length - doneN - progN, ok: (c) => <b className="text-au-ok">{c}</b>, pr: (c) => <b className="text-au-accent-text">{c}</b> })}
          </div>
        </div>
        <div className="sx-card">
          <div className="ct">
            <h3>{G.t('legend')}</h3>
          </div>
          <div className="rm-leg">
            <div>
              <i style={{ background: '#ffd166' }} />
              {G.t('lgMain')}
            </div>
            <div>
              <i style={{ background: 'var(--au-card)' }} />
              {G.t('lgTopic')}
            </div>
            <div>
              <i style={{ background: '#e3f5ea', borderColor: '#139a52' }} />
              {G.t('lgDone')}
            </div>
            <div>
              <i style={{ background: '#fff4e1', borderColor: '#ff9f1c' }} />
              {G.t('lgProg')}
            </div>
            <div>
              <i style={{ background: 'var(--au-card)', opacity: 0.45 }} />
              {G.t('lgLocked')}
            </div>
          </div>
          <p className="mt-3 text-xs text-au-faint">
            {G.t('help')}
          </p>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   Node drawer — stage: approval flow; topic: status + sub-item tree.
   ===================================================================== */

function Seg<K extends string>({ value, options, onChange, disabled }: { value: K; options: [K, string][]; onChange: (k: K) => void; disabled?: boolean }) {
  return (
    <div className="sx-seg">
      {options.map(([k, n]) => (
        <button key={k} type="button" disabled={disabled} className={cn(value === k && 'on')} onClick={() => onChange(k)}>
          {n}
        </button>
      ))}
    </div>
  );
}

function SubTree({
  list,
  status,
  canTick,
  canEdit,
  onStatus,
  onTree,
}: {
  list: GrowthNode[];
  status: Record<string, NodeStatus>;
  canTick: boolean;
  canEdit: boolean;
  onStatus: (id: string, s: NodeStatus) => void;
  /** Replace the node `id` (null = delete). */
  onTree: (id: string, f: (n: GrowthNode) => GrowthNode | null) => void;
}) {
  const G = useGr();
  const [adding, setAdding] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  if (!list.length) return null;
  return (
    <ul className="grid gap-1">
      {list.map((n) => {
        const done = status[n.id] === 'done' || status[n.id] === 'skip';
        return (
          <li key={n.id} className="grid gap-1">
            <div className="group flex items-center gap-2 rounded-au-ctl px-1.5 py-1 hover:bg-au-card-2">
              <button
                type="button"
                disabled={!canTick}
                aria-label={done ? G.t('unmark') : G.t('mark')}
                onClick={() => onStatus(n.id, done ? 'todo' : 'done')}
                className={cn(
                  'grid size-[18px] shrink-0 place-items-center rounded border',
                  done ? 'border-au-ok bg-au-ok text-white' : 'border-au-line bg-au-card',
                  !canTick && 'opacity-60',
                )}
              >
                {done && <Check className="size-3" />}
              </button>
              {renaming === n.id ? (
                <input
                  autoFocus
                  className="sx-inp h-7 min-w-0 flex-1 text-[13px]"
                  defaultValue={n.t}
                  maxLength={120}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setRenaming(null);
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim();
                    setRenaming(null);
                    if (v && v !== n.t) onTree(n.id, (x) => ({ ...x, t: v }));
                  }}
                />
              ) : (
                <span className={cn('min-w-0 flex-1 text-[13px] break-words', done && 'text-au-faint line-through')}>{n.t}</span>
              )}
              {canEdit && (
                <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button className="sx-chipb" aria-label={G.t('addInside')} title={G.t('addInside')} onClick={() => (setAdding(n.id), setText(''))}>
                    <CornerDownRight className="size-3" />
                  </button>
                  <button className="sx-chipb" aria-label={G.t('rename')} onClick={() => setRenaming(n.id)}>
                    <Pencil className="size-3" />
                  </button>
                  <button
                    className="sx-chipb text-au-bad"
                    aria-label={G.t('delete')}
                    onClick={async () => {
                      const k = countNodes(n.ch);
                      if (await ask(k ? G.t('delWith', { t: n.t, n: k }) : G.t('delOne', { t: n.t }))) onTree(n.id, () => null);
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
            </div>
            {adding === n.id && (
              <div className="flex gap-1 pl-7">
                <input
                  autoFocus
                  className="sx-inp h-8 min-w-0 flex-1 text-[13px]"
                  maxLength={120}
                  placeholder={G.t('subPh')}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setAdding(null);
                    if (e.key === 'Enter' && text.trim()) {
                      const t = text.trim();
                      onTree(n.id, (x) => ({ ...x, ch: [...x.ch, { id: growthId(), t, ch: [] }] }));
                      setText('');
                    }
                  }}
                />
                <button className="sx-chipb" aria-label={G.t('close')} onClick={() => setAdding(null)}>
                  <X className="size-3" />
                </button>
              </div>
            )}
            {n.ch.length > 0 && (
              <div className="ml-[13px] border-l border-dashed border-au-line pl-3">
                <SubTree list={n.ch} status={status} canTick={canTick} canEdit={canEdit} onStatus={onStatus} onTree={onTree} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function GrowthNodeDrawer({
  roadmap,
  nodeId,
  status,
  phases,
  review,
  log,
  names,
  today,
  sent,
  own,
  canReview,
  onClose,
  onStatus,
  onTree,
  onMark,
  onReview,
  onUnapprove,
}: {
  roadmap: GrowthRoadmap;
  nodeId: string;
  status: Record<string, NodeStatus>;
  phases: Record<string, StagePhase>;
  review: Record<string, StageReview>;
  /** Decision history of the whole plan (filtered to this stage here). */
  log: GrowthLogEntry[];
  /** user id → name, for the history lines. */
  names: Record<string, string>;
  today: string;
  /** This stage was sent to the CEO exactly as it is in the draft. */
  sent: boolean;
  /** The viewer owns this roadmap (may edit / tick / mark). */
  own: boolean;
  canReview: boolean;
  onClose: () => void;
  onStatus: (id: string, s: NodeStatus) => void;
  onTree: (id: string, f: (n: GrowthNode) => GrowthNode | null) => void;
  onMark: (stageId: string, done: boolean) => Promise<void>;
  onReview: (stageId: string, approve: boolean, note: string) => Promise<boolean>;
  onUnapprove: (stageId: string, note: string) => Promise<boolean>;
}) {
  const G = useGr();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [text, setText] = useState('');
  const sec = roadmap.sections.find((s) => s.id === nodeId || stageNodeIds(s).includes(nodeId));
  if (!sec) return null;
  const main = sec.id === nodeId;
  const phase = phases[sec.id] ?? 'current';
  const rev = review[sec.id];
  const topic = main ? undefined : [...sec.left, ...sec.right].map((t) => findIn(t, nodeId)).find(Boolean);
  const canTick = own && phase === 'current';
  const canEdit = own;
  const ids = stageNodeIds(sec);
  const doneIds = ids.filter((id) => status[id] === 'done' || status[id] === 'skip').length;
  const complete = stageComplete(sec, status);
  const idx = roadmap.sections.indexOf(sec);
  const nextSec = roadmap.sections[idx + 1];
  /** Only the newest approval can be undone (keeps the stage order intact). */
  const canUndo = canReview && phase === 'approved' && (!nextSec || phases[nextSec.id] !== 'approved');
  const hist = log.filter((e) => e.st === sec.id).slice().reverse();

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    await f();
    setBusy(false);
  };

  return (
    <>
      <div className="dr-h">
        <span className="sx-node-chip">{main ? G.t('stage') : G.t('topic')}</span>
        <span className="text-xs text-au-faint">
          {roadmap.name || 'Roadmap'} · {sec.t}
        </span>
        <button className="x" onClick={onClose} aria-label={G.t('close')}>
          <X className="size-4" />
        </button>
      </div>
      <div className="dr-b">
        <div className="ttl">{main ? sec.t : topic?.t}</div>
        {main ? (
          <>
            <p className="text-au-muted">
              {sec.q ? `${sec.q} · ` : ''}
              {G.t('stageHint', { p: G.ph[phase] })}
            </p>
            <div className="fld">
              <label>{G.t('doneL')}</label>
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-au-line">
                  <div className="h-full rounded-full bg-au-ok" style={{ width: `${ids.length ? (doneIds / ids.length) * 100 : 0}%` }} />
                </div>
                <span className="text-sm tabular-nums text-au-muted">
                  {doneIds}/{ids.length}
                </span>
              </div>
            </div>
            {rev?.s === 'returned' && phase === 'current' && (
              <div className="rounded-au-ctl bg-au-bad-soft px-3 py-2 text-[13px] text-au-bad">{G.t('ceoReturned', { n: rev.note ?? '' })}</div>
            )}
            {rev?.s === 'approved' && rev.note && <div className="rounded-au-ctl bg-au-ok-soft px-3 py-2 text-[13px] text-au-ok">{G.t('ceoNote', { n: rev.note })}</div>}
            {sec.due && (
              <div className="fld">
                <label>{G.t('due')}</label>
                <span className={cn('text-sm', sec.due < today && phase !== 'approved' ? 'font-semibold text-au-bad' : 'text-au-ink')}>
                  {fmtDay(sec.due)}
                </span>
              </div>
            )}
            <div className="dr-sec">{G.t('topics', { n: sec.left.length + sec.right.length })}</div>
            <div className="linked">
              {[...sec.left, ...sec.right].map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-[13px]">
                  <StatusDot s={status[t.id] ?? 'todo'} />
                  <span className="flex-1">{t.t}</span>
                  {t.ch.length > 0 && <span className="text-xs text-au-faint">{G.t('nItems', { n: countNodes(t.ch) })}</span>}
                </div>
              ))}
            </div>
            {own && phase === 'current' && (
              <>
                {!sent && <p className="text-xs text-au-faint">{G.t('sendFirst')}</p>}
                <button className="sx-btn primary self-start" disabled={busy || !complete || !sent} onClick={() => run(() => onMark(sec.id, true))}>
                  <Check className="size-4" /> {G.t('finish')}
                </button>
                {!complete && <p className="text-xs text-au-faint">{G.t('allDone')}</p>}
              </>
            )}
            {own && phase === 'waiting' && !canReview && (
              <button className="sx-btn self-start" disabled={busy} onClick={() => run(() => onMark(sec.id, false))}>
                {G.t('withdraw')}
              </button>
            )}
            {canReview && phase === 'waiting' && (
              <div className="grid gap-2">
                <div className="dr-sec">{G.t('ceoDecision')}</div>
                <textarea className="sx-inp min-h-[70px] py-2" maxLength={500} placeholder={G.t('notePh')} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2">
                  <button className="sx-btn primary flex-1 justify-center" disabled={busy} onClick={() => run(async () => (await onReview(sec.id, true, note.trim())) && setNote(''))}>
                    <Check className="size-4" /> {G.t('approve')}
                  </button>
                  <button
                    className="sx-btn flex-1 justify-center text-au-bad"
                    disabled={busy || !note.trim()}
                    onClick={() => run(async () => (await onReview(sec.id, false, note.trim())) && setNote(''))}
                  >
                    {G.t('return')}
                  </button>
                </div>
              </div>
            )}
            {canUndo && (
              <div className="grid gap-2">
                <div className="dr-sec">{G.t('undo')}</div>
                <textarea className="sx-inp min-h-[56px] py-2" maxLength={500} placeholder={G.t('undoPh')} value={note} onChange={(e) => setNote(e.target.value)} />
                <button
                  className="sx-btn self-start text-au-bad"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      if (!(await ask(G.t('undoQ', { t: sec.t }), { ok: G.t('cancel') }))) return;
                      if (await onUnapprove(sec.id, note.trim())) setNote('');
                    })
                  }
                >
                  {G.t('undo')}
                </button>
              </div>
            )}
            {hist.length > 0 && (
              <>
                <div className="dr-sec">{G.t('history', { n: hist.length })}</div>
                <ul className="grid gap-1.5">
                  {hist.map((e, i) => (
                    <li key={`${e.at}-${i}`} className="text-[13px]">
                      <b className="text-au-ink">{G.log[e.s]}</b>
                      <span className="text-au-faint"> · {names[e.by] ?? '—'} · {fmtAt(e.at)}</span>
                      {e.note && <div className="text-au-muted">{e.note}</div>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          topic && (
            <>
              <p className="text-au-muted">{G.t('topicHint', { t: sec.t })}</p>
              <div className="fld">
                <label>{G.t('status')}</label>
                <Seg value={status[topic.id] ?? 'todo'} options={G.ns} disabled={!canTick} onChange={(s) => onStatus(topic.id, s)} />
                {!canTick && own && <p className="mt-1 text-xs text-au-faint">{phase === 'locked' ? G.t('notOpen') : G.t('finished')}</p>}
              </div>
              <div className="dr-sec">{G.t('items', { n: countNodes(topic.ch) })}</div>
              {topic.ch.length === 0 && <div className="text-[13px] text-au-faint">{G.t('noItems')}</div>}
              <SubTree list={topic.ch} status={status} canTick={canTick} canEdit={canEdit} onStatus={onStatus} onTree={onTree} />
              {canEdit && (
                <div className="flex gap-1.5">
                  <input
                    className="sx-inp h-9 min-w-0 flex-1 text-[13px]"
                    maxLength={120}
                    placeholder={G.t('newItemPh')}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && text.trim()) {
                        const t = text.trim();
                        onTree(topic.id, (x) => ({ ...x, ch: [...x.ch, { id: growthId(), t, ch: [] }] }));
                        setText('');
                      }
                    }}
                  />
                  <button
                    className="sx-btn sm"
                    disabled={!text.trim()}
                    onClick={() => {
                      const t = text.trim();
                      onTree(topic.id, (x) => ({ ...x, ch: [...x.ch, { id: growthId(), t, ch: [] }] }));
                      setText('');
                    }}
                  >
                    <Plus className="size-3.5" /> {G.t('item')}
                  </button>
                </div>
              )}
            </>
          )
        )}
      </div>
    </>
  );
}

const fmtDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
/** ISO instant → "21.11.2026 14:05" in Tashkent. */
const fmtAt = (iso: string) => {
  const t = new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString();
  return `${fmtDay(t.slice(0, 10))} ${t.slice(11, 16)}`;
};

function findIn(n: GrowthNode, id: string): GrowthNode | undefined {
  if (n.id === id) return n;
  for (const c of n.ch) {
    const hit = findIn(c, id);
    if (hit) return hit;
  }
  return undefined;
}

function StatusDot({ s }: { s: NodeStatus }) {
  const c = s === 'done' ? 'bg-au-ok' : s === 'progress' ? 'bg-au-accent' : s === 'skip' ? 'bg-au-faint' : 'bg-au-line';
  return <span className={cn('size-2.5 shrink-0 rounded-full', c)} />;
}

/** Applies `f` to node `id` inside whichever stage/side holds it. */
export function updateRoadmapNode(r: GrowthRoadmap, id: string, f: (n: GrowthNode) => GrowthNode | null): GrowthRoadmap {
  return {
    ...r,
    sections: r.sections.map((s) =>
      s.id === id ? s : { ...s, left: mapNode(s.left, id, f), right: mapNode(s.right, id, f) },
    ),
  };
}

/* =====================================================================
   Editor — Strategy's RoadmapEditor (roadmap-editor.tsx) for a personal
   plan: no cap on topics; approved / waiting stages are read-only.
   ===================================================================== */

type Stage = GrowthStage & { isNew?: boolean };
const SIDES = ['left', 'right'] as const;

export function GrowthRoadmapEditor({
  roadmap,
  phases,
  onClose,
  onSave,
}: {
  roadmap: GrowthRoadmap;
  phases: Record<string, StagePhase>;
  onClose: () => void;
  onSave: (r: GrowthRoadmap) => Promise<boolean>;
}) {
  const G = useGr();
  const fresh = !roadmap.sections.length;
  const [name, setName] = useState(roadmap.name);
  const [subtitle, setSubtitle] = useState(roadmap.subtitle);
  const [stages, setStages] = useState<Stage[]>(() =>
    fresh ? [{ id: growthId(), t: '', q: '', left: [{ id: growthId(), t: '', ch: [] }], right: [], isNew: true }] : roadmap.sections,
  );
  const [busy, setBusy] = useState(false);
  const initial = useRef(JSON.stringify([name, subtitle, stages]));
  /** Closing with unsaved edits asks first (Saqlash keeps them). */
  const close = async () => {
    if (JSON.stringify([name, subtitle, stages]) !== initial.current && !(await ask(G.t('discardQ'), { ok: G.t('cancel') }))) return;
    onClose();
  };

  const patch = (i: number, p: Partial<Stage>) => setStages((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setStages((s) => {
      const n = [...s];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  const setTopic = (i: number, side: 'left' | 'right', j: number, t: string) =>
    patch(i, { [side]: stages[i][side].map((x, k) => (k === j ? { ...x, t } : x)) });

  async function save() {
    const clean = stages
      .map(({ isNew: _isNew, ...s }) => ({
        ...s,
        t: s.t.trim(),
        q: s.q.trim(),
        due: s.due || undefined,
        left: s.left.map((x) => ({ ...x, t: x.t.trim() })).filter((x) => x.t),
        right: s.right.map((x) => ({ ...x, t: x.t.trim() })).filter((x) => x.t),
      }))
      .filter((s) => s.t);
    if (!clean.length) return void toast.error(G.t('needStage'));
    setBusy(true);
    const ok = await onSave({ name: name.trim(), subtitle: subtitle.trim(), sections: clean });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <>
      <div className="dr-h">
        <span className="sx-node-chip">Roadmap</span>
        <span className="text-xs text-au-faint">{fresh ? G.t('newRoadmap') : G.t('editing')}</span>
        <button className="x" onClick={close} aria-label={G.t('close')}>
          <X className="size-4" />
        </button>
      </div>
      <div className="dr-b">
        <input className="sx-inp" autoFocus={fresh} maxLength={80} placeholder={G.t('namePh')} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="sx-inp" maxLength={80} placeholder={G.t('subPh2')} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />

        <div className="dr-sec">{G.t('stages', { n: stages.length })}</div>
        <div className="grid gap-3">
          {stages.map((s, i) => {
            const ph = phases[s.id];
            return (
              <div key={s.id} className="grid gap-2 rounded-au-ctl border border-au-line bg-au-card-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-au-ink text-[11px] font-bold text-au-card">
                    {i + 1}
                  </span>
                  <input className="sx-inp !w-24 shrink-0" maxLength={30} placeholder="2027 · Q1" value={s.q} onChange={(e) => patch(i, { q: e.target.value })} aria-label={G.t('period')} />
                  <input className="sx-inp min-w-0 flex-1 font-semibold" maxLength={120} placeholder={G.t('stageName')} value={s.t} onChange={(e) => patch(i, { t: e.target.value })} />
                  <button className="sx-chipb" disabled={i === 0} onClick={() => move(i, -1)} aria-label={G.t('up')}>
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button className="sx-chipb" disabled={i === stages.length - 1} onClick={() => move(i, 1)} aria-label={G.t('down')}>
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button
                    className="sx-chipb text-au-bad"
                    aria-label={G.t('delStage')}
                    onClick={async () => {
                      const n = countNodes([...s.left, ...s.right]);
                      if (!s.isNew && !(await ask(G.t('delStageQ', { t: s.t || G.t('stage'), x: n ? G.t('andN', { n }) : '' })))) return;
                      setStages((x) => x.filter((_, j) => j !== i));
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <label className="flex items-center gap-2 pl-8 text-[11px] font-semibold text-au-faint">
                  {G.t('due')}
                  <input type="date" className="sx-inp h-8 !w-40 text-[13px]" value={s.due ?? ''} onChange={(e) => patch(i, { due: e.target.value || undefined })} />
                </label>
                {(ph === 'approved' || ph === 'waiting') && (
                  <span className="pl-8 text-[11px] text-au-faint">
                    {G.t('reReview', { s: ph === 'approved' ? G.ph.approved : G.t('inReview') })}
                  </span>
                )}
                <div className="grid gap-2 pl-8">
                  {SIDES.map((side) => (
                    <div key={side} className="grid content-start gap-1.5">
                      <span className="text-[11px] font-semibold text-au-faint">{G.t('side', { s: G.t(side) })}</span>
                      {s[side].map((x, j) => (
                        <div key={x.id} className="flex items-center gap-1">
                          <input className="sx-inp h-8 min-w-0 flex-1 text-[13px]" maxLength={120} placeholder={G.t('topicPh')} value={x.t} onChange={(e) => setTopic(i, side, j, e.target.value)} />
                          {x.ch.length > 0 && <span className="shrink-0 text-[11px] text-au-faint">{G.t('nItems', { n: countNodes(x.ch) })}</span>}
                          <button className="sx-chipb" aria-label={G.t('delTopic')} onClick={() => patch(i, { [side]: s[side].filter((_, k) => k !== j) })}>
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                      <button className="sx-btn sm justify-self-start text-au-muted" onClick={() => patch(i, { [side]: [...s[side], { id: growthId(), t: '', ch: [] }] })}>
                        <Plus className="size-3" /> {G.t('topic')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <button
            className="sx-btn justify-self-start"
            onClick={() => setStages((x) => [...x, { id: growthId(), t: '', q: '', left: [{ id: growthId(), t: '', ch: [] }], right: [], isNew: true }])}
          >
            <Plus className="size-4" /> {G.t('addStage')}
          </button>
        </div>
      </div>
      <div className="dr-f">
        <button className="sx-btn primary flex-1 justify-center" disabled={busy} onClick={save}>
          {fresh ? G.t('createBtn') : G.t('save')}
        </button>
      </div>
    </>
  );
}
