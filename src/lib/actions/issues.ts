'use server';

import { z } from 'zod';
import { after } from 'next/server';
import { triageIssue } from '@/lib/ai-triage';
import { revalidatePath } from 'next/cache';
import { getFormatter } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { logSystemAction } from '@/lib/audit-log';
import { fieldErrorCodes, type FieldErrors } from '@/lib/form-errors';
import { createSignedWriteUrl, createSignedReadUrl } from '@/lib/gcp/storage';
import { bumpBoardSignal, bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';

// Issues is a CEO-managed board, but reporting is open to everyone: any
// signed-in staff member may create an issue (it's auto-assigned to the
// CEO) and read back the ones they raised. Managing the board — status
// changes, text edits, deletion, the resolution-stats panel — stays
// CEO-only. Every action below re-checks its own gate; the page's guard
// only shapes what renders, not the POST endpoints underneath it.

export type IssueActionState = { error?: string; fieldErrors?: FieldErrors } | undefined;

/** Non-CEO reporters have no assignee picker — their issue always routes to
 * the active CEO. Null (issue created unassigned) only if there somehow
 * isn't one. */
async function ceoUserId(): Promise<string | null> {
  // Deliberately the oldest active CEO (a stable pick), not "latest N".
  // eslint-disable-next-line no-restricted-syntax
  const [row] = await sql<{ id: string }[]>`
    select id from profiles where role = 'ceo' and is_active = true order by created_at asc limit 1
  `;
  return row?.id ?? null;
}

/** Notification to whoever the new issue lands on — the CEO for a staff
 * report, or the person the CEO delegated it to. Swallows its own errors,
 * so a Telegram hiccup can never affect the response to the person who
 * just submitted the issue (mirrors notifyTaskAssigned in actions/tasks.ts,
 * including why it is awaited inline instead of dispatched via `after()`). */
async function notifyIssueAssigned({
  title,
  reporterName,
  assigneeTelegramId,
}: {
  title: string;
  reporterName: string;
  assigneeTelegramId: number | null;
}) {
  if (!assigneeTelegramId) return;
  try {
    const text = `Sizga yangi murojaat biriktirildi: <b>${escapeTelegramText(title)}</b>\nKimdan: ${escapeTelegramText(reporterName)}`;
    await sendTelegramMessage(assigneeTelegramId, text);
  } catch (error) {
    console.error('Telegram Notification Failed:', error instanceof Error ? error.message : error);
  }
}

const createIssueSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  // 'none' is the Select's sentinel value for "no assignee" (Base UI's
  // Select doesn't take a plain empty-string item value).
  assignedTo: z.union([z.string().uuid(), z.literal('none'), z.literal('')]).optional(),
  // Storage object path from requestIssueVoiceUploadUrlAction, not a URL —
  // see the comment on the migration for why we persist the path and
  // re-sign it on read instead of storing a signed URL directly.
  voiceUrl: z.string().max(500).optional().or(z.literal('')),
});

export async function createIssueAction(
  _prevState: IssueActionState,
  formData: FormData,
): Promise<IssueActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  const userId = user.id;
  const isCeo = profile.role === 'ceo';

  const parsed = createIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput', fieldErrors: fieldErrorCodes(parsed.error) };

  // The CEO may delegate to any active staff member, so the only server-side
  // re-validation left is that the target actually exists and is active —
  // the client's dropdown options are not a security boundary. A non-CEO
  // reporter has no picker at all: whatever the form posts is ignored and
  // the issue routes straight to the CEO.
  let assignedTo: string | null = null;
  if (isCeo) {
    if (parsed.data.assignedTo && parsed.data.assignedTo !== 'none') {
      const [target] = await sql<{ id: string }[]>`
        select id from profiles where id = ${parsed.data.assignedTo} and is_active = true
      `;
      if (!target) return { error: 'invalidAssignee' };
      assignedTo = target.id;
    }
  } else {
    assignedTo = await ceoUserId();
  }

  // Defense in depth: uploads are scoped to the uploader's own folder at
  // signed-URL creation time, but double-check here too rather than
  // trusting a client-supplied path unconditionally.
  const voiceUrl =
    parsed.data.voiceUrl && parsed.data.voiceUrl.startsWith(`${userId}/`) ? parsed.data.voiceUrl : null;

  let newIssueId: string;
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into issues (created_by, title, description, assigned_to, voice_url)
      values (${userId}, ${parsed.data.title}, ${parsed.data.description || null}, ${assignedTo}, ${voiceUrl})
      returning id
    `;
    newIssueId = row.id;
  } catch {
    return { error: 'createFailed' };
  }
  // AI triage (TypeSafe) after the response — never delays or fails the save.
  after(async () => {
    if (await triageIssue(newIssueId)) await bumpBoardSignal('issues');
  });

  await bumpBoardSignal('issues');
  if (assignedTo) await bumpNavBadgeSignal(assignedTo);

  // The assignee's own Telegram id isn't on either branch above (the CEO
  // path selects only `id`, and ceoUserId() likewise), so look it up once
  // here. Skipped when the reporter assigned the issue to themselves —
  // nobody needs a Telegram ping about their own submission.
  if (assignedTo && assignedTo !== userId) {
    const [assignee] = await sql<{ telegram_id: number | null }[]>`
      select telegram_id from profiles where id = ${assignedTo}
    `;
    await notifyIssueAssigned({
      title: parsed.data.title,
      reporterName: `${profile.first_name} ${profile.last_name}`,
      assigneeTelegramId: assignee?.telegram_id ?? null,
    });
  }

  revalidatePath('/[locale]/issues', 'page');

  return {};
}

const uploadUrlSchema = z.object({ fileName: z.string().trim().min(1) });
export type UploadUrlResult = { path?: string; url?: string; error?: string };

/** Mirrors requestChatMediaUploadUrlAction's signed-upload-url pattern
 * exactly, targeting the dedicated issue-voice-notes bucket instead. */
export async function requestIssueVoiceUploadUrlAction(fileName: string): Promise<UploadUrlResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  const userId = user.id;

  const parsed = uploadUrlSchema.safeParse({ fileName });
  if (!parsed.success) return { error: 'invalidInput' };

  const sanitized = parsed.data.fileName.replace(/[^\w.\-]+/g, '_');
  const path = `${userId}/${crypto.randomUUID()}-${sanitized}`;

  const url = await createSignedWriteUrl('issue-voice-notes', path, 'audio/webm');
  return { path, url };
}

const STATUSES = ['open', 'in_progress', 'done'] as const;

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
});

export type UpdateIssueStatusResult = { error?: string };

/** Only the CEO can change the status of an issue — the Administrative
 * Manager's old carve-out (issues assigned to them) is gone along with the
 * rest of their Issues access. This app-layer check is the only thing
 * enforcing it (previously RLS/trigger-backed too). */
export async function updateIssueStatusAction(formData: FormData): Promise<UpdateIssueStatusResult> {
  let userId;
  try {
    ({
      user: { id: userId },
    } = await requireCeo());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = updateStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    await sql`
      update issues set
        status = ${parsed.data.status},
        resolved_by = ${parsed.data.status === 'done' ? userId : null},
        resolved_at = ${parsed.data.status === 'done' ? new Date().toISOString() : null}
      where id = ${parsed.data.id}
    `;
  } catch (error) {
    console.error('updateIssueStatusAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  await bumpBoardSignal('issues');
  logSystemAction('issue.status_change', `Moved issue ${parsed.data.id} to "${parsed.data.status}"`);

  revalidatePath('/[locale]/issues', 'page');
  return {};
}

export type VisibleIssueRow = {
  id: string;
  title: string;
  description: string | null;
  status: (typeof STATUSES)[number];
  created_at: string;
  created_by: string;
  assigned_to: string | null;
  voiceSignedUrl: string | null;
  reporter: { first_name: string; last_name: string } | null;
  assignee: { first_name: string; last_name: string } | null;
  /** The issue's comment thread, oldest first — see loadIssueComments. */
  comments: IssueComment[];
  /** TypeSafe triage (lib/ai-triage.ts); null until/unless it has run. */
  ai: IssueAi | null;
};

export type IssueAi = {
  category: string | null;
  categoryConfidence: number | null;
  urgency: number | null;
  itBug: number | null;
};

/** How the author relates to the issue, for the thread's role badge. The
 * CEO wins over everything else; then the assignee (the one doing the
 * work), then the reporter. `staff` only for someone who has since been
 * unassigned — the thread keeps what they wrote. */
export type IssueCommentRole = 'ceo' | 'assignee' | 'author' | 'staff';

export type IssueComment = {
  id: string;
  body: string;
  created_at: string;
  /** Null once the author's profile has been removed (on delete set null). */
  author_id: string | null;
  authorName: string;
  authorRole: IssueCommentRole;
};

type IssueCommentQueryRow = {
  id: string;
  issue_id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
};

function toIssueComment(
  row: IssueCommentQueryRow,
  issue: { created_by: string; assigned_to: string | null },
): IssueComment {
  const authorRole: IssueCommentRole =
    row.role === 'ceo'
      ? 'ceo'
      : row.author_id && row.author_id === issue.assigned_to
        ? 'assignee'
        : row.author_id && row.author_id === issue.created_by
          ? 'author'
          : 'staff';
  return {
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    author_id: row.author_id,
    authorName: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || '—',
    authorRole,
  };
}

/** Every comment on the given (already access-checked) issues in one query,
 * grouped by issue, oldest first. A read-only helper: a DB failure is logged
 * and degrades to empty threads rather than taking the board down. */
async function loadIssueComments(issueIds: string[]): Promise<Map<string, IssueCommentQueryRow[]>> {
  const byIssue = new Map<string, IssueCommentQueryRow[]>();
  if (issueIds.length === 0) return byIssue;
  try {
    const rows = await sql<IssueCommentQueryRow[]>`
      select c.id, c.issue_id, c.body, c.created_at, c.author_id,
             p.first_name, p.last_name, p.role
      from issue_comments c
      left join profiles p on p.id = c.author_id
      where c.issue_id in ${sql(issueIds)}
      order by c.created_at, c.id
    `;
    for (const row of rows) {
      const list = byIssue.get(row.issue_id);
      if (list) list.push(row);
      else byIssue.set(row.issue_id, [row]);
    }
  } catch (error) {
    console.error('loadIssueComments failed', error instanceof Error ? error.message : error);
  }
  return byIssue;
}

const VOICE_URL_EXPIRY_SECONDS = 60 * 60;

type IssueQueryRow = {
  id: string;
  title: string;
  description: string | null;
  status: (typeof STATUSES)[number];
  created_at: string;
  created_by: string;
  assigned_to: string | null;
  voice_url: string | null;
  reporter_first_name: string | null;
  reporter_last_name: string | null;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
};

async function toVisibleIssueRow(
  row: IssueQueryRow,
  comments: IssueCommentQueryRow[] = [],
  ai: IssueAi | null = null,
): Promise<VisibleIssueRow> {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    created_by: row.created_by,
    assigned_to: row.assigned_to,
    voiceSignedUrl: row.voice_url ? await createSignedReadUrl('issue-voice-notes', row.voice_url, VOICE_URL_EXPIRY_SECONDS) : null,
    reporter: row.reporter_first_name ? { first_name: row.reporter_first_name, last_name: row.reporter_last_name! } : null,
    assignee: row.assignee_first_name ? { first_name: row.assignee_first_name, last_name: row.assignee_last_name! } : null,
    comments: comments.map((c) => toIssueComment(c, row)),
    ai,
  };
}

async function loadIssueAi(ids: string[]): Promise<Map<string, IssueAi>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await sql<
      { issue_id: string; category: string | null; category_confidence: number | null; urgency: number | null; it_bug: number | null }[]
    >`select issue_id, category, category_confidence, urgency, it_bug from issue_ai where issue_id = any(${ids}::uuid[])`;
    return new Map(
      rows.map((r) => [r.issue_id, { category: r.category, categoryConfidence: r.category_confidence, urgency: r.urgency, itBug: r.it_bug }]),
    );
  } catch {
    // Table not migrated yet / transient DB error: the board still renders.
    return new Map();
  }
}

/**
 * Re-fetch for IssuesBoard's live refresh, triggered whenever
 * board_signals/issues changes in Firestore — see getVisibleTasksAction's
 * comment in tasks.ts for why this re-derives the whole list rather than
 * patching one row. The CEO sees the whole board, so the only filter left
 * is the recency rule — a "done" issue resolved over a week ago drops off.
 * A non-CEO caller sees the issues they raised (created_by = self) plus any
 * the CEO delegated to them (assigned_to = self) — otherwise a delegated
 * issue triggered a Telegram ping and a nav badge for something the
 * assignee could never open. Same recency rule; still read-only for them. Unlike the old browser-side Realtime handler, this can
 * properly sign a fresh voice-note URL server-side instead of leaving it
 * null.
 */
export async function getVisibleIssuesAction(): Promise<VisibleIssueRow[]> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return [];
  const isCeo = profile.role === 'ceo';

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const rows = isCeo
    ? await sql<IssueQueryRow[]>`
        select
          i.id, i.title, i.description, i.status, i.created_at, i.created_by, i.assigned_to, i.voice_url,
          reporter.first_name as reporter_first_name, reporter.last_name as reporter_last_name,
          assignee.first_name as assignee_first_name, assignee.last_name as assignee_last_name
        from issues i
        left join profiles reporter on reporter.id = i.created_by
        left join profiles assignee on assignee.id = i.assigned_to
        where i.status <> 'done' or i.resolved_at is null or i.resolved_at >= ${sevenDaysAgo}
        order by i.created_at desc
      `
    : await sql<IssueQueryRow[]>`
        select
          i.id, i.title, i.description, i.status, i.created_at, i.created_by, i.assigned_to, i.voice_url,
          reporter.first_name as reporter_first_name, reporter.last_name as reporter_last_name,
          assignee.first_name as assignee_first_name, assignee.last_name as assignee_last_name
        from issues i
        left join profiles reporter on reporter.id = i.created_by
        left join profiles assignee on assignee.id = i.assigned_to
        where (i.created_by = ${user.id} or i.assigned_to = ${user.id})
          and (i.status <> 'done' or i.resolved_at is null or i.resolved_at >= ${sevenDaysAgo})
        order by i.created_at desc
      `;

  // Threads ride along with the board so everyone who can see an issue sees
  // its conversation, and the live refresh (board_signals/issues, bumped by
  // addIssueCommentAction too) picks new comments up for the other party.
  const [comments, ai] = await Promise.all([loadIssueComments(rows.map((r) => r.id)), loadIssueAi(rows.map((r) => r.id))]);
  return Promise.all(rows.map((row) => toVisibleIssueRow(row, comments.get(row.id), ai.get(row.id) ?? null)));
}

/**
 * Start of the current Asia/Tashkent calendar month, as a timestamptz — the
 * same fragment tasks.ts uses for its archive. The staff is in Tashkent and
 * the server clock is UTC, so a bare `date_trunc('month', now())` would roll
 * the month over five hours late and briefly file a new month's issue under
 * the archive.
 */
const currentMonthStart = () =>
  sql`date_trunc('month', now() at time zone 'Asia/Tashkent') at time zone 'Asia/Tashkent'`;

export type ArchivedIssueRow = {
  id: string;
  title: string;
  status: (typeof STATUSES)[number];
  created_at: string;
  resolved_at: string | null;
  reporter: { first_name: string; last_name: string } | null;
  assignee: { first_name: string; last_name: string } | null;
};

export type MonthlyIssueArchiveEntry = {
  /** 'YYYY-MM', Asia/Tashkent. */
  monthKey: string;
  /** Month name localized to the caller's locale, e.g. "August 2026". */
  label: string;
  counts: {
    /** Issues resolved in this month — the length of `issues`. */
    resolved: number;
    /** Issues *raised* in this month, resolved or not. Deliberately a wider
     * set than `issues`: an issue raised in March and resolved in April
     * counts towards March's "raised" and April's "resolved". */
    raisedInMonth: number;
  };
  issues: ArchivedIssueRow[];
};

type ArchiveIssueQueryRow = {
  id: string;
  title: string;
  status: (typeof STATUSES)[number];
  created_at: string;
  resolved_at: string | null;
  resolved_month: string;
  reporter_first_name: string | null;
  reporter_last_name: string | null;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
};

type RaisedMonthRow = { month_key: string; raised: number };

/**
 * The past-months archive rendered under the Issues board, mirroring the
 * Tasks one. One entry per past Tashkent month that resolved at least one
 * issue, newest month first; the board itself only keeps recently-resolved
 * issues (see getVisibleIssuesAction), so this is where older history lives.
 *
 * Scoping is deliberately identical to getVisibleIssuesAction: the CEO sees
 * every issue, anyone else sees only the ones they raised
 * (`created_by = self`). The two query branches are spelled out in full
 * rather than composed from a nested `sql` fragment.
 *
 * A read-only action: DB failures are logged and degrade to an empty archive
 * rather than taking the page down.
 */
export async function getMonthlyIssueArchiveAction(): Promise<MonthlyIssueArchiveEntry[]> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return [];
  const isCeo = profile.role === 'ceo';

  let rows: ArchiveIssueQueryRow[];
  let raisedRows: RaisedMonthRow[];
  try {
    [rows, raisedRows] = await Promise.all([
      isCeo
        ? sql<ArchiveIssueQueryRow[]>`
            select
              i.id, i.title, i.status, i.created_at, i.resolved_at,
              to_char(i.resolved_at at time zone 'Asia/Tashkent', 'YYYY-MM') as resolved_month,
              reporter.first_name as reporter_first_name, reporter.last_name as reporter_last_name,
              assignee.first_name as assignee_first_name, assignee.last_name as assignee_last_name
            from issues i
            left join profiles reporter on reporter.id = i.created_by
            left join profiles assignee on assignee.id = i.assigned_to
            where i.status = 'done'
              and i.resolved_at is not null
              and i.resolved_at < ${currentMonthStart()}
            order by i.resolved_at desc
          `
        : sql<ArchiveIssueQueryRow[]>`
            select
              i.id, i.title, i.status, i.created_at, i.resolved_at,
              to_char(i.resolved_at at time zone 'Asia/Tashkent', 'YYYY-MM') as resolved_month,
              reporter.first_name as reporter_first_name, reporter.last_name as reporter_last_name,
              assignee.first_name as assignee_first_name, assignee.last_name as assignee_last_name
            from issues i
            left join profiles reporter on reporter.id = i.created_by
            left join profiles assignee on assignee.id = i.assigned_to
            where (i.created_by = ${user.id} or i.assigned_to = ${user.id})
              and i.status = 'done'
              and i.resolved_at is not null
              and i.resolved_at < ${currentMonthStart()}
            order by i.resolved_at desc
          `,
      isCeo
        ? sql<RaisedMonthRow[]>`
            select
              to_char(i.created_at at time zone 'Asia/Tashkent', 'YYYY-MM') as month_key,
              count(*)::int as raised
            from issues i
            where i.created_at < ${currentMonthStart()}
            group by month_key
          `
        : sql<RaisedMonthRow[]>`
            select
              to_char(i.created_at at time zone 'Asia/Tashkent', 'YYYY-MM') as month_key,
              count(*)::int as raised
            from issues i
            where i.created_by = ${user.id}
              and i.created_at < ${currentMonthStart()}
            group by month_key
          `,
    ]);
  } catch (error) {
    console.error(
      'getMonthlyIssueArchiveAction failed',
      error instanceof Error ? error.message : error,
    );
    return [];
  }

  const raisedByMonth = new Map(raisedRows.map((row) => [row.month_key, row.raised]));
  const monthKeys = [...new Set(rows.map((row) => row.resolved_month))].sort((a, b) =>
    b.localeCompare(a),
  );

  const format = await getFormatter();

  return monthKeys.map((monthKey) => {
    const issues = rows.filter((row) => row.resolved_month === monthKey);
    return {
      monthKey,
      // Parsed and formatted as UTC on purpose: the key is already a Tashkent
      // month, so re-applying a zone here could name the neighbouring month.
      label: format.dateTime(new Date(`${monthKey}-01T00:00:00Z`), {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      counts: {
        resolved: issues.length,
        raisedInMonth: raisedByMonth.get(monthKey) ?? 0,
      },
      issues: issues.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
        reporter: row.reporter_first_name
          ? { first_name: row.reporter_first_name, last_name: row.reporter_last_name! }
          : null,
        assignee: row.assignee_first_name
          ? { first_name: row.assignee_first_name, last_name: row.assignee_last_name! }
          : null,
      })),
    };
  });
}

const deleteIssueSchema = z.object({ id: z.string().uuid() });

export type DeleteIssueResult = { error?: string };

/** CEO-only, at any status. */
export async function deleteIssueAction(formData: FormData): Promise<DeleteIssueResult> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = deleteIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const [issue] = await sql<{ id: string }[]>`select id from issues where id = ${parsed.data.id}`;
  if (!issue) return { error: 'notFound' };

  try {
    await sql`delete from issues where id = ${parsed.data.id}`;
  } catch (error) {
    console.error('deleteIssueAction failed', error instanceof Error ? error.message : error);
    return { error: 'deleteFailed' };
  }

  await bumpBoardSignal('issues');
  logSystemAction('issue.delete', `Deleted issue ${parsed.data.id}`);

  revalidatePath('/[locale]/issues', 'page');
  return {};
}

const updateIssueSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
});

/** Text-only edit, CEO-only like the rest of the module. Everything else
 * (status, assignee, voice note) goes through the other board actions —
 * this action only ever touches title/description. */
export async function updateIssueAction(
  _prevState: IssueActionState,
  formData: FormData,
): Promise<IssueActionState> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = updateIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const [issue] = await sql<{ id: string }[]>`select id from issues where id = ${parsed.data.id}`;
  if (!issue) return { error: 'notFound' };

  try {
    await sql`
      update issues set title = ${parsed.data.title}, description = ${parsed.data.description || null}
      where id = ${parsed.data.id}
    `;
  } catch (error) {
    console.error('updateIssueAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  await bumpBoardSignal('issues');

  // Title/description changed → refresh the AI triage after the response.
  const editedId = parsed.data.id;
  after(async () => {
    if (await triageIssue(editedId)) await bumpBoardSignal('issues');
  });
  revalidatePath('/[locale]/issues', 'page');
  return {};
}

/** Telegram ping to the other side of an issue thread. Swallows its own
 * errors — a Telegram hiccup must never fail the comment itself (same
 * reasoning as notifyIssueAssigned, including why it is awaited inline). */
async function notifyIssueComment({
  recipientIds,
  title,
  authorName,
  body,
}: {
  recipientIds: string[];
  title: string;
  authorName: string;
  body: string;
}) {
  if (recipientIds.length === 0) return;
  try {
    const recipients = await sql<{ telegram_id: number | null }[]>`
      select telegram_id from profiles where id in ${sql(recipientIds)} and is_active = true
    `;
    const preview = body.length > 300 ? `${body.slice(0, 300)}…` : body;
    const text = `Murojaatga yangi izoh: <b>${escapeTelegramText(title)}</b>\n${escapeTelegramText(authorName)}: ${escapeTelegramText(preview)}`;
    await Promise.all(
      recipients
        .filter((r): r is { telegram_id: number } => Boolean(r.telegram_id))
        .map((r) => sendTelegramMessage(r.telegram_id, text)),
    );
  } catch (error) {
    console.error('Telegram Notification Failed:', error instanceof Error ? error.message : error);
  }
}

const addIssueCommentSchema = z.object({
  issueId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

export type AddIssueCommentState = { error?: string; comment?: IssueComment } | undefined;

/**
 * Adds a comment to an issue's thread. The CEO may comment on any issue
 * (an instruction or a question); otherwise only the person who raised the
 * issue or the one it is assigned to may reply — exactly the set of people
 * getVisibleIssuesAction shows the issue to. Re-checked here against the
 * row itself; the composer being visible on the card is not the boundary.
 */
export async function addIssueCommentAction(
  _prevState: AddIssueCommentState,
  formData: FormData,
): Promise<AddIssueCommentState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  const isCeo = profile.role === 'ceo';

  const parsed = addIssueCommentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'commentInvalid' };

  let issue: { id: string; title: string; created_by: string; assigned_to: string | null } | undefined;
  try {
    [issue] = await sql<{ id: string; title: string; created_by: string; assigned_to: string | null }[]>`
      select id, title, created_by, assigned_to from issues where id = ${parsed.data.issueId}
    `;
  } catch (error) {
    console.error('addIssueCommentAction lookup failed', error instanceof Error ? error.message : error);
    return { error: 'commentFailed' };
  }
  if (!issue) return { error: 'notFound' };
  if (!isCeo && issue.created_by !== user.id && issue.assigned_to !== user.id) {
    return { error: 'forbidden' };
  }

  let inserted: { id: string; created_at: string } | undefined;
  try {
    [inserted] = await sql<{ id: string; created_at: string }[]>`
      insert into issue_comments (issue_id, author_id, body)
      values (${issue.id}, ${user.id}, ${parsed.data.body})
      returning id, created_at
    `;
  } catch (error) {
    console.error('addIssueCommentAction failed', error instanceof Error ? error.message : error);
    return { error: 'commentFailed' };
  }
  if (!inserted) return { error: 'commentFailed' };

  await bumpBoardSignal('issues');

  // The CEO's comment goes to the reporter and the assignee; a reply from
  // either of them goes to the other one and to the CEO.
  const recipients = new Set<string>([issue.created_by]);
  if (issue.assigned_to) recipients.add(issue.assigned_to);
  if (!isCeo) {
    const ceoId = await ceoUserId().catch(() => null);
    if (ceoId) recipients.add(ceoId);
  }
  recipients.delete(user.id);
  await notifyIssueComment({
    recipientIds: [...recipients],
    title: issue.title,
    authorName: `${profile.first_name} ${profile.last_name}`.trim(),
    body: parsed.data.body,
  });

  revalidatePath('/[locale]/issues', 'page');
  return {
    comment: toIssueComment(
      {
        id: inserted.id,
        issue_id: issue.id,
        body: parsed.data.body,
        created_at: inserted.created_at,
        author_id: user.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: profile.role,
      },
      issue,
    ),
  };
}

/** CEO: run TypeSafe triage for open issues that have none yet (backfill /
 * retry after the key was added). Bounded so one click can't run long. */
export async function triageOpenIssuesAction(): Promise<{ error?: string; done?: number }> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (profile.role !== 'ceo') return { error: 'forbidden' };
  let ids: { id: string }[];
  try {
    ids = await sql<{ id: string }[]>`
      select i.id from issues i left join issue_ai a on a.issue_id = i.id
      where i.status <> 'done' and a.issue_id is null
      order by i.created_at desc limit 25`;
  } catch {
    return { error: 'loadFailed' };
  }
  let done = 0;
  for (const { id } of ids) if (await triageIssue(id)) done++;
  if (done) {
    await bumpBoardSignal('issues');
    revalidatePath('/[locale]/issues', 'page');
  }
  return { done };
}
