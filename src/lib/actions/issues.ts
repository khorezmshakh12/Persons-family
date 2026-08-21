'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import type { StaffRole } from '@/lib/nav';
import { allowedAssigneeRoles } from '@/lib/issue-roles';
import { escapeTelegramText, sendTelegramMessageToMany } from '@/lib/telegram';
import { logSystemAction } from '@/lib/audit-log';
import { fieldErrorCodes, type FieldErrors } from '@/lib/form-errors';
import { createSignedWriteUrl, createSignedReadUrl } from '@/lib/gcp/storage';
import { bumpBoardSignal, bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';

export type IssueActionState = { error?: string; fieldErrors?: FieldErrors } | undefined;

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
  if (!user || !profile) return { error: 'forbidden' };

  const parsed = createIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput', fieldErrors: fieldErrorCodes(parsed.error) };

  const isAdmin = profile.role === 'ceo';

  let assignedTo: string | null = null;
  let assigneeProfile: { first_name: string; last_name: string; role: StaffRole } | null = null;
  if (parsed.data.assignedTo && parsed.data.assignedTo !== 'none') {
    const [target] = await sql<{ first_name: string; last_name: string; role: StaffRole }[]>`
      select first_name, last_name, role from profiles where id = ${parsed.data.assignedTo}
    `;
    // Strict chain of command, re-checked here regardless of what the
    // client's dropdown offered — the dropdown options alone are not a
    // security boundary. Only CEO/IT Developer can assign to anyone;
    // everyone else (including an Administrative Manager reporting their
    // own issue) is restricted to allowedAssigneeRoles.
    if (!isAdmin && (!target || !allowedAssigneeRoles(profile.role).includes(target.role))) {
      return { error: 'invalidAssignee' };
    }
    if (!target) return { error: 'invalidAssignee' };
    assignedTo = parsed.data.assignedTo;
    assigneeProfile = target;
  }

  // Defense in depth: uploads are scoped to the uploader's own folder at
  // signed-URL creation time, but double-check here too rather than
  // trusting a client-supplied path unconditionally.
  const voiceUrl =
    parsed.data.voiceUrl && parsed.data.voiceUrl.startsWith(`${user.id}/`) ? parsed.data.voiceUrl : null;

  await sql`
    insert into issues (created_by, title, description, assigned_to, voice_url)
    values (${user.id}, ${parsed.data.title}, ${parsed.data.description || null}, ${assignedTo}, ${voiceUrl})
  `;

  await bumpBoardSignal('issues');
  if (assignedTo) await bumpNavBadgeSignal(assignedTo);

  revalidatePath('/[locale]/issues', 'page');

  // Fire-and-forget notification — never let a Telegram hiccup affect the
  // response to the person who just submitted the issue. Scoped to
  // teacher-authored issues per the spec: notify the reporter (as a
  // receipt) plus every connected CEO and Administrative Manager, since a
  // teacher's issue always needs visibility at that level regardless of
  // which single person they picked in "Assign to".
  if (profile.role === 'teacher') {
    // See staff-chats.ts's `after()` comment — Vercel can tear down a bare
    // un-awaited fire-and-forget call before its Telegram send finishes.
    after(() =>
      notifyIssueCreated({
        title: parsed.data.title,
        reporterName: `${profile.first_name} ${profile.last_name}`,
        reporterTelegramId: profile.telegram_id,
        assigneeName: assigneeProfile ? `${assigneeProfile.first_name} ${assigneeProfile.last_name}` : null,
      }),
    );
  }

  return {};
}

async function notifyIssueCreated({
  title,
  reporterName,
  reporterTelegramId,
  assigneeName,
}: {
  title: string;
  reporterName: string;
  reporterTelegramId: number | null;
  assigneeName: string | null;
}) {
  try {
    const admins = await sql<{ telegram_id: number }[]>`
      select telegram_id from profiles
      where role in ('ceo', 'admin_manager') and telegram_id is not null
    `;
    console.log('Users retrieved from DB for notifications:', admins);

    const text = [
      `<b>Yangi murojaat:</b> ${escapeTelegramText(title)}`,
      `<b>Kimdan:</b> ${escapeTelegramText(reporterName)}`,
      `<b>Kimga:</b> ${assigneeName ? escapeTelegramText(assigneeName) : 'Belgilanmagan'}`,
    ].join('\n');

    const chatIds = [reporterTelegramId, ...admins.map((a) => a.telegram_id)];
    await sendTelegramMessageToMany(chatIds, text);
  } catch (error) {
    console.error('Telegram Notification Failed:', error instanceof Error ? error.message : error);
  }
}

const uploadUrlSchema = z.object({ fileName: z.string().trim().min(1) });
export type UploadUrlResult = { path?: string; url?: string; error?: string };

/** Mirrors requestChatMediaUploadUrlAction's signed-upload-url pattern
 * exactly, targeting the dedicated issue-voice-notes bucket instead. */
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

const STATUSES = ['open', 'in_progress', 'done'] as const;

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
});

export type UpdateIssueStatusResult = { error?: string };

/** CEO and IT Developer can change the status of any issue. An
 * Administrative Manager (no longer an admin role generally) may only
 * change the status of an issue currently assigned to them — everyone
 * else has no status-change capability here at all. This app-layer check
 * is now the only thing enforcing it (previously RLS/trigger-backed too). */
export async function updateIssueStatusAction(formData: FormData): Promise<UpdateIssueStatusResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const parsed = updateStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  if (profile.role !== 'ceo') {
    const [existing] = await sql<{ assigned_to: string | null }[]>`
      select assigned_to from issues where id = ${parsed.data.id}
    `;
    if (!existing || profile.role !== 'admin_manager' || existing.assigned_to !== user.id) {
      return { error: 'forbidden' };
    }
  }

  await sql`
    update issues set
      status = ${parsed.data.status},
      resolved_by = ${parsed.data.status === 'done' ? user.id : null},
      resolved_at = ${parsed.data.status === 'done' ? new Date().toISOString() : null}
    where id = ${parsed.data.id}
  `;

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
  canChangeStatus: boolean;
};

const VOICE_URL_EXPIRY_SECONDS = 60 * 60;

/**
 * Re-fetch for IssuesBoard's live refresh, triggered whenever
 * board_signals/issues changes in Firestore — see getVisibleTasksAction's
 * comment in tasks.ts for why this re-derives the whole list rather than
 * patching one row. Mirrors app/[locale]/(app)/issues/page.tsx's own query:
 * visibility is is_admin() (ceo) OR reporter OR assignee (the old
 * issues_select RLS policy, ported explicitly since RLS no longer exists),
 * and a "done" issue resolved over a week ago is hidden from the board.
 * Unlike the old browser-side Realtime handler, this can properly sign a
 * fresh voice-note URL server-side instead of leaving it null.
 */
export async function getVisibleIssuesAction(): Promise<VisibleIssueRow[]> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return [];
  const isCeo = profile.role === 'ceo';
  const isAdminManager = profile.role === 'admin_manager';

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const rows = await sql<
    {
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
    }[]
  >`
    select
      i.id, i.title, i.description, i.status, i.created_at, i.created_by, i.assigned_to, i.voice_url,
      reporter.first_name as reporter_first_name, reporter.last_name as reporter_last_name,
      assignee.first_name as assignee_first_name, assignee.last_name as assignee_last_name
    from issues i
    left join profiles reporter on reporter.id = i.created_by
    left join profiles assignee on assignee.id = i.assigned_to
    where (${isCeo} or i.created_by = ${user.id} or i.assigned_to = ${user.id})
      and (i.status <> 'done' or i.resolved_at is null or i.resolved_at >= ${sevenDaysAgo})
    order by i.created_at desc
  `;

  return Promise.all(
    rows.map(async (row) => ({
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
      canChangeStatus: isCeo || (isAdminManager && row.assigned_to === user.id),
    })),
  );
}

const deleteIssueSchema = z.object({ id: z.string().uuid() });

export type DeleteIssueResult = { error?: string };

/** Open to the issue's own creator or an admin, at any status. */
export async function deleteIssueAction(formData: FormData): Promise<DeleteIssueResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };
  const isCeo = profile.role === 'ceo';

  const parsed = deleteIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const [issue] = await sql<{ created_by: string }[]>`select created_by from issues where id = ${parsed.data.id}`;
  if (!issue) return { error: 'notFound' };
  if (!isCeo && issue.created_by !== user.id) return { error: 'forbidden' };

  await sql`delete from issues where id = ${parsed.data.id}`;

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

/** Text-only edit, open to the issue's own creator or an admin. Everything
 * else (status, assignee, voice note) stays admin-gated through the status
 * board actions — this action only ever touches title/description. */
export async function updateIssueAction(
  _prevState: IssueActionState,
  formData: FormData,
): Promise<IssueActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };
  const isCeo = profile.role === 'ceo';

  const parsed = updateIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const [issue] = await sql<{ created_by: string }[]>`select created_by from issues where id = ${parsed.data.id}`;
  if (!issue) return { error: 'notFound' };
  if (!isCeo && issue.created_by !== user.id) return { error: 'forbidden' };

  await sql`
    update issues set title = ${parsed.data.title}, description = ${parsed.data.description || null}
    where id = ${parsed.data.id}
  `;

  await bumpBoardSignal('issues');

  revalidatePath('/[locale]/issues', 'page');
  return {};
}
