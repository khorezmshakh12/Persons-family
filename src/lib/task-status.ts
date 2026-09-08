/**
 * The task lifecycle, in one place, importable from both server and client
 * code (no `server-only`, no `use client` — plain constants).
 *
 * ```
 *   pending ─▶ in_progress ─▶ submitted ─▶ done
 *                    ▲            │  └▶ awaiting_upload ─▶ done
 *                    └── reject ──┘
 * ```
 *
 * `done` stopped being something the assignee can reach on their own (see
 * updateTaskStatusAction): dragging a card into the done column parks it at
 * `submitted`, and only the CEO's approval — plus the proof upload, when the
 * task was flagged `requires_proof` — carries it the rest of the way.
 */
export const TASK_STATUSES = [
  'pending',
  'in_progress',
  'submitted',
  'awaiting_upload',
  'done',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * The columns the board renders, left to right. Same order as the lifecycle.
 */
export const TASK_COLUMNS: readonly TaskStatus[] = TASK_STATUSES;

/**
 * The only statuses a drag may *target*. `submitted` and `awaiting_upload`
 * are reached by the workflow actions, never by dropping a card, and `done`
 * is accepted here only to be rewritten to `submitted` server-side.
 */
export const TASK_DRAG_TARGETS = ['pending', 'in_progress', 'done'] as const;

/**
 * Parked on the CEO's desk. The defining property of these two: the clock
 * stops. No late star penalty is applied while a task sits here — not by
 * updateTaskStatusAction and not by the task-overdue-penalties cron — because
 * the assignee has already handed the work in and the delay is now the
 * reviewer's. The CEO's verdict is what decides late vs on time.
 */
export const TASK_UNDER_REVIEW_STATUSES: readonly TaskStatus[] = ['submitted', 'awaiting_upload'];

export function isTaskUnderReview(status: string): boolean {
  return (TASK_UNDER_REVIEW_STATUSES as readonly string[]).includes(status);
}

/**
 * Statuses that still count as "the assignee owes work" — what `is_overdue`,
 * the deadline reminder and the overdue-penalty cron all key off. Note this
 * excludes the two review states as well as `done`.
 */
export const TASK_OPEN_STATUSES: readonly TaskStatus[] = ['pending', 'in_progress'];

/** Minimum length of the CEO's mandatory rejection reason. */
export const TASK_REJECTION_REASON_MIN_LENGTH = 10;
export const TASK_REJECTION_REASON_MAX_LENGTH = 1000;

/**
 * Cloud Storage prefix for every task file. Uploads reuse the existing
 * `chat_media` bucket under this prefix rather than a new bucket key,
 * because the bucket registry lives in `src/lib/gcp/storage.ts` — a file this
 * change is not allowed to touch. Flagged in the PR: if a dedicated
 * `task-attachments` bucket is wanted, adding the key there and swapping the
 * two `createSigned*Url` bucket arguments is the whole change.
 */
export const TASK_ATTACHMENT_PREFIX = 'task-attachments';

/** Server- and client-side pre-check; the bucket's own limit is authoritative. */
export const TASK_ATTACHMENT_MAX_FILE_BYTES = 50 * 1024 * 1024;

/** `kind` on task_attachments — audio gets an inline player, everything else a link. */
export type TaskAttachmentKind = 'file' | 'audio';

export function taskAttachmentKindForMime(mime: string): TaskAttachmentKind {
  return mime.startsWith('audio/') ? 'audio' : 'file';
}
