import 'server-only';
import { sql } from '@/lib/db/client';
import { askTypeSafe } from '@/lib/typesafe';
import { addDaysToKey, tashkentDayKey, tashkentMonthKey } from '@/lib/time';
import type { Profile } from '@/lib/auth/session';

// Bridge between the Core v2 page (src/core/core.html, run unmodified) and
// the real site. Core keeps all of its data in one object `S`; here we:
//  - build `S.staff` from real profiles (+ Core-only metadata),
//  - build `S.tasks` from the real `tasks` table (the site's own task rules,
//    stars and approvals still apply — writes go through the task actions),
//  - persist the rest (leads, KPI, HR, settings, ACL…) in core_state.

export type CoreStaff = {
  n: string;
  r: string;
  d: 'top' | 'acad' | 'ops' | 'com' | 'fin' | 'hr';
  c: string;
  hired: string;
  sal: number;
  boss: string | null;
  ph: string;
  em: string;
  active: 0 | 1;
  top?: 1;
  sales?: 1;
};
type StaffMeta = Partial<Pick<CoreStaff, 'r' | 'd' | 'boss' | 'sales'>> & { ai?: 1 };

/** Keys of S that are per-viewer UI state — never shared or stored. */
export const UI_KEYS = new Set(['me', 'view', 'month', 'hrTab', 'hrSel', 'sf', 'sc', 'sTab', 'tTab', 'iTab', 'stTab']);
/** Keys the bridge maps to real tables instead of core_state. */
const REAL_KEYS = new Set(['staff', 'tasks']);

const ROLE_TITLE: Record<string, string> = {
  ceo: 'CEO',
  admin_manager: "Ma'muriy menejer",
  teacher: "O'qituvchi",
  head_teacher: "Bosh o'qituvchi",
  assistant: "O'qituvchi yordamchisi",
  mmd: 'MMD (media)',
  internship: 'Amaliyotchi',
  it_developer: 'IT dasturchi',
  project_manager: 'Loyiha menejeri (PM)',
};
const ROLE_DEPT: Record<string, CoreStaff['d']> = {
  ceo: 'top',
  admin_manager: 'ops',
  teacher: 'acad',
  head_teacher: 'acad',
  assistant: 'acad',
  mmd: 'com',
  internship: 'acad',
  it_developer: 'ops',
  project_manager: 'ops',
};
const PAL = [
  ['#ffb547', '#ff7a45'], ['#6fb6ff', '#2477c9'], ['#ff8fb1', '#d63d66'], ['#5fd6a0', '#139a52'],
  ['#c9b8ff', '#7a5af8'], ['#6fe0df', '#0ea5a4'], ['#ffd28a', '#f0a030'], ['#9d8cff', '#6a4cf0'],
];
const grad = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const [a, b] = PAL[Math.abs(h) % PAL.length];
  return `linear-gradient(135deg,${a},${b})`;
};

type ProfileRow = {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  monthly_salary: number | null;
};

async function readShared(): Promise<Record<string, unknown>> {
  const [row] = await sql<{ data: Record<string, unknown> }[]>`select data from core_state where id = 1`;
  return row?.data ?? {};
}

/** Core shows a person's key inside their avatar (the prototype used
 * initials like "AQ"), so every profile gets a short, stable key — initials,
 * plus a digit when taken — persisted in data.keys (uuid → key) and never
 * reused, because KPI/bonus/ACL entries are stored under it. */
function keyMap(rows: ProfileRow[], saved: Record<string, string>) {
  const byId: Record<string, string> = { ...saved };
  const used = new Set(Object.values(byId));
  let changed = false;
  const latin = (s: string) => (s.normalize('NFKD').replace(/[^A-Za-z]/g, '')[0] ?? 'X').toUpperCase();
  for (const r of rows) {
    if (byId[r.id]) continue;
    const base = latin(r.first_name) + latin(r.last_name);
    let k = base;
    for (let i = 2; used.has(k); i++) k = `${base}${i}`;
    byId[r.id] = k;
    used.add(k);
    changed = true;
  }
  const byKey = Object.fromEntries(Object.entries(byId).map(([id, k]) => [k, id]));
  return { byId, byKey, changed };
}

/** TypeSafe Jev assigns a Core department + seller flag to staff who have no
 * Core metadata yet (one request for everyone). Falls back to role mapping. */
async function classifyNewStaff(rows: ProfileRow[], meta: Record<string, StaffMeta>) {
  const todo = rows.filter((r) => !meta[r.id]?.d && r.role !== 'ceo');
  if (todo.length === 0) return false;
  for (const r of todo) meta[r.id] = { ...meta[r.id], d: ROLE_DEPT[r.role] ?? 'ops' };
  const res = await askTypeSafe(
    {
      context: 'Staff of Persons, a language & IT education centre. Place each person in the org department that best fits their site role.',
      staff: Object.fromEntries(todo.map((r, i) => [`p${i}`, { role: ROLE_TITLE[r.role] ?? r.role, role_code: r.role }])),
    },
    Object.fromEntries(
      todo.flatMap((_, i) => [
        [
          `d${i}`,
          {
            type: 'choice' as const,
            instructions: `Which department does \`staff.p${i}\` belong to?`,
            criteria: {
              acad: 'Academic: teachers, head teachers, teaching assistants, methodology.',
              ops: 'Operations: administration, branch management, IT/LMS, project management, facilities.',
              com: 'Commercial: sales, marketing, media/SMM, call-centre.',
              fin: 'Finance and accounting.',
              hr: 'Human resources.',
            },
          },
        ],
        [`s${i}`, { type: 'noul' as const, instructions: `Does \`staff.p${i}\` directly sell courses to customers (sales or call-centre)?` }],
      ]),
    ),
    'core_staff',
  );
  if (res) {
    todo.forEach((r, i) => {
      const d = res.answers[`d${i}`];
      const s = res.answers[`s${i}`];
      if (d?.type === 'choice' && d.confidence >= 0.4) meta[r.id].d = d.choice as CoreStaff['d'];
      if (s?.type === 'noul' && s.noul >= 0.6) meta[r.id].sales = 1;
      meta[r.id].ai = 1;
    });
  }
  return true;
}

const STATUS_TO_CORE: Record<string, string> = {
  pending: 'todo',
  in_progress: 'prog',
  submitted: 'rev',
  awaiting_upload: 'rev',
  done: 'done',
};

/** Everything the Core page needs for this viewer. */
export async function loadCore(me: Profile) {
  const [shared, profiles] = await Promise.all([
    readShared(),
    sql<ProfileRow[]>`
      select id, first_name, last_name, role::text as role, phone, email, is_active, created_at, monthly_salary
      from profiles order by first_name, last_name`,
  ]);
  const meta = { ...((shared.staffMeta as Record<string, StaffMeta>) ?? {}) };
  const keys = keyMap(profiles, (shared.keys as Record<string, string>) ?? {});
  const K = (id: string | null | undefined) => (id ? (keys.byId[id] ?? id) : null);
  if ((await classifyNewStaff(profiles.filter((p) => p.is_active), meta)) || keys.changed) {
    await sql`update core_state set data = data || ${sql.json({ staffMeta: meta, keys: keys.byId } as never)} where id = 1`;
  }
  const ceo = profiles.find((p) => p.role === 'ceo' && p.is_active);
  const staff: Record<string, CoreStaff> = {};
  for (const p of profiles) {
    const m = meta[p.id] ?? {};
    const top = p.role === 'ceo';
    staff[K(p.id)!] = {
      n: `${p.first_name} ${p.last_name}`.trim(),
      r: m.r ?? ROLE_TITLE[p.role] ?? p.role,
      d: top ? 'top' : (m.d ?? ROLE_DEPT[p.role] ?? 'ops'),
      c: grad(p.id),
      hired: p.created_at.slice(0, 10),
      sal: Number(p.monthly_salary ?? 0),
      boss: top ? null : K(m.boss ?? ceo?.id ?? null),
      ph: p.phone ?? '',
      em: p.email ?? '',
      active: p.is_active ? 1 : 0,
      ...(top ? { top: 1 as const } : {}),
      ...(m.sales ? { sales: 1 as const } : {}),
    };
  }

  // Tasks the viewer may see: the CEO all; others their own + their Core
  // subtree (people whose boss chain leads to them).
  const subtree = new Set<string>([K(me.id)!]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [id, s] of Object.entries(staff)) if (s.boss && subtree.has(s.boss) && !subtree.has(id)) (subtree.add(id), (grew = true));
  }
  const isTop = me.role === 'ceo';
  const taskRows = await sql<
    { id: string; title: string; description: string | null; assigned_to: string | null; assigned_by: string | null; deadline: string | null; status: string; created_at: string; completed_at: string | null }[]
  >`
    select id, title, description, assigned_to, assigned_by, deadline, status, created_at, completed_at
    from tasks
    where ${isTop} or assigned_to = any(${[...subtree].map((k) => keys.byKey[k]).filter(Boolean)}::uuid[]) or assigned_by = ${me.id}
    order by created_at desc limit 500`;
  const ids = taskRows.map((t) => t.id);
  const comments = ids.length
    ? await sql<{ task_id: string; author_id: string; body: string; created_at: string }[]>`
        select task_id, author_id, body, created_at from task_comments where task_id = any(${ids}::uuid[]) order by created_at`
    : [];
  const pr = (shared.taskPr as Record<string, string>) ?? {};
  const tasks = taskRows.map((t) => ({
    id: t.id,
    t: t.title,
    desc: t.description ?? '',
    who: K(t.assigned_to),
    by: K(t.assigned_by),
    due: t.deadline ? Date.parse(t.deadline) : Date.parse(t.created_at) + 7 * 864e5,
    st: STATUS_TO_CORE[t.status] ?? 'todo',
    pr: pr[t.id] ?? 'med',
    created: Date.parse(t.created_at),
    doneAt: t.completed_at ? Date.parse(t.completed_at) : null,
    cm: comments.filter((c) => c.task_id === t.id).map((c) => ({ by: K(c.author_id), at: Date.parse(c.created_at), t: c.body })),
  }));

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(shared)) if (!UI_KEYS.has(k) && k !== 'staffMeta' && k !== 'taskPr' && k !== 'keys') clean[k] = v;
  return { me: K(me.id)!, state: { v: 2, ...clean, staff, tasks, me: K(me.id)! } };
}

type Json = Record<string, unknown>;
type CoreTask = { id: string | number; t: string; desc?: string; who: string; by?: string; due: number; st: string; pr?: string; cm?: { by: string; at: number; t: string }[] };

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const isUuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);

/** Which top-level keys of S a viewer may write. CEO: everything. Others:
 * shared logs/requests; sales data if Core gives them the Sales section
 * (department or the CEO's ACL); KPI/bonus only for themselves and their
 * Core subtree (enforced per entry in applyCorePatch). */
function writableKeys(me: Profile, dept: string | undefined, acl: string[] | undefined): Set<string> | 'all' {
  if (me.role === 'ceo') return 'all';
  const keys = new Set(['notif', 'log', 'm11', 'vac', 'leave', 'kpi', 'bonus']);
  if (dept === 'com' || dept === 'fin' || acl?.includes('sales')) ['leads', 'spend', 'tgt'].forEach((k) => keys.add(k));
  return keys;
}

/**
 * Applies a patch of changed top-level keys from the Core page. Tasks go
 * through the real task Server Actions (same rules/stars as the Tasks page);
 * staff edits are stored as Core metadata only (accounts are managed on the
 * Xodimlar page). Returns messages for anything the site refused.
 */
export async function applyCorePatch(me: Profile, patch: Json, prevTasks: CoreTask[] | undefined) {
  const errors: string[] = [];
  const shared = await readShared();
  const meta = { ...((shared.staffMeta as Record<string, StaffMeta>) ?? {}) };
  const keyOf = (shared.keys as Record<string, string>) ?? {};
  const byKey = Object.fromEntries(Object.entries(keyOf).map(([id, k]) => [k, id]));
  const myKey = keyOf[me.id];
  const acl = (shared.acl as Record<string, string[]> | null)?.[myKey];
  const allowed = writableKeys(me, meta[me.id]?.d, acl);
  // Me + everyone whose Core boss chain leads to me.
  const mine = new Set<string>([myKey]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [id, m] of Object.entries(meta)) {
      const k = keyOf[id];
      const boss = m.boss ? keyOf[m.boss] : undefined;
      if (k && boss && mine.has(boss) && !mine.has(k)) (mine.add(k), (grew = true));
    }
  }
  const next: Json = {};

  for (const [k, v] of Object.entries(patch)) {
    if (UI_KEYS.has(k) || REAL_KEYS.has(k)) continue;
    if (allowed !== 'all' && !allowed.has(k)) continue;
    if (allowed !== 'all' && (k === 'kpi' || k === 'bonus') && v && typeof v === 'object') {
      // Per-person maps: keep other people's entries exactly as stored.
      const cur = { ...((shared[k] as Json) ?? {}) };
      for (const [who, entry] of Object.entries(v as Json)) if (mine.has(who)) cur[who] = entry;
      next[k] = cur;
      continue;
    }
    next[k] = v;
  }

  if (patch.staff && me.role === 'ceo') {
    for (const [key, s] of Object.entries(patch.staff as Record<string, CoreStaff>)) {
      const id = byKey[key];
      if (!id) {
        errors.push("Yangi xodim login bilan birga «Xodimlar» bo'limida qo'shiladi");
        continue;
      }
      meta[id] = { ...meta[id], r: s.r, d: s.d, boss: s.boss ? (byKey[s.boss] ?? null) : null, sales: s.sales ? 1 : undefined };
    }
    next.staffMeta = meta;
  }

  if (Array.isArray(patch.tasks)) {
    const { errors: te, taskPr } = await syncTasks(patch.tasks as CoreTask[], prevTasks ?? [], (shared.taskPr as Record<string, string>) ?? {}, byKey);
    errors.push(...te);
    next.taskPr = taskPr;
  }

  if (Object.keys(next).length) {
    await sql`
      update core_state set data = data || ${sql.json(next as never)}, updated_at = now(), updated_by = ${me.id}
      where id = 1`;
  }
  return errors;
}

const TASK_ERR: Record<string, string> = {
  forbidden: "Bu amal uchun ruxsat yo'q (vazifani faqat CEO beradi/tasdiqlaydi)",
  sessionExpired: 'Sessiya tugagan — qayta kiring',
};

async function syncTasks(next: CoreTask[], prev: CoreTask[], taskPr: Record<string, string>, byKey: Record<string, string>) {
  const t = await import('@/lib/actions/tasks');
  const c = await import('@/lib/actions/task-comments');
  const errors: string[] = [];
  const before = new Map(prev.map((x) => [String(x.id), x]));
  const run = async (res: { error?: string } | undefined | void) => {
    if (res && res.error) errors.push(TASK_ERR[res.error] ?? `Vazifa: ${res.error}`);
  };

  for (const task of next) {
    const id = String(task.id);
    if (task.pr) taskPr[id] = task.pr;
    const old = before.get(id);
    if (!isUuid(id)) {
      // New task created in Core → real task (site rules decide who may assign).
      await run(
        await t.assignTaskAction(undefined, fd({
          title: task.t,
          description: task.desc ?? '',
          assignedTo: byKey[task.who] ?? task.who,
          deadline: new Date(task.due).toISOString(),
        })),
      );
      continue;
    }
    if (!old) continue;
    if (old.st !== task.st) {
      if (task.st === 'rev') await run(await t.submitTaskAction(fd({ id })));
      else if (task.st === 'done' && old.st === 'rev') await run(await t.approveTaskAction(fd({ id })));
      else if (old.st === 'rev' && (task.st === 'prog' || task.st === 'todo'))
        await run(await t.rejectTaskAction(undefined, fd({ id, reason: "Qayta ishlash kerak (Core platformasidan qaytarildi)" })));
      else
        await run(await t.updateTaskStatusAction(fd({ id, status: task.st === 'prog' ? 'in_progress' : task.st === 'done' ? 'done' : 'pending' })));
    }
    const newComments = (task.cm ?? []).slice((old.cm ?? []).length);
    for (const cm of newComments) await run(await c.createTaskCommentAction(undefined, fd({ taskId: id, body: cm.t })));
  }
  const nowIds = new Set(next.map((x) => String(x.id)));
  for (const id of before.keys()) if (isUuid(id) && !nowIds.has(id)) await run(await t.deleteTaskAction(fd({ id })));
  return { errors, taskPr };
}

export const CORE_ROLES: string[] = ['ceo', 'it_developer'];

/** Core's page ids, in its own nav order (ALL_V in core.html). */
export const CORE_VIEWS = ['home', 'tasks', 'inbox', 'sales', 'hr', 'perforce', 'ops', 'strategy', 'report', 'settings'] as const;
export type CoreView = (typeof CORE_VIEWS)[number];

/** Which Core pages this person may open — Core's own can()/defAccess()
 * rules, evaluated on the server so the site's sidebar and page guards
 * agree with what the embedded Core shows. */
export async function coreViews(me: Profile): Promise<CoreView[]> {
  // Owner's decision: the whole Core platform is CEO + IT Developer only for now.
  if (!CORE_ROLES.includes(me.role)) return [];
  if (me.role === 'it_developer') return [...CORE_VIEWS];
  const [shared, ceo] = await Promise.all([
    readShared(),
    sql<{ id: string }[]>`select id from profiles where role = 'ceo' and is_active = true limit 1`,
  ]);
  const keys = (shared.keys as Record<string, string>) ?? {};
  const acl = (shared.acl as Record<string, string[]> | undefined)?.[keys[me.id] ?? ''];
  if (acl) return CORE_VIEWS.filter((v) => acl.includes(v));
  if (me.role === 'ceo') return [...CORE_VIEWS];
  const m = ((shared.staffMeta as Record<string, StaffMeta>) ?? {})[me.id] ?? {};
  const d = m.d ?? ROLE_DEPT[me.role] ?? 'ops';
  const r = m.r ?? ROLE_TITLE[me.role] ?? me.role;
  const boss = keys[m.boss ?? ceo[0]?.id ?? ''];
  const v = new Set<CoreView>(['home', 'tasks', 'inbox', 'hr']);
  if (d === 'com') v.add('sales');
  const add = (...xs: CoreView[]) => xs.forEach((x) => v.add(x));
  if (d === 'ops' || r === 'COO') add('perforce', 'ops');
  if (d === 'hr') add('ops', 'strategy', 'report');
  if (d === 'fin') add('sales', 'strategy', 'report');
  if (d === 'acad') add('perforce');
  if (boss === 'AQ') add('strategy', 'report');
  return CORE_VIEWS.filter((x) => v.has(x));
}

type Lead = { at: number; st: string; ch: string; hist?: { st: string; at: number }[] };
export const CORE_CHANNELS: Record<string, string> = { ig: 'Instagram', meta: 'Meta Ads', tg: 'Telegram', gg: 'Google', ref: 'Tavsiya', off: 'Offline' };

/** This Tashkent month's sales from Core's lead data, with the same formulas
 * as Core's salesCalc(): leads = created this month, contracts = those now
 * 'won', CAC = month spend / contracts; plus a 7-day lead flow and channels. */
export async function loadSalesSnapshot() {
  const s = await readShared();
  const leads = (s.leads as Lead[] | undefined) ?? [];
  const m = tashkentMonthKey();
  const inMonth = leads.filter((l) => tashkentMonthKey(new Date(l.at)) === m);
  const sp = ((s.spend as Record<string, Record<string, number>> | undefined) ?? {})[m] ?? {};
  const tg = ((s.tgt as Record<string, { leads?: number; won?: number }> | undefined) ?? {})[m] ?? {};
  const spend = Object.values(sp).reduce((a, v) => a + (Number(v) || 0), 0);
  const won = inMonth.filter((l) => l.st === 'won').length;
  const today = tashkentDayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(today, i - 6));
  const flow = days.map((d) => ({ day: d, n: leads.filter((l) => tashkentDayKey(new Date(l.at)) === d).length }));
  const channels = Object.entries(CORE_CHANNELS)
    .map(([k, name]) => {
      const n = inMonth.filter((l) => l.ch === k).length;
      const cs = Number(sp[k]) || 0;
      return { k, name, n, won: inMonth.filter((l) => l.ch === k && l.st === 'won').length, spend: cs, cpl: n ? cs / n : 0 };
    })
    .filter((c) => c.n || c.spend)
    .sort((a, b) => b.n - a.n);
  return { month: m, leads: inMonth.length, won, targetLeads: tg.leads ?? 0, targetWon: tg.won ?? 0, spend, cac: won ? spend / won : 0, conv: inMonth.length ? (won / inMonth.length) * 100 : 0, flow, channels };
}
export type SalesSnapshot = Awaited<ReturnType<typeof loadSalesSnapshot>>;
