'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';
import { requireAdmin } from '@/lib/auth/require-admin';

export type IssueActionState = { error?: string } | undefined;

const createIssueSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  // 'none' is the Select's sentinel value for "no assignee" (Base UI's
  // Select doesn't take a plain empty-string item value).
  assignedTo: z.union([z.string().uuid(), z.literal('none'), z.literal('')]).optional(),
});

export async function createIssueAction(
  _prevState: IssueActionState,
  formData: FormData,
): Promise<IssueActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const parsed = createIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const isAdmin = profile.role === 'ceo' || profile.role === 'admin_manager';
  const supabase = await createClient();

  let assignedTo: string | null = null;
  if (parsed.data.assignedTo && parsed.data.assignedTo !== 'none') {
    // Strict chain of command: the CEO and Administrative Manager can
    // delegate to anyone, but every other role may only escalate to an
    // Administrative Manager — never to a peer or any other role. This is
    // re-checked here regardless of what the client's dropdown offered,
    // since the dropdown options alone are not a security boundary.
    if (!isAdmin) {
      const { data: target } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', parsed.data.assignedTo)
        .maybeSingle();
      if (!target || target.role !== 'admin_manager') return { error: 'invalidAssignee' };
    }
    assignedTo = parsed.data.assignedTo;
  }

  const { error } = await supabase.from('issues').insert({
    created_by: user.id,
    title: parsed.data.title,
    description: parsed.data.description || null,
    assigned_to: assignedTo,
  });
  if (error) return { error: 'createFailed' };

  revalidatePath('/[locale]/issues', 'page');
  return {};
}

const STATUSES = ['open', 'in_progress', 'done'] as const;

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
});

export async function updateIssueStatusAction(formData: FormData): Promise<void> {
  let actingUserId: string;
  try {
    const { user } = await requireAdmin();
    actingUserId = user.id;
  } catch {
    return;
  }

  const parsed = updateStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from('issues')
    .update({
      status: parsed.data.status,
      resolved_by: parsed.data.status === 'done' ? actingUserId : null,
      resolved_at: parsed.data.status === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', parsed.data.id);

  revalidatePath('/[locale]/issues', 'page');
}
