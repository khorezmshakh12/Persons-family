'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';

// The chat_messages-specific actions that used to live here (send/delete/
// pin) were retired along with the old /chat page — see
// src/lib/actions/staff-chats.ts for their staff_chats equivalents. This
// toggle is the one thing shared between the two: app_settings.chat_enabled
// is a single global flag, not tied to any one chat table.

const toggleChatEnabledSchema = z.object({ enabled: z.enum(['true', 'false']) });

export async function toggleChatEnabledAction(formData: FormData): Promise<void> {
  const { user, profile } = await getAuthState();
  if (!user || !profile || (profile.role !== 'ceo' && profile.role !== 'admin_manager')) return;

  const parsed = toggleChatEnabledSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from('app_settings')
    .update({
      chat_enabled: parsed.data.enabled === 'true',
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', true);
}
