'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeo } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { logSystemAction } from '@/lib/audit-log';

export type AnnouncementActionState = { error?: string } | undefined;

const publishSchema = z.object({ message: z.string().trim().min(1).max(300) });

export async function publishAnnouncementAction(
  _prevState: AnnouncementActionState,
  formData: FormData,
): Promise<AnnouncementActionState> {
  try {
    await requireCeo();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = publishSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  // Only one active banner at a time — publishing a new one replaces
  // whatever's currently showing instead of stacking.
  await supabase.from('platform_announcements').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const { error } = await supabase.from('platform_announcements').insert({ message: parsed.data.message });
  if (error) return { error: 'updateFailed' };

  logSystemAction(supabase, 'announcement.publish', `Published announcement: "${parsed.data.message}"`);

  revalidatePath('/[locale]/settings', 'page');
  return {};
}

export async function clearAnnouncementAction(): Promise<AnnouncementActionState> {
  try {
    await requireCeo();
  } catch {
    return { error: 'forbidden' };
  }

  const supabase = await createClient();
  await supabase.from('platform_announcements').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  logSystemAction(supabase, 'announcement.clear', 'Cleared the active announcement banner');

  revalidatePath('/[locale]/settings', 'page');
  return {};
}
