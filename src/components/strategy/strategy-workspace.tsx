'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  CalendarRange,
  Columns3,
  GitBranch,
  LayoutDashboard,
  List,
  Plus,
  Route,
  Search,
  Clock,
  X,
  Wallet,
  LineChart,
  Settings2,
} from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  addDays,
  isLate,
  progressForStatus,
  type StrategyMilestone,
  type StrategyMind,
  type StrategyPerson,
  type StrategyRoadmap,
  type StrategySpace,
  type StrategyTask,
  type TaskStatus,
  type NodeStatus,
} from '@/lib/strategy';
import {
  addStrategyMilestoneAction,
  createStrategySpaceAction,
  deleteStrategyMilestoneAction,
  deleteStrategySpaceAction,
  deleteStrategyTaskAction,
  saveStrategyBudgetAction,
  updateStrategySpaceAction,
  saveStrategyMindAction,
  saveStrategyTaskAction,
  setRoadmapNodeStatusAction,
} from '@/lib/actions/strategy';
import { PersonAvatar } from './bits';
import { DashboardView } from './view-dashboard';
import { RoadmapView } from './view-roadmap';
import { MindView } from './view-mind';
import { BoardView } from './view-board';
import { ListView } from './view-list';
import { GanttView } from './view-gantt';
import { TaskDrawer, NodeDrawer, SpaceDrawer, type SpaceInput } from './drawers';
import { FinanceView, AnalyticsView, type BooksLite } from './view-finance';
import { SuiteShell, playSound, toast, type PaletteItem } from './suite-shell';
import './strategy.css';
import './suite.css';

export type ViewKey = 'dash' | 'roadmap' | 'mind' | 'board' | 'list' | 'gantt' | 'fin' | 'analytics';

const TABS: { v: ViewKey; n: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { v: 'dash', n: 'Dashboard', Icon: LayoutDashboard },
  { v: 'roadmap', n: 'Roadmap', Icon: Route },
  { v: 'mind', n: 'Mind map', Icon: GitBranch },
  { v: 'board', n: 'Board', Icon: Columns3 },
  { v: 'list', n: 'List', Icon: List },
  { v: 'gantt', n: 'Gantt', Icon: CalendarRange },
  { v: 'fin', n: 'Moliya', Icon: Wallet },
  { v: 'analytics', n: 'Tahlil', Icon: LineChart },
];
const FLOW: { go: ViewKey; n: string; steps: ViewKey[] }[] = [
  { go: 'mind', n: "G'oya · Mind map", steps: ['mind'] },
  { go: 'roadmap', n: 'Reja · Roadmap / Moliya', steps: ['roadmap', 'fin'] },
  { go: 'board', n: 'Ijro · Board / List / Gantt', steps: ['board', 'list', 'gantt'] },
  { go: 'dash', n: 'Natija · Dashboard / Tahlil', steps: ['dash', 'analytics'] },
];
const VIEW_KEY = 'persons-strategy-view';

export type Draft = Partial<StrategyTask> & { title: string };
export type DrawerState =
  | { kind: 'task'; id: string | null; preset?: Partial<StrategyTask> }
  | { kind: 'node'; roadmapId: string; nodeId: string }
  | { kind: 'space'; edit?: boolean }
  | null;

export type WorkspaceApi = {
  today: string;
  people: StrategyPerson[];
  personById: Map<string, StrategyPerson>;
  openTask: (id: string | null, preset?: Partial<StrategyTask>) => void;
  moveTask: (id: string, status: TaskStatus) => void;
  patchTask: (id: string, patch: Partial<StrategyTask>) => void;
};

function errorText(code: string) {
  if (code === 'forbidden') return "Ruxsat yo'q";
  if (code === 'sessionExpired') return 'Sessiya tugadi — qayta kiring';
  if (code === 'invalidInput') return "Ma'lumot noto'g'ri";
  if (code === 'notFound') return 'Topilmadi — sahifani yangilang';
  return 'Saqlab bo‘lmadi, qayta urinib ko‘ring';
}

export function StrategyWorkspace({
  spaces,
  space,
  tasks: initialTasks,
  milestones,
  roadmaps: initialRoadmaps,
  people,
  today,
  books,
}: {
  spaces: { id: string; name: string; color: string }[];
  space: StrategySpace | null;
  tasks: StrategyTask[];
  milestones: StrategyMilestone[];
  roadmaps: StrategyRoadmap[];
  people: StrategyPerson[];
  today: string;
  books: BooksLite;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tasks, setTasks] = useState(initialTasks);
  const [roadmaps, setRoadmaps] = useState(initialRoadmaps);
  const [mind, setMind] = useState<StrategyMind>(space?.mind ?? { t: '', ch: [] });
  const [ms, setMs] = useState(milestones);
  const [view, setView] = useState<ViewKey>('dash');
  const [q, setQ] = useState('');
  const [lateOnly, setLateOnly] = useState(false);
  const [who, setWho] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [inkStyle, setInkStyle] = useState<React.CSSProperties>({});
  const tabsRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

  // Remember the last tab (per browser). Mount-only.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const v = localStorage.getItem(VIEW_KEY) as ViewKey | null;
      if (v && TABS.some((t) => t.v === v)) setView(v);
    } catch {}
  }, []);

  const go = useCallback((v: ViewKey) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }, []);

  // Sliding ink under the active tab.
  useEffect(() => {
    const on = tabsRef.current?.querySelector<HTMLButtonElement>(`button[data-v="${view}"]`);
    if (on) setInkStyle({ transform: `translateX(${on.offsetLeft}px)`, width: on.offsetWidth });
  }, [view]);

  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const involved = useMemo(() => {
    const ids = new Set(tasks.map((t) => t.assignee_id).filter(Boolean) as string[]);
    return people.filter((p) => ids.has(p.id));
  }, [tasks, people]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (!needle || t.title.toLowerCase().includes(needle)) &&
        (!lateOnly || isLate(t, today)) &&
        (!who.length || (t.assignee_id && who.includes(t.assignee_id))),
    );
  }, [tasks, q, lateOnly, who, today]);

  /** Optimistic save; rolls the row back if the server refuses. */
  const commit = useCallback(
    (next: StrategyTask, prev: StrategyTask | undefined, okMsg?: string) => {
      setTasks((list) => list.map((t) => (t.id === next.id ? next : t)));
      startTransition(async () => {
        const res = await saveStrategyTaskAction({
          id: next.id,
          spaceId: next.space_id,
          title: next.title,
          description: next.description,
          workstream: next.workstream,
          assigneeId: next.assignee_id,
          startDate: next.start_date,
          endDate: next.end_date,
          status: next.status,
          priority: next.priority,
          progress: next.progress,
        });
        if (res.error !== undefined) {
          if (prev) setTasks((list) => list.map((t) => (t.id === prev.id ? prev : t)));
          toast.error(errorText(res.error));
        } else {
          setTasks((list) => list.map((t) => (t.id === res.task.id ? res.task : t)));
          if (okMsg) toast.success(okMsg);
        }
      });
    },
    [],
  );

  const patchTask = useCallback(
    (id: string, patch: Partial<StrategyTask>) => {
      const prev = tasks.find((t) => t.id === id);
      if (!prev) return;
      commit({ ...prev, ...patch }, prev);
    },
    [tasks, commit],
  );

  const moveTask = useCallback(
    (id: string, status: TaskStatus) => {
      const prev = tasks.find((t) => t.id === id);
      if (!prev || prev.status === status) return;
      const progress = progressForStatus(prev, status);
      commit({ ...prev, status, progress }, prev, `«${prev.title}» → ${statusName(status)}`);
    },
    [tasks, commit],
  );

  const openTask = useCallback((id: string | null, preset?: Partial<StrategyTask>) => {
    playSound('open');
    setDrawer({ kind: 'task', id, preset });
  }, []);

  async function createTask(draft: Draft, link?: { roadmapId: string; nodeId: string }) {
    if (!space) return false;
    const res = await saveStrategyTaskAction({
      spaceId: space.id,
      title: draft.title,
      description: draft.description ?? '',
      workstream: draft.workstream ?? 'aka',
      assigneeId: draft.assignee_id ?? null,
      startDate: draft.start_date ?? today,
      endDate: draft.end_date ?? addDays(today, 7),
      status: draft.status ?? 'todo',
      priority: draft.priority ?? 'med',
      progress: draft.progress ?? 0,
      roadmapId: link?.roadmapId ?? draft.roadmap_id ?? null,
      roadmapNode: link?.nodeId ?? draft.roadmap_node ?? null,
    });
    if (res.error !== undefined) {
      toast.error(errorText(res.error));
      return false;
    }
    setTasks((list) => [...list, res.task]);
    toast.success('Vazifa yaratildi');
    return true;
  }

  async function deleteTask(id: string) {
    const removed = tasks.find((t) => t.id === id);
    setTasks((list) => list.filter((t) => t.id !== id));
    setDrawer(null);
    const res = await deleteStrategyTaskAction(id);
    if (res.error !== undefined) {
      // Put back only this task — restoring the whole old list would also
      // undo any edit that landed while the delete was in flight.
      if (removed) setTasks((list) => (list.some((t) => t.id === id) ? list : [...list, removed]));
      toast.error(errorText(res.error));
    } else toast.success("Vazifa o'chirildi");
  }

  function setNodeStatus(roadmapId: string, nodeId: string, status: NodeStatus) {
    const before = roadmaps.find((r) => r.id === roadmapId)?.node_status[nodeId];
    setRoadmaps((list) =>
      list.map((r) => (r.id === roadmapId ? { ...r, node_status: { ...r.node_status, [nodeId]: status } } : r)),
    );
    startTransition(async () => {
      const res = await setRoadmapNodeStatusAction({ roadmapId, nodeId, status });
      if (res.error !== undefined) {
        // Roll back just this node (the server writes one key via jsonb_set);
        // restoring the whole snapshot undid other nodes toggled meanwhile.
        setRoadmaps((list) =>
          list.map((r) => {
            if (r.id !== roadmapId) return r;
            const ns = { ...r.node_status };
            if (before === undefined) delete ns[nodeId];
            else ns[nodeId] = before;
            return { ...r, node_status: ns };
          }),
        );
        toast.error(errorText(res.error));
      }
    });
  }

  const mindTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function updateMind(next: StrategyMind) {
    setMind(next);
    if (!space) return;
    if (mindTimer.current) clearTimeout(mindTimer.current);
    const spaceId = space.id;
    mindTimer.current = setTimeout(async () => {
      const res = await saveStrategyMindAction(spaceId, next);
      if (res.error !== undefined) toast.error(errorText(res.error));
    }, 500);
  }

  async function updateSpace(input: SpaceInput) {
    if (!space) return false;
    const res = await updateStrategySpaceAction({ id: space.id, ...input });
    if (res.error !== undefined) {
      toast.error(errorText(res.error));
      return false;
    }
    toast.success('Maydon saqlandi');
    router.refresh();
    return true;
  }

  async function removeSpace() {
    if (!space) return;
    const res = await deleteStrategySpaceAction(space.id);
    if (res.error !== undefined) return void toast.error(errorText(res.error));
    setDrawer(null);
    toast.success(`«${space.name}» maydoni o'chirildi`);
    router.push('/strategy');
    router.refresh();
  }

  async function saveBudget(budget: StrategySpace['budget']) {
    if (!space) return false;
    const res = await saveStrategyBudgetAction(space.id, budget);
    if (res.error !== undefined) {
      toast.error(errorText(res.error));
      return false;
    }
    toast.success('Budjet saqlandi');
    router.refresh();
    return true;
  }

  async function addMilestone(title: string, date: string) {
    if (!space) return false;
    const res = await addStrategyMilestoneAction({ spaceId: space.id, title, date });
    if (res.error !== undefined) {
      toast.error(errorText(res.error));
      return false;
    }
    setMs((list) => [...list, res.milestone].sort((a, b) => a.date.localeCompare(b.date)));
    toast.success('Muhim sana qo‘shildi');
    return true;
  }

  async function removeMilestone(id: string) {
    const removed = ms.find((m) => m.id === id);
    setMs((list) => list.filter((m) => m.id !== id));
    const res = await deleteStrategyMilestoneAction(id);
    if (res.error !== undefined) {
      if (removed) setMs((list) => (list.some((m) => m.id === id) ? list : [...list, removed].sort((a, b) => a.date.localeCompare(b.date))));
      toast.error(errorText(res.error));
    } else toast.success("Muhim sana o'chirildi");
  }

  async function createSpace(input: SpaceInput) {
    const res = await createStrategySpaceAction(input);
    if (res.error !== undefined) {
      toast.error(errorText(res.error));
      return false;
    }
    setDrawer(null);
    toast.success(`«${input.name}» maydoni yaratildi`);
    router.push(`/strategy?space=${res.id}`);
    return true;
  }

  const api: WorkspaceApi = { today, people, personById, openTask, moveTask, patchTask };
  const drawerTask = drawer?.kind === 'task' && drawer.id ? tasks.find((t) => t.id === drawer.id) : undefined;
  const lateCount = tasks.filter((t) => isLate(t, today)).length;
  const fullBleed = view === 'mind' || view === 'gantt';

  const items: PaletteItem[] = [
    ...(space
      ? [
          { g: 'Amallar', t: 'Yangi vazifa yaratish', k: 'N', run: () => openTask(null) },
          { g: 'Amallar', t: lateOnly ? "Muddati o'tgan filtrini o'chirish" : "Muddati o'tgan vazifalar", run: () => setLateOnly((v) => !v) },
          { g: 'Amallar', t: 'Yangi maydon yaratish', run: () => setDrawer({ kind: 'space' }) },
          { g: 'Amallar', t: 'Maydon sozlamalari (nom, budjet, muhim sanalar)', run: () => setDrawer({ kind: 'space', edit: true }) },
        ]
      : []),
    ...spaces.map((sp) => ({ g: 'Maydonlar', t: sp.name, run: () => router.push(`/strategy?space=${sp.id}`) })),
    ...tasks.map((t) => ({ g: 'Vazifalar', t: t.title, sub: statusName(t.status), run: () => openTask(t.id) })),
  ];
  const closeDrawer = () => {
    if (drawer) playSound('close');
    setDrawer(null);
  };

  return (
    <SuiteShell section="str" tabs={space ? TABS : []} onTab={(v) => go(v as ViewKey)} items={items} onNew={space ? () => openTask(null) : undefined}>
    <div className="sx-root flex min-h-0 flex-1 flex-col">
      <header className="sx-head px-4 pt-1 sm:px-7">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-au-muted">Strategiya</div>
            <h1 className="sx-title">
              {space ? (
                <>
                  {space.name.replace(/\s*\d{4}$/, '')}{' '}
                  {/\d{4}$/.test(space.name) && <em>{space.name.match(/\d{4}$/)![0]}</em>}
                </>
              ) : (
                'Strategiya'
              )}
            </h1>
          </div>
          {space && (
            <span className={cn('sx-pill', lateCount ? 'bad' : 'ok')}>
              <i />
              {lateCount ? `${lateCount} ta vazifa kechikmoqda` : 'Rejada boryapti'}
            </span>
          )}
          <div className="flex-1" />
          <div className="sx-spaces" role="tablist" aria-label="Maydonlar">
            {spaces.map((s) => (
              <button
                key={s.id}
                className={cn(s.id === space?.id && 'on')}
                onClick={() => s.id !== space?.id && router.push(`/strategy?space=${s.id}`)}
              >
                <i style={{ background: s.color }} />
                {s.name}
              </button>
            ))}
            <button className="add" onClick={() => setDrawer({ kind: 'space' })} title="Yangi maydon">
              <Plus className="size-3.5" />
            </button>
          </div>
          {space && (
            <button className="sx-btn" onClick={() => setDrawer({ kind: 'space', edit: true })} title="Nom, budjet, muhim sanalar, o‘chirish">
              <Settings2 className="size-4" />
              Sozlamalar
            </button>
          )}
          {space && (
            <button className="sx-btn primary" onClick={() => openTask(null)}>
              <Plus className="size-4" />
              Yangi vazifa
            </button>
          )}
        </div>

        {space && (
          <>
            <div className="sx-flow" aria-label="Ish oqimi">
              {FLOW.map((f, i) => (
                <span key={f.go} className="contents">
                  {i > 0 && <span className="ar">→</span>}
                  <button
                    className={cn(f.steps.includes(view) && 'on', FLOW.findIndex((x) => x.steps.includes(view)) > i && 'past')}
                    onClick={() => go(f.go)}
                  >
                    <b>{i + 1}</b>
                    {f.n}
                  </button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 pb-3">
              <div className="sx-tabs" ref={tabsRef}>
                <span className="ink" style={inkStyle} aria-hidden />
                {TABS.map(({ v, n, Icon }) => (
                  <button key={v} data-v={v} className={cn(view === v && 'on')} onClick={() => go(v)}>
                    <Icon className="size-4" />
                    <span>{n}</span>
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <label className="sx-search">
                <Search className="size-4" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vazifa qidirish…" />
                {q && (
                  <button onClick={() => setQ('')} aria-label="Tozalash">
                    <X className="size-3.5" />
                  </button>
                )}
              </label>
              <button className={cn('sx-fchip', lateOnly && 'on')} onClick={() => setLateOnly((v) => !v)}>
                <Clock className="size-3.5" />
                Muddati o‘tgan
              </button>
              {involved.length > 0 && (
                <div className="sx-people">
                  {involved.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      className={cn((!who.length || who.includes(p.id)) && 'on')}
                      onClick={() => setWho((w) => (w.includes(p.id) ? w.filter((x) => x !== p.id) : [...w, p.id]))}
                    >
                      <PersonAvatar person={p} size={30} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </header>

      {!space ? (
        <div className="px-4 sm:px-7">
          <div className="sx-card flex flex-col items-center gap-3 p-10 text-center">
            <h2 className="text-lg font-bold text-au-ink">Hali strategiya maydoni yo‘q</h2>
            <p className="text-au-muted">Birinchi maydonni yarating — vazifalar, roadmap va mind map shu yerda yashaydi.</p>
            <button className="sx-btn primary" onClick={() => setDrawer({ kind: 'space' })}>
              <Plus className="size-4" /> Maydon yaratish
            </button>
          </div>
        </div>
      ) : (
        <section className={cn('sx-view', fullBleed ? 'canvas' : 'px-4 pb-8 sm:px-7')}>
          <div key={view} className="sx-fade h-full">
            {view === 'dash' && (
              <DashboardView api={api} space={space} tasks={visible} all={tasks} onGantt={() => go('gantt')} onEditSpace={() => setDrawer({ kind: 'space', edit: true })} />
            )}
            {view === 'roadmap' && (
              <RoadmapView
                roadmaps={roadmaps}
                tasks={tasks}
                selected={drawer?.kind === 'node' ? drawer.nodeId : null}
                onNode={(roadmapId, nodeId) => setDrawer({ kind: 'node', roadmapId, nodeId })}
              />
            )}
            {view === 'mind' && <MindView api={api} mind={mind} onChange={updateMind} />}
            {view === 'board' && <BoardView api={api} tasks={visible} onQuickAdd={(title, status) => createTask({ title, status })} />}
            {view === 'list' && <ListView api={api} tasks={visible} />}
            {view === 'gantt' && <GanttView api={api} space={space} tasks={visible} milestones={ms} onMilestones={() => setDrawer({ kind: 'space', edit: true })} />}
            {view === 'fin' && <FinanceView books={books} today={today} />}
            {view === 'analytics' && <AnalyticsView books={books} today={today} />}
          </div>
        </section>
      )}

      <div className={cn('sx-scrim', drawer && 'open')} onClick={closeDrawer} />
      <aside className={cn('sx-drawer', drawer && 'open')} aria-label="Tafsilotlar">
        {drawer?.kind === 'task' && (
          <TaskDrawer
            key={drawer.id ?? 'new'}
            api={api}
            task={drawerTask}
            preset={drawer.preset}
            roadmaps={roadmaps}
            onClose={closeDrawer}
            onCreate={async (d) => (await createTask(d)) && setDrawer(null)}
            onSave={(next) => {
              if (drawerTask) commit(next, drawerTask, 'Saqlandi');
              setDrawer(null);
            }}
            onDelete={deleteTask}
          />
        )}
        {drawer?.kind === 'node' && (
          <NodeDrawer
            key={drawer.roadmapId + drawer.nodeId}
            api={api}
            roadmap={roadmaps.find((r) => r.id === drawer.roadmapId)!}
            nodeId={drawer.nodeId}
            tasks={tasks.filter((t) => t.roadmap_id === drawer.roadmapId && t.roadmap_node === drawer.nodeId)}
            onClose={closeDrawer}
            onStatus={(s) => setNodeStatus(drawer.roadmapId, drawer.nodeId, s)}
            onMakeTask={async (title, ws) => {
              const r = roadmaps.find((x) => x.id === drawer.roadmapId)!;
              const ok = await createTask({ title, workstream: ws }, { roadmapId: drawer.roadmapId, nodeId: drawer.nodeId });
              if (ok && (r.node_status[drawer.nodeId] ?? 'todo') === 'todo')
                setNodeStatus(drawer.roadmapId, drawer.nodeId, 'progress');
            }}
          />
        )}
        {drawer?.kind === 'space' && (
          <SpaceDrawer
            key={drawer.edit && space ? `edit-${space.id}` : 'new'}
            today={today}
            space={drawer.edit && space ? space : undefined}
            taskCount={tasks.length}
            milestones={ms}
            onClose={closeDrawer}
            onCreate={drawer.edit ? updateSpace : createSpace}
            onBudget={saveBudget}
            onAddMilestone={addMilestone}
            onDeleteMilestone={removeMilestone}
            onDeleteSpace={removeSpace}
          />
        )}
      </aside>
    </div>
    </SuiteShell>
  );
}

function statusName(s: TaskStatus) {
  return { todo: 'Rejada', progress: 'Jarayonda', review: 'Tekshiruvda', done: 'Bajarildi' }[s];
}
