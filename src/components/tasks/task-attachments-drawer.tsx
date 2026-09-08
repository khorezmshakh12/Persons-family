'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { Download, FileText, Loader2, Paperclip, ShieldCheck, Trash2, Upload } from 'lucide-react';
import {
  addTaskAttachmentAction,
  deleteTaskAttachmentAction,
  getTaskAttachmentsAction,
  requestTaskAttachmentUploadUrlAction,
  type TaskAttachment,
} from '@/lib/actions/task-attachments';
import { TASK_ATTACHMENT_MAX_FILE_BYTES } from '@/lib/task-status';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

/**
 * Files and voice notes hanging off one task — the CEO's briefing material,
 * whatever the assignee attaches, and the proof file that finished the task.
 *
 * Loaded on open, never with the board (see getTaskAttachmentsAction: every
 * row costs an IAM signing round trip, and most cards are never opened).
 * Refreshed after each write from the same handler, never from an effect.
 */
export function TaskAttachmentsDrawer({
  taskId,
  taskTitle,
  currentUserId,
  canManage,
  attachmentCount = 0,
}: {
  taskId: string;
  taskTitle: string;
  currentUserId: string;
  /** Assignee or the assigning CEO. The server re-checks this. */
  canManage: boolean;
  /** Server-rendered count for the closed trigger; the loaded list wins after. */
  attachmentCount?: number;
}) {
  const t = useTranslations('tasks');
  const format = useFormatter();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<TaskAttachment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getTaskAttachmentsAction(taskId));
      setLoaded(true);
    } catch (error) {
      console.error('task attachments load failed', error);
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [taskId, t]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) void refresh();
  }

  async function handleFileSelected(file: File) {
    if (file.size > TASK_ATTACHMENT_MAX_FILE_BYTES) {
      toast.error(t('errors.fileTooLarge'));
      return;
    }
    setUploading(true);
    try {
      const fileType = file.type || 'application/octet-stream';
      const signed = await requestTaskAttachmentUploadUrlAction(taskId, file.name, fileType);
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
      formData.set('taskId', taskId);
      formData.set('objectPath', signed.path);
      formData.set('fileName', file.name);
      formData.set('mimeType', fileType);
      const result = await addTaskAttachmentAction(undefined, formData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      await refresh();
    } catch (error) {
      console.error('task attachment upload failed', error);
      toast.error(t('errors.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleDelete(id: string) {
    // Optimistic removal; a failure is surfaced and the refresh puts it back.
    const previous = items;
    setItems((prev) => prev.filter((item) => item.id !== id));
    startDeleteTransition(async () => {
      const formData = new FormData();
      formData.set('id', id);
      const result = await deleteTaskAttachmentAction(formData);
      if (result?.error) {
        setItems(previous);
        toast.error(t(`errors.${result.error}`));
        return;
      }
      await refresh();
    });
  }

  const count = loaded ? items.length : attachmentCount;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={t('attachments.title')}
            className="h-7 w-fit gap-1.5 rounded-full border-white/20 bg-white/5 px-3 text-xs text-white/70 hover:bg-white/15 hover:text-white"
          />
        }
      >
        <Paperclip className="size-3.5" />
        {count}
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-4 border-white/20 bg-slate-900/95 text-white backdrop-blur-xl sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-white">{t('attachments.title')}</SheetTitle>
          <p className="truncate text-xs text-white/50">{taskTitle}</p>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
          {loading && !loaded ? (
            <p className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 className="size-3.5 animate-spin" />
              {t('attachments.loading')}
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-white/60">{t('attachments.empty')}</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {item.file_name ?? t('attachments.unnamed')}
                    </span>
                    <span className="text-[11px] text-white/50">
                      {item.uploaderName || t('attachments.unknownUploader')} ·{' '}
                      {format.dateTime(new Date(item.created_at), {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  {item.is_proof && (
                    <Badge variant="tint" tint="green" className="shrink-0 gap-1 text-[10px]">
                      <ShieldCheck className="size-3" />
                      {t('attachments.proof')}
                    </Badge>
                  )}
                </div>

                {item.kind === 'audio' && item.signedUrl ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption -- a voice note has no caption track
                  <audio controls preload="none" src={item.signedUrl} className="w-full" />
                ) : null}

                <div className="flex items-center justify-between gap-2">
                  {item.signedUrl ? (
                    <a
                      href={item.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-300 underline underline-offset-2 hover:text-sky-200"
                    >
                      {item.kind === 'audio' ? (
                        <Download className="size-3.5" />
                      ) : (
                        <FileText className="size-3.5" />
                      )}
                      {t('attachments.open')}
                    </a>
                  ) : (
                    <span className="text-xs text-white/40">{t('attachments.unavailable')}</span>
                  )}
                  {(item.uploader_id === currentUserId || canManage) && (
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={deletePending}
                      aria-label={t('attachments.delete')}
                      className="tap-scale shrink-0 text-white/40 transition-colors hover:text-red-300"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {canManage ? (
          <div className="border-t border-white/15 p-4 pt-3">
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFileSelected(file);
              }}
            />
            <Button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full gap-2"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {uploading ? t('attachments.uploading') : t('attachments.add')}
            </Button>
          </div>
        ) : (
          <p className="border-t border-white/15 p-4 pt-3 text-xs text-white/40 italic">
            {t('attachments.viewOnly')}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
