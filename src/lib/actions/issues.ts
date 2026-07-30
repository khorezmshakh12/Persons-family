'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthState } from '@/lib/auth/session';
import { allowedAssigneeRoles } from '@/lib/issue-roles';
import { escapeTelegramText, sendTelegramMessageToMany } from '@/lib/telegram';
import { logSystemAction } from '@/lib/audit-log';

export type IssueActionState = { error?: string } | undefined;

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
  if (!parsed.success) return { error: 'invalidInput' };

  const isCeo = profile.role === 'ceo';
  const supabase = await createClient();

  let assignedTo: string | null = null;
  let assigneeProfile: { first_name: string; last_name: string; role: string } | null = null;
  if (parsed.data.assignedTo && parsed.data.assignedTo !== 'none') {
    const { data: target } = await supabase
      .from('profiles')
      .select('first_name, last_name, role')
      .eq('id', parsed.data.assignedTo)
      .maybeSingle();
    // Strict chain of command, re-checked here regardless of what the
    // client's dropdown offered — the dropdown options alone are not a
    // security boundary. Only the CEO can assign to anyone; everyone else
    // (including an Administrative Manager reporting their own issue) is
    // restricted to allowedAssigneeRoles.
    if (!isCeo && (!target || !allowedAssigneeRoles(profile.role).includes(target.role))) {
      return { error: 'invalidAssignee' };
    }
    if (!target) return { error: 'invalidAssignee' };
    assignedTo = parsed.data.assignedTo;
    assigneeProfile = target;
  }

  // Defense in depth: the storage RLS already scopes uploads to the
  // uploader's own folder, but double-check here too rather than trusting
  // a client-supplied path unconditionally.
  const voiceUrl =
    parsed.data.voiceUrl && parsed.data.voiceUrl.startsWith(`${user.id}/`) ? parsed.data.voiceUrl : null;

  const { error } = await supabase.from('issues').insert({
    created_by: user.id,
    title: parsed.data.title,
    description: parsed.data.description || null,
    assigned_to: assignedTo,
    voice_url: voiceUrl,
  });
  if (error) return { error: 'createFailed' };

  revalidatePath('/[locale]/issues', 'page');

  // Fire-and-forget notification — never let a Telegram hiccup affect the
  // response to the person who just submitted the issue. Scoped to
  // teacher-authored issues per the spec: notify the reporter (as a
  // receipt) plus every connected CEO and Administrative Manager, since a
  // teacher's issue always needs visibility at that level regardless of
  // which single person they picked in "Assign to".
  if (profile.role === 'teacher') {
    void notifyIssueCreated({
      title: parsed.data.title,
      reporterName: `${profile.first_name} ${profile.last_name}`,
      reporterTelegramId: profile.telegram_id,
      assigneeName: assigneeProfile ? `${assigneeProfile.first_name} ${assigneeProfile.last_name}` : null,
      supabase,
    });
  }

  return {};
}

async function notifyIssueCreated({
  title,
  reporterName,
  reporterTelegramId,
  assigneeName,
  supabase,
}: {
  title: string;
  reporterName: string;
  reporterTelegramId: number | null;
  assigneeName: string | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  try {
    const { data: admins } = await supabase
      .from('profiles')
      .select('telegram_id')
      .in('role', ['ceo', 'admin_manager'])
      .not('telegram_id', 'is', null);
    console.log('Users retrieved from DB for notifications:', admins);

    const text = [
      `<b>Yangi murojaat:</b> ${escapeTelegramText(title)}`,
      `<b>Kimdan:</b> ${escapeTelegramText(reporterName)}`,
      `<b>Kimga:</b> ${assigneeName ? escapeTelegramText(assigneeName) : 'Belgilanmagan'}`,
    ].join('\n');

    const chatIds = [reporterTelegramId, ...(admins ?? []).map((a) => a.telegram_id)];
    await sendTelegramMessageToMany(chatIds, text);
  } catch (error) {
    console.error('Telegram Notification Failed:', error instanceof Error ? error.message : error);
  }
}

const uploadUrlSchema = z.object({ fileName: z.string().trim().min(1) });
export type UploadUrlResult = { path?: string; token?: string; error?: string };

/** Mirrors requestChatMediaUploadUrlAction's signed-upload-url pattern
 * exactly, targeting the dedicated issue-voice-notes bucket instead. */
export async function requestIssueVoiceUploadUrlAction(fileName: string): Promise<UploadUrlResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = uploadUrlSchema.safeParse({ fileName });
  if (!parsed.success) return { error: 'invalidInput' };

  const sanitized = parsed.data.fileName.replace(/[^\w.\-]+/g, '_');
  const path = `${user.id}/${crypto.randomUUID()}-${sanitized}`;

  // Path is always scoped to the caller's own id — see the identical
  // admin-client note in requestChatMediaUploadUrlAction.
  const { data, error } = await createAdminClient().storage.from('issue-voice-notes').createSignedUploadUrl(path);
  if (error || !data) return { error: 'uploadFailed' };

  return { path, token: data.token };
}

const STATUSES = ['open', 'in_progress', 'done'] as const;

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
});

export type UpdateIssueStatusResult = { error?: string };

/** The CEO can change the status of any issue. An Administrative Manager
 * (no longer an admin role generally) may only change the status of an
 * issue currently assigned to them — everyone else has no status-change
 * capability here at all. Mirrors the RLS/trigger carve-out on the issues
 * table exactly (see protect_issue_fields). */
export async function updateIssueStatusAction(formData: FormData): Promise<UpdateIssueStatusResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const parsed = updateStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();

  if (profile.role !== 'ceo') {
    const { data: existing } = await supabase
      .from('issues')
      .select('assigned_to')
      .eq('id', parsed.data.id)
      .maybeSingle();
    if (!existing || profile.role !== 'admin_manager' || existing.assigned_to !== user.id) {
      return { error: 'forbidden' };
    }
  }

  const { error } = await supabase
    .from('issues')
    .update({
      status: parsed.data.status,
      resolved_by: parsed.data.status === 'done' ? user.id : null,
      resolved_at: parsed.data.status === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

  logSystemAction(supabase, 'issue.status_change', `Moved issue ${parsed.data.id} to "${parsed.data.status}"`);

  revalidatePath('/[locale]/issues', 'page');
  return {};
}

const deleteIssueSchema = z.object({ id: z.string().uuid() });

export type DeleteIssueResult = { error?: string };

/** Open to the issue's own creator or an admin, at any status — issues_delete
 * mirrors this at the RLS layer, so this lookup is defense in depth, not the
 * only thing standing between an unrelated staff member and someone else's
 * issue. */
export async function deleteIssueAction(formData: FormData): Promise<DeleteIssueResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };
  const isCeo = profile.role === 'ceo';

  const parsed = deleteIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data: issue } = await supabase.from('issues').select('created_by').eq('id', parsed.data.id).maybeSingle();
  if (!issue) return { error: 'notFound' };
  if (!isCeo && issue.created_by !== user.id) return { error: 'forbidden' };

  const { error } = await supabase.from('issues').delete().eq('id', parsed.data.id);
  if (error) return { error: 'deleteFailed' };

  logSystemAction(supabase, 'issue.delete', `Deleted issue ${parsed.data.id}`);

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
 * board / protect_issue_fields trigger — this action only ever touches
 * title/description, matching what that trigger allows a non-admin to
 * change. */
export async function updateIssueAction(
  _prevState: IssueActionState,
  formData: FormData,
): Promise<IssueActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };
  const isCeo = profile.role === 'ceo';

  const parsed = updateIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data: issue } = await supabase.from('issues').select('created_by').eq('id', parsed.data.id).maybeSingle();
  if (!issue) return { error: 'notFound' };
  if (!isCeo && issue.created_by !== user.id) return { error: 'forbidden' };

  const { error } = await supabase
    .from('issues')
    .update({ title: parsed.data.title, description: parsed.data.description || null })
    .eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/issues', 'page');
  return {};
}
