'use server';

import { z } from 'zod';
import { after } from 'next/server';
import { triageIssue } from '@/lib/ai-triage';
import { revalidatePath } from 'next/cache';
import { getFormatter } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { logSystemAction } from '@/lib/audit-log';
import { fieldErrorCodes, type FieldErrors } from '@/lib/form-errors';
import { createSignedWriteUrl, createSignedReadUrl } from '@/lib/gcp/storage';
import { bumpBoardSignal, bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';
import { escapeTelegramText, notifyUsers, sendTelegramAs } from '@/lib/telegram';
import { resolveActionNotifications } from '@/lib/notifications';
import { can } from '@/lib/permissions';
import { allowedTaskAssigneeRoles } from '@/lib/task-roles';
import type { StaffRole } from '@/lib/nav';
import {
  AUTO_CLOSE_DAYS,
  deadlines,
  ISSUE_KINDS,
  KIND_META,
  PRIORITIES,
  PRIORITY_META,
  STAGE_MOVES,
  STAGES,
  stageOf,
  type IssueKind,
  type Priority,
  type Stage,
} from '@/lib/issues-flow';

// Murojaatlar markazi (v8-A, 2026-10-10). Anyone may raise an issue; the
// issue managers (issues.manage) run the queue, and — new in v8 — the person
// an issue is assigned to works it too (accept, start, resolve, comment,
// turn it into a task). The reporter confirms the fix or reopens it.
// Editing the text, priority, kind, assignee and deleting stay with the
// managers. Every action re-checks its own gate against the row.
//
// Anonymous ideas: `created_by` is stored (the reporter must be able to
// follow and confirm their idea), but no read path ever hands the name or
// id to anyone else — not even a manager.

export type IssueActionState = { error?: string; fieldErrors?: FieldErrors; id?: string } | undefined;

const isManager = (role: string | null | undefined) => can(role, 'issues.manage');
const fullName = (p: { first_name: string | null; last_name: string | null }) =>
  `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
const link = (id: string) => `/issues?id=${id}`;

/** Non-manager reports route to the oldest active CEO (a stable pick). */
async function ceoUserId(): Promise<string | null> {
  // eslint-disable-next-line no-restricted-syntax
  const [row] = await sql<{ id: string }[]>`
    select p.id from profiles p
    where p.is_active and (p.role = 'ceo' or exists (select 1 from profile_roles r where r.user_id = p.id and r.role = 'ceo'))
    order by (p.role = 'ceo') desc, p.created_at asc limit 1
  `;
  return row?.id ?? null;
}

async function requireViewer() {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return null;
  return { userId: user.id, profile, manager: isManager(profile.role) };
}

type IssueCore = {
  id: string;
  title: string;
  status: string;
  kind: IssueKind;
  priority: Priority;
  anonymous: boolean;
  created_by: string;
  assigned_to: string | null;
  accepted_at: string | null;
  closed_at: string | null;
  created_at: string;
  task_id: string | null;
};

async function loadCore(id: string): Promise<IssueCore | undefined> {
  const [row] = await sql<IssueCore[]>`
    select id, title, status, kind, priority, anonymous, created_by, assigned_to, accepted_at::text as accepted_at,
           closed_at::text as closed_at, created_at::text as created_at, task_id
    from issues where id = ${id}`;
  return row;
}

async function logEvent(issueId: string, actorId: string | null, kind: string, note: string | null = null) {
  try {
    await sql`insert into issue_events (issue_id, actor_id, kind, note) values (${issueId}, ${actorId}, ${kind}, ${note})`;
  } catch (error) {
    console.error('issue event failed', error instanceof Error ? error.message : error);
  }
}

async function changed(assignees: (string | null)[] = []) {
  await bumpBoardSignal('issues');
  await Promise.all(assignees.filter((x): x is string => Boolean(x)).map((id) => bumpNavBadgeSignal(id).catch(() => {})));
  revalidatePath('/[locale]/issues', 'page');
}

/* ------------------------------------------------------------ create */

const createIssueSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  kind: z.enum(ISSUE_KINDS).default('problem'),
  priority: z.enum(PRIORITIES).default('normal'),
  anonymous: z.enum(['on', 'off', '']).optional(),
  assignedTo: z.union([z.string().uuid(), z.literal('none'), z.literal('')]).optional(),
  voiceUrl: z.string().max(500).optional().or(z.literal('')),
});

export async function createIssueAction(_prev: IssueActionState, formData: FormData): Promise<IssueActionState> {
  const v = await requireViewer();
  if (!v) return { error: 'sessionExpired' };
  const parsed = createIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput', fieldErrors: fieldErrorCodes(parsed.error) };
  const d = parsed.data;
  const anonymous = d.kind === 'idea' && d.anonymous === 'on';

  // A manager may delegate straight away; anyone else's report goes to the CEO.
  let assignedTo: string | null = null;
  if (v.manager && d.assignedTo && d.assignedTo !== 'none') {
    const [target] = await sql<{ id: string }[]>`select id from profiles where id = ${d.assignedTo} and is_active = true`;
    if (!target) return { error: 'invalidAssignee' };
    assignedTo = target.id;
  } else if (!v.manager) {
    assignedTo = await ceoUserId();
  }

  const voiceUrl = d.voiceUrl && d.voiceUrl.startsWith(`${v.userId}/`) ? d.voiceUrl : null;
  const { respondBy, resolveBy } = deadlines(d.priority, d.kind, Date.now());

  let id: string;
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into issues (created_by, title, description, assigned_to, voice_url, kind, priority, anonymous, respond_by, resolve_by)
      values (${v.userId}, ${d.title}, ${d.description || null}, ${assignedTo}, ${voiceUrl}, ${d.kind}, ${d.priority},
              ${anonymous}, ${respondBy}, ${resolveBy})
      returning id`;
    id = row.id;
  } catch (error) {
    console.error('createIssueAction failed', error instanceof Error ? error.message : error);
    return { error: 'createFailed' };
  }
  await logEvent(id, anonymous ? null : v.userId, 'created');
  after(async () => {
    if (await triageIssue(id)) await bumpBoardSignal('issues');
  });

  if (assignedTo && assignedTo !== v.userId) {
    const who = anonymous ? 'Anonim' : escapeTelegramText(fullName(v.profile));
    await notifyUsers(
      'issue',
      [assignedTo],
      `📥 <b>Yangi murojaat</b> · ${KIND_META[d.kind].n} · ${PRIORITY_META[d.priority].n}\n«${escapeTelegramText(d.title)}»\nKimdan: ${who}\nJavob muddati: ${PRIORITY_META[d.priority].respondH} soat`,
      { href: link(id), action: true, ref: `issue:${id}` },
    );
  }
  await changed([assignedTo]);
  return { id };
}

const uploadUrlSchema = z.object({ fileName: z.string().trim().min(1) });
export type UploadUrlResult = { path?: string; url?: string; error?: string };

/** Signed upload URL for a voice note, scoped to the uploader's folder. */
export async function requestIssueVoiceUploadUrlAction(fileName: string): Promise<UploadUrlResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  const parsed = uploadUrlSchema.safeParse({ fileName });
  if (!parsed.success) return { error: 'invalidInput' };
  const sanitized = parsed.data.fileName.replace(/[^\w.\-]+/g, '_');
  const path = `${user.id}/${crypto.randomUUID()}-${sanitized}`;
  const url = await createSignedWriteUrl('issue-voice-notes', path, 'audio/webm');
  return { path, url };
}

/* ------------------------------------------------------------ read */

export type IssueAi = {
  category: string | null;
  categoryConfidence: number | null;
  urgency: number | null;
  itBug: number | null;
};

export type IssueCommentRole = 'manager' | 'assignee' | 'author' | 'staff';
export type IssueComment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  authorName: string;
  authorRole: IssueCommentRole;
};
export type IssueEvent = { id: string; kind: string; note: string | null; actorName: string | null; created_at: string };

export type CenterIssue = {
  id: string;
  title: string;
  description: string | null;
  kind: IssueKind;
  priority: Priority;
  status: 'open' | 'in_progress' | 'done';
  anonymous: boolean;
  created_at: string;
  accepted_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  respond_by: string | null;
  resolve_by: string | null;
  confirmed: boolean | null;
  rating: number | null;
  reopen_count: number;
  root_cause: string | null;
  /** Null for an anonymous idea unless the viewer raised it. */
  reporterId: string | null;
  reporterName: string;
  isMine: boolean;
  assigned_to: string | null;
  assigneeName: string | null;
  task: { id: string; title: string; status: string; assigneeName: string | null } | null;
  voiceSignedUrl: string | null;
  ai: IssueAi | null;
  comments: IssueComment[];
  events: IssueEvent[];
};
export type IssuesCenter = { issues: CenterIssue[]; viewerId: string; manager: boolean };

type Row = {
  id: string;
  title: string;
  description: string | null;
  kind: IssueKind;
  priority: Priority;
  status: CenterIssue['status'];
  anonymous: boolean;
  created_at: string;
  accepted_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  respond_by: string | null;
  resolve_by: string | null;
  confirmed: boolean | null;
  rating: number | null;
  reopen_count: number;
  root_cause: string | null;
  created_by: string;
  assigned_to: string | null;
  voice_url: string | null;
  rep_first: string | null;
  rep_last: string | null;
  asg_first: string | null;
  asg_last: string | null;
  task_id: string | null;
  task_title: string | null;
  task_status: string | null;
  task_first: string | null;
  task_last: string | null;
};

/**
 * The center's data. Managers see every issue; anyone else the ones they
 * raised or were given. Closed issues stay on the board for 14 days, then
 * live in the archive. Re-derived whole on every board_signals/issues bump.
 */
export async function getIssuesCenterAction(): Promise<IssuesCenter | null> {
  const v = await requireViewer();
  if (!v) return null;
  const scope = v.manager ? sql`true` : sql`(i.created_by = ${v.userId} or i.assigned_to = ${v.userId})`;
  const rows = await sql<Row[]>`
    select i.id, i.title, i.description, i.kind, i.priority, i.status, i.anonymous,
           i.created_at::text as created_at, i.accepted_at::text as accepted_at, i.resolved_at::text as resolved_at,
           i.closed_at::text as closed_at, i.respond_by::text as respond_by, i.resolve_by::text as resolve_by,
           i.confirmed, i.rating, i.reopen_count, i.root_cause, i.created_by, i.assigned_to, i.voice_url,
           r.first_name as rep_first, r.last_name as rep_last, a.first_name as asg_first, a.last_name as asg_last,
           i.task_id, t.title as task_title, t.status::text as task_status, tp.first_name as task_first, tp.last_name as task_last
    from issues i
    left join profiles r on r.id = i.created_by
    left join profiles a on a.id = i.assigned_to
    left join tasks t on t.id = i.task_id
    left join profiles tp on tp.id = t.assigned_to
    where ${scope} and (i.closed_at is null or i.closed_at >= now() - interval '14 days')
    order by i.created_at desc
    limit 400`;
  const ids = rows.map((r) => r.id);
  const anonReporter = new Map(rows.filter((r) => r.anonymous).map((r) => [r.id, r.created_by]));
  const [comments, events, ai] = await Promise.all([loadComments(ids), loadEvents(ids), loadIssueAi(ids)]);

  const issues = await Promise.all(
    rows.map(async (r): Promise<CenterIssue> => {
      const isMine = r.created_by === v.userId;
      const hide = r.anonymous && !isMine;
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        kind: r.kind,
        priority: r.priority,
        status: r.status,
        anonymous: r.anonymous,
        created_at: r.created_at,
        accepted_at: r.accepted_at,
        resolved_at: r.resolved_at,
        closed_at: r.closed_at,
        respond_by: r.respond_by,
        resolve_by: r.resolve_by,
        confirmed: r.confirmed,
        rating: r.rating,
        reopen_count: r.reopen_count,
        root_cause: r.root_cause,
        reporterId: hide ? null : r.created_by,
        reporterName: hide ? 'Anonim' : fullName({ first_name: r.rep_first, last_name: r.rep_last }) || '—',
        isMine,
        assigned_to: r.assigned_to,
        assigneeName: r.asg_first ? fullName({ first_name: r.asg_first, last_name: r.asg_last }) : null,
        task: r.task_id
          ? {
              id: r.task_id,
              title: r.task_title ?? '',
              status: r.task_status ?? '',
              assigneeName: r.task_first ? fullName({ first_name: r.task_first, last_name: r.task_last }) : null,
            }
          : null,
        voiceSignedUrl: r.voice_url && !hide ? await createSignedReadUrl('issue-voice-notes', r.voice_url, 3600) : null,
        ai: ai.get(r.id) ?? null,
        comments: (comments.get(r.id) ?? []).map((c) => {
          const byReporter = c.author_id === r.created_by;
          const masked = byReporter && anonReporter.has(r.id) && !isMine;
          return {
            id: c.id,
            body: c.body,
            created_at: c.created_at,
            author_id: masked ? null : c.author_id,
            authorName: masked ? 'Anonim muallif' : fullName(c) || '—',
            authorRole: byReporter ? 'author' : c.author_id === r.assigned_to ? 'assignee' : isManager(c.role) ? 'manager' : 'staff',
          };
        }),
        events: (events.get(r.id) ?? []).map((e) => ({
          id: e.id,
          kind: e.kind,
          note: e.note,
          actorName: e.actor_id && e.actor_id === r.created_by && hide ? 'Anonim muallif' : e.actor_id ? fullName(e) || null : null,
          created_at: e.created_at,
        })),
      };
    }),
  );
  return { issues, viewerId: v.userId, manager: v.manager };
}

type CommentRow = { id: string; issue_id: string; body: string; created_at: string; author_id: string | null; first_name: string | null; last_name: string | null; role: string | null };
async function loadComments(ids: string[]) {
  const by = new Map<string, CommentRow[]>();
  if (!ids.length) return by;
  try {
    const rows = await sql<CommentRow[]>`
      select c.id, c.issue_id, c.body, c.created_at::text as created_at, c.author_id, p.first_name, p.last_name, p.role::text as role
      from issue_comments c left join profiles p on p.id = c.author_id
      where c.issue_id = any(${sql.array(ids)}::uuid[]) order by c.created_at, c.id`;
    for (const r of rows) by.set(r.issue_id, [...(by.get(r.issue_id) ?? []), r]);
  } catch (error) {
    console.error('loadComments failed', error instanceof Error ? error.message : error);
  }
  return by;
}

type EventRow = { id: string; issue_id: string; kind: string; note: string | null; actor_id: string | null; first_name: string | null; last_name: string | null; created_at: string };
async function loadEvents(ids: string[]) {
  const by = new Map<string, EventRow[]>();
  if (!ids.length) return by;
  try {
    const rows = await sql<EventRow[]>`
      select e.id, e.issue_id, e.kind, e.note, e.actor_id, p.first_name, p.last_name, e.created_at::text as created_at
      from issue_events e left join profiles p on p.id = e.actor_id
      where e.issue_id = any(${sql.array(ids)}::uuid[]) order by e.created_at`;
    for (const r of rows) by.set(r.issue_id, [...(by.get(r.issue_id) ?? []), r]);
  } catch (error) {
    console.error('loadEvents failed', error instanceof Error ? error.message : error);
  }
  return by;
}

async function loadIssueAi(ids: string[]): Promise<Map<string, IssueAi>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await sql<
      { issue_id: string; category: string | null; category_confidence: number | null; urgency: number | null; it_bug: number | null }[]
    >`select issue_id, category, category_confidence, urgency, it_bug from issue_ai where issue_id = any(${sql.array(ids)}::uuid[])`;
    return new Map(
      rows.map((r) => [r.issue_id, { category: r.category, categoryConfidence: r.category_confidence, urgency: r.urgency, itBug: r.it_bug }]),
    );
  } catch {
    return new Map();
  }
}

/* ------------------------------------------------------------ workflow */

const moveSchema = z.object({
  id: z.string().uuid(),
  to: z.enum(STAGES),
  note: z.string().trim().max(1000).optional(),
});

const STAGE_TEXT: Partial<Record<Stage, string>> = {
  accepted: '👀 Murojaatingiz qabul qilindi',
  in_progress: '🛠 Murojaatingiz bo‘yicha ish boshlandi',
};

/**
 * A manager or the assignee moves an issue along. Resolving needs a short
 * "what was done" note and asks the reporter to confirm (or closes at once
 * when the reporter is the one resolving). Guarded on the status it was
 * read with, so two people clicking at once can't both apply.
 */
export async function moveIssueAction(input: z.input<typeof moveSchema>): Promise<{ error?: string }> {
  const v = await requireViewer();
  if (!v) return { error: 'sessionExpired' };
  const p = moveSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { id, to } = p.data;
  const note = p.data.note || null;
  const i = await loadCore(id);
  if (!i) return { error: 'notFound' };
  if (!v.manager && i.assigned_to !== v.userId) return { error: 'forbidden' };
  const from = stageOf(i);
  if (!STAGE_MOVES[from].includes(to)) return { error: 'invalidTransition' };
  if (to === 'resolved' && (!note || note.length < 3)) return { error: 'resolutionNote' };

  const reporterResolves = to === 'resolved' && i.created_by === v.userId;
  // `status` alone can't tell new/accepted or resolved/closed apart — guard
  // on the exact stage that was read, so a racing click never applies twice.
  const guard =
    from === 'new'
      ? sql`status = 'open' and accepted_at is null`
      : from === 'accepted'
        ? sql`status = 'open' and accepted_at is not null`
        : from === 'in_progress'
          ? sql`status = 'in_progress'`
          : from === 'resolved'
            ? sql`status = 'done' and closed_at is null`
            : sql`status = 'done' and closed_at is not null`;
  // A finished linked task can't carry a reopened issue — unlink it.
  const unlinkDoneTask = sql`task_id = case when exists (select 1 from tasks t where t.id = issues.task_id and t.status = 'done') then null else task_id end`;
  const reopening = from === 'resolved' || from === 'closed';
  const resolveBy = i.kind === 'idea' ? null : new Date(Date.now() + PRIORITY_META[i.priority].resolveH * 3_600_000).toISOString();
  try {
    const res =
      to === 'accepted'
        ? await sql`update issues set status = 'open', accepted_at = coalesce(accepted_at, now())
                    where id = ${id} and ${guard}`
        : to === 'in_progress'
          ? await sql`update issues set status = 'in_progress', accepted_at = coalesce(accepted_at, now()),
                      resolved_at = null, resolved_by = null, closed_at = null, confirmed = null, rating = null,
                      reopen_count = reopen_count + ${reopening ? 1 : 0},
                      resolve_by = ${reopening ? resolveBy : sql`resolve_by`}, sla_warned = ${reopening ? null : sql`sla_warned`},
                      ${reopening ? unlinkDoneTask : sql`task_id = task_id`}
                      where id = ${id} and ${guard}`
          : await sql`update issues set status = 'done', accepted_at = coalesce(accepted_at, now()),
                      resolved_at = now(), resolved_by = ${v.userId},
                      closed_at = ${reporterResolves ? sql`now()` : null}, confirmed = ${reporterResolves ? true : null}
                      where id = ${id} and ${guard}`;
    if (res.count === 0) return { error: 'conflict' };
  } catch (error) {
    console.error('moveIssueAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }
  await logEvent(id, v.userId, reopening ? 'reopened' : to, note);
  // The "new issue" action item is dealt with once someone picks it up.
  await resolveActionNotifications(`issue:${id}`);
  logSystemAction('issue.status_change', `Issue ${id}: ${from} → ${to}`);

  if (i.created_by !== v.userId) {
    const title = escapeTelegramText(i.title);
    if (to === 'resolved')
      await notifyUsers(
        'issue',
        [i.created_by],
        `✅ <b>Murojaatingiz hal qilindi</b>\n«${title}»\nNima qilindi: ${escapeTelegramText(note ?? '')}\nIltimos, tasdiqlang: hal bo‘ldimi? (${AUTO_CLOSE_DAYS} kun ichida javob bo‘lmasa, avtomatik yopiladi)`,
        { href: link(id), action: true, ref: `issue:${id}:confirm` },
      );
    else if (STAGE_TEXT[to] && !reopening) await notifyUsers('issue', [i.created_by], `${STAGE_TEXT[to]}\n«${title}»`, { href: link(id) });
  }
  if (reopening) await resolveActionNotifications(`issue:${id}:confirm`);
  await changed([i.assigned_to]);
  return {};
}

const confirmSchema = z.object({
  id: z.string().uuid(),
  ok: z.boolean(),
  rating: z.number().int().min(1).max(5).optional(),
  note: z.string().trim().max(1000).optional(),
});

/** The reporter's verdict on a resolved issue: "yes, fixed" (with an
 * optional 1–5 rating) closes it; "no" (with a reason) sends it back to
 * work with a fresh resolve deadline and tells the assignee and the CEO. */
export async function confirmIssueAction(input: z.input<typeof confirmSchema>): Promise<{ error?: string }> {
  const v = await requireViewer();
  if (!v) return { error: 'sessionExpired' };
  const p = confirmSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { id, ok, rating } = p.data;
  const note = p.data.note || null;
  const i = await loadCore(id);
  if (!i) return { error: 'notFound' };
  if (i.created_by !== v.userId) return { error: 'forbidden' };
  if (stageOf(i) !== 'resolved') return { error: 'invalidTransition' };
  if (!ok && (!note || note.length < 3)) return { error: 'reopenReason' };

  const resolveBy = i.kind === 'idea' ? null : new Date(Date.now() + PRIORITY_META[i.priority].resolveH * 3_600_000).toISOString();
  try {
    const res = ok
      ? await sql`update issues set closed_at = now(), confirmed = true, rating = ${rating ?? null}
                  where id = ${id} and status = 'done' and closed_at is null`
      : await sql`update issues set status = 'in_progress', resolved_at = null, resolved_by = null, confirmed = false,
                  reopen_count = reopen_count + 1, resolve_by = ${resolveBy}, sla_warned = null,
                  task_id = case when exists (select 1 from tasks t where t.id = issues.task_id and t.status = 'done') then null else task_id end
                  where id = ${id} and status = 'done' and closed_at is null`;
    if (res.count === 0) return { error: 'conflict' };
  } catch (error) {
    console.error('confirmIssueAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }
  const actor = i.anonymous ? null : v.userId;
  await logEvent(id, actor, ok ? 'confirmed' : 'rejected_fix', ok ? (rating ? `Baho: ${rating}/5` : null) : note);
  await resolveActionNotifications(`issue:${id}:confirm`, [v.userId]);
  if (!ok) {
    const ceo = await ceoUserId().catch(() => null);
    await notifyUsers(
      'issue',
      [i.assigned_to, ceo].filter((x) => x && x !== v.userId),
      `↩️ <b>Murojaat qayta ochildi</b> — muallif hal bo‘lmadi dedi\n«${escapeTelegramText(i.title)}»\nSabab: ${escapeTelegramText(note ?? '')}`,
      { href: link(id), action: true, ref: `issue:${id}` },
    );
  }
  await changed([i.assigned_to]);
  return {};
}

const metaSchema = z.object({
  id: z.string().uuid(),
  priority: z.enum(PRIORITIES).optional(),
  kind: z.enum(ISSUE_KINDS).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  rootCause: z.string().trim().max(1000).optional(),
});

/** Manager-only triage edits: priority (deadlines recomputed from when the
 * issue was raised), kind, assignee (the new one is told), root cause. */
export async function setIssueMetaAction(input: z.input<typeof metaSchema>): Promise<{ error?: string }> {
  let actorId: string;
  try {
    ({ user: { id: actorId } } = await requireCap('issues.manage'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = metaSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const d = p.data;
  const i = await loadCore(d.id);
  if (!i) return { error: 'notFound' };
  const kind = d.kind ?? i.kind;
  if (i.anonymous && kind !== 'idea') return { error: 'anonymousIdea' };
  const priority = d.priority ?? i.priority;
  if (d.assignedTo) {
    const [t] = await sql<{ id: string }[]>`select id from profiles where id = ${d.assignedTo} and is_active`;
    if (!t) return { error: 'invalidAssignee' };
  }
  const reDeadline = d.priority !== undefined || d.kind !== undefined;
  const dl = deadlines(priority, kind, Date.parse(i.created_at));
  try {
    await sql`
      update issues set
        priority = ${priority}, kind = ${kind},
        respond_by = ${reDeadline ? dl.respondBy : sql`respond_by`},
        resolve_by = ${reDeadline ? dl.resolveBy : sql`resolve_by`},
        sla_warned = ${reDeadline ? null : sql`sla_warned`},
        assigned_to = ${d.assignedTo !== undefined ? d.assignedTo : sql`assigned_to`},
        is_seen = ${d.assignedTo !== undefined && d.assignedTo !== i.assigned_to ? false : sql`is_seen`},
        root_cause = ${d.rootCause !== undefined ? d.rootCause || null : sql`root_cause`}
      where id = ${d.id}`;
  } catch (error) {
    console.error('setIssueMetaAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }
  if (d.priority && d.priority !== i.priority) await logEvent(d.id, actorId, 'priority', PRIORITY_META[d.priority].n);
  if (d.kind && d.kind !== i.kind) await logEvent(d.id, actorId, 'kind', KIND_META[d.kind].n);
  if (d.rootCause !== undefined) await logEvent(d.id, actorId, 'root_cause', d.rootCause || null);
  if (d.assignedTo !== undefined && d.assignedTo !== i.assigned_to) {
    if (i.assigned_to) await resolveActionNotifications(`issue:${d.id}`, [i.assigned_to]);
    const [who] = d.assignedTo ? await sql<{ first_name: string | null; last_name: string | null }[]>`select first_name, last_name from profiles where id = ${d.assignedTo}` : [];
    await logEvent(d.id, actorId, 'assigned', who ? fullName(who) : 'Hech kim');
    if (d.assignedTo && d.assignedTo !== actorId)
      await notifyUsers(
        'issue',
        [d.assignedTo],
        `📌 <b>Sizga murojaat topshirildi</b> · ${PRIORITY_META[priority].n}\n«${escapeTelegramText(i.title)}»\nQabul qiling va hal qilgach «Hal qilindi» deb belgilang.`,
        { href: link(d.id), action: true, ref: `issue:${d.id}` },
      );
  }
  await changed([i.assigned_to, d.assignedTo ?? null]);
  return {};
}

const toTaskSchema = z.object({
  id: z.string().uuid(),
  assigneeId: z.string().uuid(),
  deadline: z.string().datetime({ offset: true }),
});

/** Turns an issue into a Tasks task (manager or the assignee, and only if
 * they may assign tasks to that person). The issue moves to "Jarayonda";
 * when the task is completed the issue resolves itself and the reporter is
 * asked to confirm (syncIssuesForTask in lib/issues-sync.ts). */
export async function issueToTaskAction(input: z.input<typeof toTaskSchema>): Promise<{ error?: string; taskId?: string }> {
  const v = await requireViewer();
  if (!v) return { error: 'sessionExpired' };
  const p = toTaskSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const i = await loadCore(p.data.id);
  if (!i) return { error: 'notFound' };
  if (!v.manager && i.assigned_to !== v.userId) return { error: 'forbidden' };
  if (i.task_id) return { error: 'alreadyLinked' };
  if (i.status === 'done') return { error: 'invalidTransition' };
  const [target] = await sql<{ id: string; role: StaffRole; telegram_id: number | null }[]>`
    select id, role, telegram_id from profiles where id = ${p.data.assigneeId} and is_active`;
  if (!target) return { error: 'invalidAssignee' };
  if (target.id !== v.userId && !allowedTaskAssigneeRoles(v.profile.role as StaffRole).includes(target.role)) return { error: 'cannotAssign' };
  if (Date.parse(p.data.deadline) <= Date.now()) return { error: 'deadlinePast' };

  const [full] = await sql<{ description: string | null }[]>`select description from issues where id = ${i.id}`;
  let taskId: string;
  try {
    taskId = await sql.begin(async (tx) => {
      const [t] = await tx<{ id: string }[]>`
        insert into tasks (title, description, assigned_to, assigned_by, deadline, star_reward, star_penalty, requires_proof)
        values (${`Murojaat: ${i.title}`.slice(0, 200)}, ${[full?.description, 'Murojaatlar bo‘limidan yaratilgan.'].filter(Boolean).join('\n\n')},
                ${target.id}, ${v.userId}, ${p.data.deadline}, 0, 0, false)
        returning id`;
      const res = await tx`
        update issues set task_id = ${t.id}, status = 'in_progress', accepted_at = coalesce(accepted_at, now())
        where id = ${i.id} and task_id is null and status <> 'done'`;
      if (res.count === 0) throw new Error('conflict');
      return t.id;
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'conflict') return { error: 'conflict' };
    console.error('issueToTaskAction failed', error instanceof Error ? error.message : error);
    return { error: 'createFailed' };
  }
  await logEvent(i.id, v.userId, 'task_linked', `Vazifa: ${i.title}`);
  await resolveActionNotifications(`issue:${i.id}`);
  await bumpBoardSignal('tasks');
  if (target.id !== v.userId && target.telegram_id)
    await sendTelegramAs('task', target.telegram_id, `Sizga yangi vazifa biriktirildi: <b>${escapeTelegramText(`Murojaat: ${i.title}`)}</b>`, {
      record: false,
    }).catch(() => {});
  await changed([target.id, i.assigned_to]);
  return { taskId };
}

/* ------------------------------------------------------------ manager edits */

const deleteIssueSchema = z.object({ id: z.string().uuid() });
export type DeleteIssueResult = { error?: string };

/** Managers only, at any stage. */
export async function deleteIssueAction(formData: FormData): Promise<DeleteIssueResult> {
  try {
    await requireCap('issues.manage');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const parsed = deleteIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from issues where id = ${parsed.data.id}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch (error) {
    console.error('deleteIssueAction failed', error instanceof Error ? error.message : error);
    return { error: 'deleteFailed' };
  }
  await resolveActionNotifications(`issue:${parsed.data.id}`);
  await resolveActionNotifications(`issue:${parsed.data.id}:confirm`);
  logSystemAction('issue.delete', `Deleted issue ${parsed.data.id}`);
  await changed();
  return {};
}

const updateIssueSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
});

/** Text-only edit — managers only. */
export async function updateIssueAction(_prev: IssueActionState, formData: FormData): Promise<IssueActionState> {
  try {
    await requireCap('issues.manage');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const parsed = updateIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  try {
    const res = await sql`
      update issues set title = ${parsed.data.title}, description = ${parsed.data.description || null}
      where id = ${parsed.data.id}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch (error) {
    console.error('updateIssueAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }
  const editedId = parsed.data.id;
  after(async () => {
    if (await triageIssue(editedId)) await bumpBoardSignal('issues');
  });
  await changed();
  return {};
}

/* ------------------------------------------------------------ comments */

const addIssueCommentSchema = z.object({
  issueId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

/** A comment from a manager, the reporter or the assignee. The other side
 * is told; an anonymous reporter's name never leaves the server. */
export async function addIssueCommentAction(input: z.input<typeof addIssueCommentSchema>): Promise<{ error?: string }> {
  const v = await requireViewer();
  if (!v) return { error: 'sessionExpired' };
  const p = addIssueCommentSchema.safeParse(input);
  if (!p.success) return { error: 'commentInvalid' };
  const i = await loadCore(p.data.issueId);
  if (!i) return { error: 'notFound' };
  if (!v.manager && i.created_by !== v.userId && i.assigned_to !== v.userId) return { error: 'forbidden' };
  try {
    await sql`insert into issue_comments (issue_id, author_id, body) values (${i.id}, ${v.userId}, ${p.data.body})`;
  } catch (error) {
    console.error('addIssueCommentAction failed', error instanceof Error ? error.message : error);
    return { error: 'commentFailed' };
  }
  const recipients = new Set<string>([i.created_by]);
  if (i.assigned_to) recipients.add(i.assigned_to);
  if (!v.manager) {
    const ceo = await ceoUserId().catch(() => null);
    if (ceo) recipients.add(ceo);
  }
  recipients.delete(v.userId);
  const author = i.anonymous && i.created_by === v.userId ? 'Anonim muallif' : fullName(v.profile);
  const body = p.data.body.length > 300 ? `${p.data.body.slice(0, 300)}…` : p.data.body;
  await notifyUsers(
    'issue',
    [...recipients],
    `💬 <b>Murojaatga izoh</b>: «${escapeTelegramText(i.title)}»\n${escapeTelegramText(author)}: ${escapeTelegramText(body)}`,
    { href: link(i.id) },
  );
  await changed();
  return {};
}

/** Manager: run TypeSafe triage for issues that have none yet — open ones
 * first, then history. Bounded so one click can't run long. */
export async function triageOpenIssuesAction(): Promise<{ error?: string; done?: number }> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (!isManager(profile.role)) return { error: 'forbidden' };
  let ids: { id: string }[];
  try {
    ids = await sql<{ id: string }[]>`
      select i.id from issues i left join issue_ai a on a.issue_id = i.id
      where a.issue_id is null
      order by (i.status <> 'done') desc, i.created_at desc limit 30`;
  } catch {
    return { error: 'loadFailed' };
  }
  let done = 0;
  for (let k = 0; k < ids.length; k += 5) {
    const ok = await Promise.all(ids.slice(k, k + 5).map(({ id }) => triageIssue(id)));
    done += ok.filter(Boolean).length;
  }
  if (done) {
    await bumpBoardSignal('issues');
    revalidatePath('/[locale]/issues', 'page');
  }
  return { done };
}

/* ------------------------------------------------------------ archive */

export type ArchivedIssueRow = {
  id: string;
  title: string;
  kind: IssueKind;
  created_at: string;
  resolved_at: string | null;
  rating: number | null;
  reporterName: string;
  assigneeName: string | null;
};
export type MonthlyIssueArchiveEntry = {
  /** 'YYYY-MM', Asia/Tashkent. */
  monthKey: string;
  label: string;
  counts: { resolved: number; raisedInMonth: number };
  issues: ArchivedIssueRow[];
};

/** Closed issues by the Tashkent month they were resolved in (the board
 * keeps 14 days). Scoped like the board. */
export async function getMonthlyIssueArchiveAction(): Promise<MonthlyIssueArchiveEntry[]> {
  const v = await requireViewer();
  if (!v) return [];
  const scope = v.manager ? sql`true` : sql`(i.created_by = ${v.userId} or i.assigned_to = ${v.userId})`;
  try {
    const [rows, raised] = await Promise.all([
      sql<
        {
          id: string;
          title: string;
          kind: IssueKind;
          anonymous: boolean;
          created_by: string;
          created_at: string;
          resolved_at: string | null;
          rating: number | null;
          month: string;
          rf: string | null;
          rl: string | null;
          af: string | null;
          al: string | null;
        }[]
      >`
        select i.id, i.title, i.kind, i.anonymous, i.created_by, i.created_at::text as created_at, i.resolved_at::text as resolved_at, i.rating,
               to_char(i.resolved_at at time zone 'Asia/Tashkent', 'YYYY-MM') as month,
               r.first_name as rf, r.last_name as rl, a.first_name as af, a.last_name as al
        from issues i
        left join profiles r on r.id = i.created_by
        left join profiles a on a.id = i.assigned_to
        where ${scope} and i.status = 'done' and i.closed_at is not null and i.resolved_at is not null
          and i.closed_at < now() - interval '14 days'
        order by i.resolved_at desc
        limit 1000`,
      sql<{ month: string; n: number }[]>`
        select to_char(i.created_at at time zone 'Asia/Tashkent', 'YYYY-MM') as month, count(*)::int as n
        from issues i where ${scope} group by 1`,
    ]);
    const raisedBy = new Map(raised.map((r) => [r.month, r.n]));
    const months = [...new Set(rows.map((r) => r.month))].sort((a, b) => b.localeCompare(a));
    const format = await getFormatter();
    return months.map((m) => {
      const list = rows.filter((r) => r.month === m);
      return {
        monthKey: m,
        label: format.dateTime(new Date(`${m}-01T00:00:00Z`), { month: 'long', year: 'numeric', timeZone: 'UTC' }),
        counts: { resolved: list.length, raisedInMonth: raisedBy.get(m) ?? 0 },
        issues: list.map((r) => ({
          id: r.id,
          title: r.title,
          kind: r.kind,
          created_at: r.created_at,
          resolved_at: r.resolved_at,
          rating: r.rating,
          reporterName: r.anonymous && r.created_by !== v.userId ? 'Anonim' : fullName({ first_name: r.rf, last_name: r.rl }) || '—',
          assigneeName: r.af ? fullName({ first_name: r.af, last_name: r.al }) : null,
        })),
      };
    });
  } catch (error) {
    console.error('getMonthlyIssueArchiveAction failed', error instanceof Error ? error.message : error);
    return [];
  }
}
