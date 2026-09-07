'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { logSystemAction } from '@/lib/audit-log';
import { fieldErrorCodes, type FieldErrors } from '@/lib/form-errors';
import { createSignedWriteUrl, createSignedReadUrl } from '@/lib/gcp/storage';
import { bumpBoardSignal, bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';

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
  const [row] = await sql<{ id: string }[]>`
    select id from profiles where role = 'ceo' and is_active = true order by created_at asc limit 1
  `;
  return row?.id ?? null;
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

  try {
    await sql`
      insert into issues (created_by, title, description, assigned_to, voice_url)
      values (${userId}, ${parsed.data.title}, ${parsed.data.description || null}, ${assignedTo}, ${voiceUrl})
    `;
  } catch {
    return { error: 'createFailed' };
  }

  await bumpBoardSignal('issues');
  if (assignedTo) await bumpNavBadgeSignal(assignedTo);

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
};

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

async function toVisibleIssueRow(row: IssueQueryRow): Promise<VisibleIssueRow> {
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
  };
}

/**
 * Re-fetch for IssuesBoard's live refresh, triggered whenever
 * board_signals/issues changes in Firestore — see getVisibleTasksAction's
 * comment in tasks.ts for why this re-derives the whole list rather than
 * patching one row. The CEO sees the whole board, so the only filter left
 * is the recency rule — a "done" issue resolved over a week ago drops off.
 * A non-CEO caller sees only the issues they raised (created_by = self),
 * same recency rule. Unlike the old browser-side Realtime handler, this can
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
        where i.created_by = ${user.id}
          and (i.status <> 'done' or i.resolved_at is null or i.resolved_at >= ${sevenDaysAgo})
        order by i.created_at desc
      `;

  return Promise.all(rows.map(toVisibleIssueRow));
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

  revalidatePath('/[locale]/issues', 'page');
  return {};
}
