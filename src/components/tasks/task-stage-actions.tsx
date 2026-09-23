'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCheck, CheckCircle2, Loader2, SendHorizontal, Upload, XCircle } from 'lucide-react';
import {
  approveTaskAction,
  rejectTaskAction,
  requestTaskProofUploadUrlAction,
  submitTaskAction,
  uploadTaskProofAction,
  type RejectTaskState,
} from '@/lib/actions/tasks';
import {
  TASK_ATTACHMENT_MAX_FILE_BYTES,
  TASK_REJECTION_REASON_MAX_LENGTH,
  TASK_REJECTION_REASON_MIN_LENGTH,
  type TaskStatus,
} from '@/lib/task-status';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/**
 * Everything the two sides of a task can *do* to move it along, rendered
 * inline on the card:
 *
 *   assignee, pending/in_progress  → "Submit for review"
 *   CEO, submitted                 → Approve / Reject (reason mandatory)
 *   assignee, awaiting_upload      → upload the proof file, which finishes it
 *
 * Nothing here runs from an effect — every call is behind a click, so there
 * is no dep-array that can re-arm a Server Action (see AGENTS.md).
 */
export function TaskStageActions({
  taskId,
  status,
  requiresProof,
  isAssignee,
  isReviewer,
}: {
  taskId: string;
  status: TaskStatus;
  requiresProof: boolean;
  /** The person the task is assigned to — submits and uploads. */
  isAssignee: boolean;
  /** The CEO who assigned it — approves and rejects. Server re-checks both. */
  isReviewer: boolean;
}) {
  const t = useTranslations('tasks');
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [, rejectFormAction, rejectPending] = useActionState<RejectTaskState, FormData>(
    async (prev, formData) => {
      const result = await rejectTaskAction(prev, formData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
      } else {
        setRejectOpen(false);
        setReason('');
      }
      return result;
    },
    undefined,
  );

  function run(action: () => Promise<{ error?: string } | undefined>) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  function handleSubmitForReview() {
    const formData = new FormData();
    formData.set('id', taskId);
    run(() => submitTaskAction(formData));
  }

  function handleApprove() {
    const formData = new FormData();
    formData.set('id', taskId);
    run(() => approveTaskAction(formData));
  }

  /**
   * Signed-URL upload, the same three beats every other upload in this app
   * uses (see ChatComposer): ask for a URL, PUT the bytes straight to Cloud
   * Storage, then hand the *object path* back to the server. The task only
   * becomes `done` on that third call, so a PUT that fails halfway leaves the
   * task exactly where it was.
   */
  async function handleProofSelected(file: File) {
    if (file.size > TASK_ATTACHMENT_MAX_FILE_BYTES) {
      toast.error(t('errors.fileTooLarge'));
      return;
    }
    setUploading(true);
    try {
      const fileType = file.type || 'application/octet-stream';
      const signed = await requestTaskProofUploadUrlAction(taskId, file.name, fileType);
      if (signed.error || !signed.path || !signed.url) {
        toast.error(t(`errors.${signed.error ?? 'uploadFailed'}`));
        return;
      }

      const response = await fetch(signed.url, {
        method: 'PUT',
        headers: { 'Content-Type': fileType },
        body: file,
      });
      if (!response.ok) {
        toast.error(t('errors.uploadFailed'));
        return;
      }

      const formData = new FormData();
      formData.set('id', taskId);
      formData.set('objectPath', signed.path);
      formData.set('fileName', file.name);
      formData.set('mimeType', fileType);
      const result = await uploadTaskProofAction(formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    } catch (error) {
      console.error('task proof upload failed', error);
      toast.error(t('errors.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const busy = pending || uploading;
  const reasonTooShort = reason.trim().length < TASK_REJECTION_REASON_MIN_LENGTH;

  if (isAssignee && (status === 'pending' || status === 'in_progress')) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={handleSubmitForReview}
        className="h-8 w-full gap-1.5 border-emerald-400/40 bg-emerald-500/15 text-xs text-emerald-100 hover:bg-emerald-500/25"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <SendHorizontal className="size-3.5" />}
        {t('submitForReview')}
        {requiresProof && <span className="text-[10px] opacity-70">· {t('proofRequiredShort')}</span>}
      </Button>
    );
  }

  if (isReviewer && status === 'submitted') {
    return (
      <div className="flex w-full flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || rejectPending}
          onClick={handleApprove}
          className="h-8 flex-1 gap-1.5 bg-emerald-500/85 text-xs text-white hover:bg-emerald-500"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
          {t('approve')}
        </Button>

        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || rejectPending}
                className="h-8 flex-1 gap-1.5 border-red-400/40 bg-red-500/15 text-xs text-red-100 hover:bg-red-500/25"
              />
            }
          >
            <XCircle className="size-3.5" />
            {t('reject')}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('rejectTitle')}</DialogTitle>
            </DialogHeader>
            <form action={rejectFormAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={taskId} />
              <p className="text-sm text-white/70">{t('rejectDescription')}</p>
              <Textarea
                name="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                required
                minLength={TASK_REJECTION_REASON_MIN_LENGTH}
                maxLength={TASK_REJECTION_REASON_MAX_LENGTH}
                placeholder={t('rejectReasonPlaceholder')}
              />
              <p className="text-xs text-white/50">
                {t('rejectReasonHint', { min: TASK_REJECTION_REASON_MIN_LENGTH })}
              </p>
              <DialogFooter>
                <Button type="submit" disabled={rejectPending || reasonTooShort}>
                  {rejectPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {t('rejectConfirm')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (isAssignee && status === 'awaiting_upload') {
    return (
      <div className="flex w-full flex-col gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleProofSelected(file);
          }}
        />
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="h-8 w-full gap-1.5 bg-orange-500/85 text-xs text-white hover:bg-orange-500"
        >
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {uploading ? t('uploadingProof') : t('uploadProof')}
        </Button>
        <p className="text-[11px] text-white/55">{t('uploadProofHint')}</p>
      </div>
    );
  }

  if (isAssignee && status === 'submitted') {
    return (
      <p className="flex w-full items-center gap-1.5 text-[11px] text-amber-200/90">
        <CheckCheck className="size-3.5 shrink-0" />
        {t('waitingForCeo')}
      </p>
    );
  }

  return null;
}
