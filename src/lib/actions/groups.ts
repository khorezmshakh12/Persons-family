'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';

export type GroupActionState = { error?: string; groupId?: string } | undefined;

const configurationSchema = z.object({
  subject: z.string().trim().max(100).optional().or(z.literal('')),
  level: z.string().trim().max(100).optional().or(z.literal('')),
  schedule: z.string().trim().max(200).optional().or(z.literal('')),
  room: z.string().trim().max(100).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

const groupSchema = z.object({
  name: z.string().trim().min(1).max(200),
  ...configurationSchema.shape,
});

function buildConfiguration(data: z.infer<typeof configurationSchema>) {
  return {
    subject: data.subject || null,
    level: data.level || null,
    schedule: data.schedule || null,
    room: data.room || null,
    notes: data.notes || null,
  };
}

export async function createGroupAction(
  _prevState: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile || profile.role !== 'teacher') return { error: 'forbidden' };

  const parsed = groupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('groups')
    .insert({
      teacher_id: user.id,
      name: parsed.data.name,
      configuration: buildConfiguration(parsed.data),
    })
    .select('id')
    .single();

  if (error) {
    if (error.message.includes('Group limit reached')) return { error: 'groupLimitReached' };
    return { error: 'createFailed' };
  }

  revalidatePath('/[locale]/lesson-plans', 'page');
  return { groupId: data.id };
}

const updateGroupSchema = groupSchema.extend({ id: z.string().uuid() });

export async function updateGroupAction(
  _prevState: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const parsed = updateGroupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('groups')
    .update({
      name: parsed.data.name,
      configuration: buildConfiguration(parsed.data),
    })
    .eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/lesson-plans', 'page');
  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteGroupAction(formData: FormData): Promise<void> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return;

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.from('groups').delete().eq('id', parsed.data.id);

  revalidatePath('/[locale]/lesson-plans', 'page');
}
