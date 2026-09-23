'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { createSignedReadUrl, createSignedWriteUrl } from '@/lib/gcp/storage';
import { bumpBoardSignal } from '@/lib/gcp/firestoreAdmin';
import {
  TASK_ATTACHMENT_PREFIX,
  taskAttachmentKindForMime,
  type TaskAttachmentKind,
} from '@/lib/task-status';

/**
 * File / audio attachments on a task — the CEO's briefing material added at
 * create or edit time, whatever the assignee attaches when they hand the
 * work in, and the mandatory proof file uploaded at `awaiting_upload` (that
 * last one is written by uploadTaskProofAction in ./tasks.ts, because it
 * also has to finish the task; it is read back through here).
 *
 * Storage rules, same as every other bucket in this app:
 *   - the browser PUTs straight to Cloud Storage through a signed URL, so a
 *     real-sized file never touches Next's 1MB Server Action body limit;
 *   - what is persisted is the **object path**, never a signed URL — URLs
 *     expire, paths don't — and reads are re-signed on demand below;
 *   - the path is namespaced `task-attachments/<taskId>/<uploaderId>/…` so
 *     the commit action can re-derive and verify it rather than trusting
 *     whatever the client posts back.
 */

/** Read URLs outlive a drawer session comfortably without being long-lived. */
const ATTACHMENT_READ_URL_EXPIRY_SECONDS = 60 * 60;

export type TaskAttachment = {
  id: string;
  task_id: string;
  uploader_id: string;
  kind: TaskAttachmentKind;
  is_proof: boolean;
  file_name: string | null;
  mime_type: string | null;
  created_at: string;
  uploaderName: string;
  /** Freshly signed at read time from the stored object path. */
  signedUrl: string | null;
};

export type TaskAttachmentActionState = { error?: string } | undefined;
export type TaskAttachmentUploadUrlResult = { path?: string; url?: string; error?: string };

type AccessRow = { assigned_to: string; assigned_by: string };

/**
 * A task's attachments are visible to exactly the two people the board
 * already scopes the task itself to: its assignee and the CEO who assigned
 * it (mirrors getVisibleTasksAction's `assigned_by = … or assigned_to = …`).
 * Re-checked in every action here — a page guard is not enough.
 */
async function requireTaskAccess(
  taskId: string,
): Promise<{ error: string } | { userId: string; task: AccessRow }> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const [task] = await sql<AccessRow[]>`
    select assigned_to, assigned_by from tasks where id = ${taskId}
  `;
  // A task you cannot see is indistinguishable from one that doesn't exist.
  if (!task || (task.assigned_to !== user.id && task.assigned_by !== user.id)) {
    return { error: 'forbidden' };
  }
  return { userId: user.id, task };
}

const uploadUrlSchema = z.object({
  taskId: z.string().uuid(),
  fileName: z.string().trim().min(1),
  fileType: z.string().trim().min(1).max(200),
});

export async function requestTaskAttachmentUploadUrlAction(
  taskId: string,
  fileName: string,
  fileType: string,
): Promise<TaskAttachmentUploadUrlResult> {
  const parsed = uploadUrlSchema.safeParse({ taskId, fileName, fileType });
  if (!parsed.success) return { error: 'invalidInput' };

  const access = await requireTaskAccess(parsed.data.taskId);
  if ('error' in access) return { error: access.error };

  try {
    const sanitized = parsed.data.fileName.replace(/[^\w.\-]+/g, '_');
    const path = `${TASK_ATTACHMENT_PREFIX}/${parsed.data.taskId}/${access.userId}/${crypto.randomUUID()}-${sanitized}`;
    const url = await createSignedWriteUrl('chat_media', path, parsed.data.fileType);
    return { path, url };
  } catch (error) {
    console.error(
      'requestTaskAttachmentUploadUrlAction failed',
      error instanceof Error ? error.message : error,
    );
    return { error: 'uploadFailed' };
  }
}

const addSchema = z.object({
  taskId: z.string().uuid(),
  objectPath: z.string().trim().min(1).max(500),
  fileName: z.string().trim().max(300).optional().or(z.literal('')),
  mimeType: z.string().trim().max(200).optional().or(z.literal('')),
});

/** Commits an upload that already landed in the bucket. */
export async function addTaskAttachmentAction(
  _prevState: TaskAttachmentActionState,
  formData: FormData,
): Promise<TaskAttachmentActionState> {
  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const access = await requireTaskAccess(parsed.data.taskId);
  if ('error' in access) return { error: access.error };

  // Defense in depth: the signed URL already scoped the object to this task
  // and this uploader, but a client-supplied path is never trusted outright.
  const expectedPrefix = `${TASK_ATTACHMENT_PREFIX}/${parsed.data.taskId}/${access.userId}/`;
  if (!parsed.data.objectPath.startsWith(expectedPrefix)) return { error: 'forbidden' };

  const mimeType = parsed.data.mimeType || 'application/octet-stream';
  try {
    await sql`
      insert into task_attachments (task_id, uploader_id, kind, object_path, file_name, mime_type)
      values (${parsed.data.taskId}, ${access.userId}, ${taskAttachmentKindForMime(mimeType)},
              ${parsed.data.objectPath}, ${parsed.data.fileName || null}, ${mimeType})
    `;
  } catch (error) {
    console.error('addTaskAttachmentAction failed', error instanceof Error ? error.message : error);
    return { error: 'uploadFailed' };
  }

  await bumpBoardSignal('tasks');
  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

/**
 * Loaded on demand when the drawer opens, never shipped with every board row
 * — signing N URLs per card on every realtime refresh would be a lot of IAM
 * round trips for panels nobody opened.
 */
export async function getTaskAttachmentsAction(taskId: string): Promise<TaskAttachment[]> {
  const parsed = z.string().uuid().safeParse(taskId);
  if (!parsed.success) return [];

  const access = await requireTaskAccess(parsed.data);
  if ('error' in access) return [];

  let rows: (Omit<TaskAttachment, 'uploaderName' | 'signedUrl'> & {
    object_path: string;
    first_name: string | null;
    last_name: string | null;
  })[];
  try {
    rows = await sql`
      select a.id, a.task_id, a.uploader_id, a.kind, a.is_proof, a.object_path,
             a.file_name, a.mime_type, a.created_at,
             p.first_name, p.last_name
      from task_attachments a
      left join profiles p on p.id = a.uploader_id
      where a.task_id = ${parsed.data}
      order by a.created_at asc
    `;
  } catch (error) {
    console.error(
      'getTaskAttachmentsAction failed',
      error instanceof Error ? error.message : error,
    );
    return [];
  }

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      task_id: row.task_id,
      uploader_id: row.uploader_id,
      kind: row.kind,
      is_proof: row.is_proof,
      file_name: row.file_name,
      mime_type: row.mime_type,
      created_at: row.created_at,
      uploaderName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
      // One bad object must not blank the whole list — the row still renders,
      // just without a working link.
      signedUrl: await createSignedReadUrl(
        'chat_media',
        row.object_path,
        ATTACHMENT_READ_URL_EXPIRY_SECONDS,
      ).catch((error) => {
        console.error('attachment sign failed', error instanceof Error ? error.message : error);
        return null;
      }),
    })),
  );
}

const deleteSchema = z.object({ id: z.string().uuid() });

/**
 * Only the uploader, or the CEO who assigned the task, may remove an
 * attachment. The proof file is deliberately not exempt: if the CEO needs the
 * assignee to redo it, deleting it is how they clear the record — the task's
 * status is unaffected either way.
 *
 * The bucket object is left in place on purpose. `deleteObject` is a second
 * network call that can fail independently of the row, and an orphaned blob
 * nobody can reach a signed URL for is strictly less bad than a dangling row
 * pointing at a deleted object.
 */
export async function deleteTaskAttachmentAction(
  formData: FormData,
): Promise<TaskAttachmentActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const [row] = await sql<{ uploader_id: string; task_id: string; assigned_by: string }[]>`
    select a.uploader_id, a.task_id, t.assigned_by
    from task_attachments a
    join tasks t on t.id = a.task_id
    where a.id = ${parsed.data.id}
  `;
  if (!row) return { error: 'forbidden' };
  if (row.uploader_id !== user.id && row.assigned_by !== user.id) return { error: 'forbidden' };

  try {
    await sql`delete from task_attachments where id = ${parsed.data.id}`;
  } catch (error) {
    console.error(
      'deleteTaskAttachmentAction failed',
      error instanceof Error ? error.message : error,
    );
    return { error: 'deleteFailed' };
  }

  await bumpBoardSignal('tasks');
  revalidatePath('/[locale]/tasks', 'page');
  return {};
}
