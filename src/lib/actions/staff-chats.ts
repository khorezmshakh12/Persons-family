'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthState } from '@/lib/auth/session';

export type StaffChatsActionState = { error?: string } | undefined;
export type UploadUrlResult = { path?: string; token?: string; error?: string };

const MEDIA_TYPES = ['image', 'video', 'voice', 'none'] as const;

const sendSchema = z
  .object({
    receiverId: z.string().uuid().optional().or(z.literal('')),
    messageText: z.string().trim().max(2000).optional().or(z.literal('')),
    mediaUrl: z.string().max(1000).optional().or(z.literal('')),
    mediaType: z.enum(MEDIA_TYPES).optional(),
  })
  .refine((data) => Boolean(data.messageText) || Boolean(data.mediaUrl), {
    message: 'invalidMessage',
  });

export async function sendStaffChatAction(
  _prevState: StaffChatsActionState,
  formData: FormData,
): Promise<StaffChatsActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = sendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidMessage' };

  const supabase = await createClient();
  const { error } = await supabase.from('staff_chats').insert({
    sender_id: user.id,
    receiver_id: parsed.data.receiverId || null,
    message_text: parsed.data.messageText || null,
    media_url: parsed.data.mediaUrl || null,
    media_type: parsed.data.mediaUrl ? (parsed.data.mediaType ?? 'none') : 'none',
  });
  if (error) return { error: 'sendFailed' };

  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteStaffChatAction(formData: FormData): Promise<void> {
  const { user } = await getAuthState();
  if (!user) return;

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  // RLS covers both self-delete and (Family Chat only) admin-delete —
  // no need to branch on role here.
  await supabase.from('staff_chats').delete().eq('id', parsed.data.id);
}

const pinSchema = z.object({ id: z.string().uuid(), pin: z.enum(['true', 'false']) });

/** Family Chat only — RLS's staff_chats_update_admin_family policy silently
 * no-ops this against a DM row (receiver_id is not null), so there's no
 * separate check needed here for which chat a message belongs to. */
export async function toggleStaffChatPinAction(formData: FormData): Promise<void> {
  const { profile } = await getAuthState();
  if (!profile || (profile.role !== 'ceo' && profile.role !== 'admin_manager')) return;

  const parsed = pinSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from('staff_chats')
    .update({ pinned_at: parsed.data.pin === 'true' ? new Date().toISOString() : null })
    .eq('id', parsed.data.id);
}

const uploadUrlSchema = z.object({ fileName: z.string().trim().min(1) });

/**
 * Issues a signed upload URL so the browser sends the file straight to
 * Supabase Storage — never through this Next.js server — avoiding both
 * Next's default 1MB Server Action body limit and Vercel's 4.5MB
 * serverless payload cap. Files are stored under the uploader's own id for
 * attribution, matching every other bucket's convention in this app.
 */
export async function requestChatMediaUploadUrlAction(fileName: string): Promise<UploadUrlResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = uploadUrlSchema.safeParse({ fileName });
  if (!parsed.success) return { error: 'invalidInput' };

  const sanitized = parsed.data.fileName.replace(/[^\w.\-]+/g, '_');
  const path = `${user.id}/${crypto.randomUUID()}-${sanitized}`;

  // Path is always scoped to the caller's own id, so the admin client (which
  // bypasses storage RLS — currently missing its INSERT policies on the new
  // Frankfurt project) doesn't widen access beyond what the user already had.
  const { data, error } = await createAdminClient().storage.from('chat_media').createSignedUploadUrl(path);
  if (error || !data) return { error: 'uploadFailed' };

  return { path, token: data.token };
}
