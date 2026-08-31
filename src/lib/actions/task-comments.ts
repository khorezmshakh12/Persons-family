'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import { bumpBoardSignal } from '@/lib/gcp/firestoreAdmin';

export type TaskCommentActionState = { error?: string } | undefined;

export type TaskComment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  authorName: string;
  authorAvatarUrl: string | null;
};

/**
 * A task conversation is private to the two people it concerns plus the CEO:
 * the person the task was handed to, the person who handed it over, and the
 * CEO (who assigns everything and oversees every board — spec #1). There is
 * no RLS layer left in this project, so this app-layer check is the only
 * thing standing between a signed-in employee and someone else's task
 * thread — every read *and* write below runs through it.
 */
async function loadCommentableTask(taskId: string, uid: string, role: string | undefined) {
  const [task] = await sql<{ id: string; assigned_to: string; assigned_by: string }[]>`
    select id, assigned_to, assigned_by from tasks where id = ${taskId}
  `;
  if (!task) return null;
  if (role === 'ceo' || task.assigned_to === uid || task.assigned_by === uid) return task;
  return null;
}

const createCommentSchema = z.object({
  taskId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

export async function createTaskCommentAction(
  _prevState: TaskCommentActionState,
  formData: FormData,
): Promise<TaskCommentActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };

  const parsed = createCommentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const task = await loadCommentableTask(parsed.data.taskId, user.id, profile.role);
  if (!task) return { error: 'forbidden' };

  try {
    await sql`
      insert into task_comments (task_id, author_id, body)
      values (${parsed.data.taskId}, ${user.id}, ${parsed.data.body})
    `;
  } catch (error) {
    console.error('createTaskCommentAction failed', error instanceof Error ? error.message : error);
    return { error: 'commentFailed' };
  }

  // The other side of the thread is almost always looking at their own board
  // in a different session — board_signals/tasks is what makes their card
  // pick the new comment up without a manual refresh (see TaskBoard's
  // onSnapshot subscription).
  await bumpBoardSignal('tasks');

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteTaskCommentAction(formData: FormData): Promise<void> {
  const { user, profile } = await getAuthState();
  if (!user) return;

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  // Mirrors deleteLessonCommentAction: your own comment, or anything at all
  // if you're the CEO. Folded into the WHERE clause so a mismatched id
  // simply deletes nothing instead of needing a second round trip.
  const isCeo = profile?.role === 'ceo';
  try {
    await sql`delete from task_comments where id = ${parsed.data.id} and (${isCeo} or author_id = ${user.id})`;
  } catch (error) {
    console.error('deleteTaskCommentAction failed', error instanceof Error ? error.message : error);
    return;
  }

  await bumpBoardSignal('tasks');

  revalidatePath('/[locale]/tasks', 'page');
}

/**
 * Comments are fetched lazily, when the drawer opens, rather than being
 * embedded in every task row the board renders — a board can carry dozens
 * of tasks and almost none of their threads get opened in a given session.
 * Returns [] (never throws) for a caller who may not see this thread, so
 * the client renders an empty drawer rather than leaking existence.
 */
export async function getTaskCommentsAction(taskId: string): Promise<TaskComment[]> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return [];

  const parsed = z.string().uuid().safeParse(taskId);
  if (!parsed.success) return [];

  const task = await loadCommentableTask(parsed.data, user.id, profile.role);
  if (!task) return [];

  const rows = await sql<
    {
      id: string;
      body: string;
      created_at: string;
      author_id: string;
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
    }[]
  >`
    select c.id, c.body, c.created_at, c.author_id,
           p.first_name, p.last_name, p.avatar_url
    from task_comments c
    join profiles p on p.id = c.author_id
    where c.task_id = ${parsed.data}
    order by c.created_at asc
  `;

  // avatar_url is a private bucket path, not a URL — it has to be signed
  // before the browser can load it (see lib/gcp/avatarUrl.ts). One thread
  // is usually a handful of people, so sign each distinct path once.
  const signed = new Map<string, string | null>();
  await Promise.all(
    [...new Set(rows.map((r) => r.avatar_url).filter((p): p is string => Boolean(p)))].map(
      async (path) => signed.set(path, await resolveAvatarUrl(path)),
    ),
  );

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    author_id: row.author_id,
    authorName: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || '—',
    authorAvatarUrl: row.avatar_url ? (signed.get(row.avatar_url) ?? null) : null,
  }));
}
