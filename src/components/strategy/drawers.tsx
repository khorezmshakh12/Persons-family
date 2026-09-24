'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  NODE_STATUSES,
  PRIORITIES,
  STATUSES,
  WORKSTREAMS,
  addDays,
  guessWorkstream,
  roadmapNodeName,
  type NodeStatus,
  type Priority,
  type StrategyRoadmap,
  type StrategyTask,
  type TaskStatus,
  type Workstream,
} from '@/lib/strategy';
import { PersonAvatar, StatusChip } from './bits';
import type { Draft, WorkspaceApi } from './strategy-workspace';

function Seg<K extends string>({ value, options, onChange }: { value: K; options: [K, string][]; onChange: (k: K) => void }) {
  return (
    <div className="sx-seg">
      {options.map(([k, n]) => (
        <button key={k} type="button" className={cn(value === k && 'on')} onClick={() => onChange(k)}>
          {n}
        </button>
      ))}
    </div>
  );
}

function Head({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="dr-h">
      {children}
      <button className="x" onClick={onClose} aria-label="Yopish">
        <X className="size-4" />
      </button>
    </div>
  );
}

export function TaskDrawer({
  api,
  task,
  preset,
  roadmaps,
  onClose,
  onCreate,
  onSave,
  onDelete,
}: {
  api: WorkspaceApi;
  task: StrategyTask | undefined;
  preset?: Partial<StrategyTask>;
  roadmaps: StrategyRoadmap[];
  onClose: () => void;
  onCreate: (d: Draft) => Promise<unknown>;
  onSave: (t: StrategyTask) => void;
  onDelete: (id: string) => void;
}) {
  const isNew = !task;
  const [d, setD] = useState<Draft>(() => ({
    title: '',
    description: '',
    workstream: 'aka',
    assignee_id: null,
    start_date: api.today,
    end_date: addDays(api.today, 7),
    status: 'todo',
    priority: 'med',
    progress: 0,
    ...preset,
    ...task,
  }));
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const rm = d.roadmap_id ? roadmaps.find((r) => r.id === d.roadmap_id) : undefined;
  const nodeName = rm && d.roadmap_node ? roadmapNodeName(rm, d.roadmap_node) : null;

  async function submit() {
    if (!d.title.trim()) return;
    if (isNew) {
      setBusy(true);
      await onCreate({ ...d, title: d.title.trim() });
      setBusy(false);
    } else onSave({ ...task!, ...d, title: d.title.trim() } as StrategyTask);
  }

  return (
    <>
      <Head onClose={onClose}>
        <StatusChip status={d.status as TaskStatus} />
        <span className="text-xs text-au-faint">{isNew ? 'Yangi vazifa' : WORKSTREAMS[d.workstream as Workstream].n}</span>
      </Head>
      <div className="dr-b">
        <textarea
          className="ttl"
          rows={2}
          autoFocus={isNew}
          value={d.title}
          maxLength={300}
          placeholder="Vazifa nomi"
          onChange={(e) => set({ title: e.target.value })}
        />
        <div className="fld">
          <label>Holat</label>
          <Seg
            value={d.status as TaskStatus}
            options={(Object.keys(STATUSES) as TaskStatus[]).map((k) => [k, STATUSES[k].n])}
            onChange={(status) => set({ status, progress: status === 'done' ? 100 : d.progress })}
          />
        </div>
        <div className="fld">
          <label>Ustuvorlik</label>
          <Seg
            value={d.priority as Priority}
            options={(Object.keys(PRIORITIES) as Priority[]).map((k) => [k, PRIORITIES[k].n])}
            onChange={(priority) => set({ priority })}
          />
        </div>
        <div className="fld">
          <label>Mas&apos;ul</label>
          <div className="flex items-center gap-2">
            <PersonAvatar person={d.assignee_id ? api.personById.get(d.assignee_id) : undefined} size={28} />
            <select
              className="sx-inp flex-1"
              value={d.assignee_id ?? ''}
              onChange={(e) => set({ assignee_id: e.target.value || null })}
            >
              <option value="">— Tayinlanmagan —</option>
              {api.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="fld">
          <label>Yo&apos;nalish</label>
          <select
            className="sx-inp"
            value={d.workstream}
            onChange={(e) => set({ workstream: e.target.value as Workstream })}
          >
            {(Object.keys(WORKSTREAMS) as Workstream[]).map((k) => (
              <option key={k} value={k}>
                {WORKSTREAMS[k].n}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label>Boshlanish</label>
          <input
            type="date"
            className="sx-inp"
            value={d.start_date}
            onChange={(e) =>
              e.target.value &&
              set({ start_date: e.target.value, end_date: d.end_date! < e.target.value ? e.target.value : d.end_date })
            }
          />
        </div>
        <div className="fld">
          <label>Tugash</label>
          <input
            type="date"
            className="sx-inp"
            value={d.end_date}
            min={d.start_date}
            onChange={(e) => e.target.value && set({ end_date: e.target.value < d.start_date! ? d.start_date : e.target.value })}
          />
        </div>
        <div className="fld">
          <label>Progress</label>
          <div className="flex items-center gap-2.5">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={d.progress}
              className="flex-1 accent-[var(--au-accent)]"
              onChange={(e) => set({ progress: Number(e.target.value) })}
            />
            <b className="w-10 tabular-nums">{d.progress}%</b>
          </div>
        </div>
        {nodeName && (
          <div className="fld">
            <label>Roadmap</label>
            <span className="sx-node-chip justify-self-start">{nodeName}</span>
          </div>
        )}
        <div className="dr-sec">Tavsif</div>
        <textarea
          className="sx-inp min-h-[110px]"
          value={d.description}
          maxLength={5000}
          placeholder="Tafsilotlar, havolalar, izohlar…"
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      <div className="dr-f">
        <button className="sx-btn primary flex-1 justify-center" disabled={busy || !d.title.trim()} onClick={submit}>
          {isNew ? 'Yaratish' : 'Saqlash'}
        </button>
        {!isNew &&
          (confirmDel ? (
            <button className="sx-btn danger" onClick={() => onDelete(task!.id)}>
              Rostdan o‘chirilsinmi?
            </button>
          ) : (
            <button className="sx-btn text-au-bad" onClick={() => setConfirmDel(true)}>
              O‘chirish
            </button>
          ))}
      </div>
    </>
  );
}

export function NodeDrawer({
  api,
  roadmap,
  nodeId,
  tasks,
  onClose,
  onStatus,
  onMakeTask,
}: {
  api: WorkspaceApi;
  roadmap: StrategyRoadmap;
  nodeId: string;
  tasks: StrategyTask[];
  onClose: () => void;
  onStatus: (s: NodeStatus) => void;
  onMakeTask: (title: string, ws: Workstream) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const sec = roadmap.sections.find((s) => nodeId === s.id || nodeId.startsWith(`${s.id}-`));
  const main = sec?.id === nodeId;
  const name = roadmapNodeName(roadmap, nodeId) ?? nodeId;
  const st = roadmap.node_status[nodeId] ?? 'todo';
  return (
    <>
      <Head onClose={onClose}>
        <span className="sx-node-chip">{main ? 'Bosqich' : 'Mavzu'}</span>
        <span className="text-xs text-au-faint">
          {roadmap.name} · {sec?.t}
        </span>
      </Head>
      <div className="dr-b">
        <div className="ttl">{name}</div>
        <p className="text-au-muted">
          {main
            ? `${sec?.q} davridagi asosiy bosqich. Undagi mavzular tugallangach, bosqich yopiladi.`
            : `«${sec?.t}» bosqichidagi tashabbus. Uni bajarish uchun vazifa yarating — u Board, List va Gantt'da avtomatik paydo bo‘ladi.`}
        </p>
        <div className="fld">
          <label>Holat</label>
          <Seg value={st} options={NODE_STATUSES} onChange={onStatus} />
        </div>
        <div className="dr-sec">Bog‘langan vazifalar · {tasks.length}</div>
        <div className="linked">
          {tasks.length === 0 && <div className="text-[13px] text-au-faint">Hali vazifa yo‘q</div>}
          {tasks.map((t) => (
            <button key={t.id} onClick={() => api.openTask(t.id)}>
              <StatusChip status={t.status} />
              <span className="flex-1 text-left">{t.title}</span>
              <PersonAvatar person={t.assignee_id ? api.personById.get(t.assignee_id) : undefined} size={24} />
            </button>
          ))}
        </div>
        <button
          className="sx-btn self-start"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onMakeTask(name, guessWorkstream(name));
            setBusy(false);
          }}
        >
          <Plus className="size-4" />
          Shu mavzudan vazifa yaratish
        </button>
      </div>
    </>
  );
}

const SPACE_COLORS = ['#ff9f1c', '#2477c9', '#e8567a', '#7a5af8', '#139a52', '#0ea5a4'];

export function SpaceDrawer({
  today,
  onClose,
  onCreate,
}: {
  today: string;
  onClose: () => void;
  onCreate: (v: { name: string; subtitle: string; color: string; startDate: string; endDate: string }) => Promise<boolean>;
}) {
  const [v, setV] = useState({ name: '', subtitle: '', color: SPACE_COLORS[1], startDate: today, endDate: addDays(today, 90) });
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Head onClose={onClose}>
        <span className="text-sm font-bold text-au-ink">Yangi maydon</span>
      </Head>
      <div className="dr-b">
        <p className="text-sm text-au-muted">
          Maydon — alohida loyiha yoki yo‘nalish (masalan, Tech Lab, Pekin School). O‘z vazifalari, mind map va muhim sanalari bo‘ladi.
        </p>
        <div className="fld">
          <label>Nomi</label>
          <input className="sx-inp" autoFocus maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </div>
        <div className="fld">
          <label>Tavsif</label>
          <input className="sx-inp" maxLength={200} value={v.subtitle} onChange={(e) => setV({ ...v, subtitle: e.target.value })} />
        </div>
        <div className="fld">
          <label>Rang</label>
          <div className="flex gap-2">
            {SPACE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setV({ ...v, color: c })}
                className={cn('size-7 rounded-full transition-transform', v.color === c && 'scale-110 ring-2 ring-au-ink ring-offset-2')}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div className="fld">
          <label>Boshlanish</label>
          <input type="date" className="sx-inp" value={v.startDate} onChange={(e) => e.target.value && setV({ ...v, startDate: e.target.value })} />
        </div>
        <div className="fld">
          <label>Tugash</label>
          <input
            type="date"
            className="sx-inp"
            min={v.startDate}
            value={v.endDate}
            onChange={(e) => e.target.value && setV({ ...v, endDate: e.target.value })}
          />
        </div>
      </div>
      <div className="dr-f">
        <button
          className="sx-btn primary flex-1 justify-center"
          disabled={busy || !v.name.trim() || v.endDate < v.startDate}
          onClick={async () => {
            setBusy(true);
            await onCreate({ ...v, name: v.name.trim() });
            setBusy(false);
          }}
        >
          Yaratish
        </button>
      </div>
    </>
  );
}
