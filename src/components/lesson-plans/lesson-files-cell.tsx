'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import Image from 'next/image';
import { FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  attachLessonMaterialAction,
  removeLessonMaterialAction,
  requestLessonMaterialUploadUrlAction,
} from '@/lib/actions/course-lessons';
import { LESSON_MATERIAL_MAX_FILE_BYTES } from '@/lib/lesson-materials';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export type LessonAttachmentWithUrl = {
  path: string;
  name: string;
  type: string;
  size: number;
  signedUrl: string | null;
};

export function LessonFilesCell({
  lessonId,
  groupId,
  attachments,
  canUpload,
  canDelete,
}: {
  lessonId: string;
  groupId: string;
  attachments: LessonAttachmentWithUrl[];
  /** Only the owning teacher can add new files. */
  canUpload: boolean;
  /** The owning teacher or the CEO can remove an existing file. */
  canDelete: boolean;
}) {
  const t = useTranslations('lessonPlans');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  // The Supabase JS storage client uploads via fetch(), which doesn't expose
  // byte-level progress in the browser — this ramps smoothly toward ~90%
  // while the request is in flight and snaps to 100% on completion, rather
  // than showing a static/frozen bar for a 50MB upload.
  const [progress, setProgress] = useState(0);
  const [isRemovePending, startRemoveTransition] = useTransition();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > LESSON_MATERIAL_MAX_FILE_BYTES) {
      toast.error(t('errors.fileTooLarge'));
      return;
    }

    setIsUploading(true);
    setProgress(8);
    const progressTimer = setInterval(() => {
      setProgress((p) => (p < 90 ? p + (90 - p) * 0.15 : p));
    }, 200);

    try {
      const uploadUrlResult = await requestLessonMaterialUploadUrlAction(lessonId, groupId, file.name);
      if (uploadUrlResult.error || !uploadUrlResult.path || !uploadUrlResult.token) {
        const base = t(`errors.${uploadUrlResult.error ?? 'uploadFailed'}`);
        toast.error(uploadUrlResult.detail ? `${base}: ${uploadUrlResult.detail}` : base);
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from('lesson_materials')
        .uploadToSignedUrl(uploadUrlResult.path, uploadUrlResult.token, file, { contentType: file.type });
      if (uploadError) {
        toast.error(`${t('errors.uploadFailed')}: ${uploadError.message}`);
        return;
      }

      const formData = new FormData();
      formData.set('lessonId', lessonId);
      formData.set('path', uploadUrlResult.path);
      formData.set('name', file.name);
      formData.set('type', file.type);
      formData.set('size', String(file.size));
      const attachResult = await attachLessonMaterialAction(undefined, formData);
      if (attachResult?.error) {
        toast.error(t(`errors.${attachResult.error}`));
        return;
      }

      setProgress(100);
    } finally {
      clearInterval(progressTimer);
      setTimeout(() => {
        setIsUploading(false);
        setProgress(0);
      }, 300);
    }
  }

  function handleRemove(path: string) {
    const formData = new FormData();
    formData.set('lessonId', lessonId);
    formData.set('path', path);
    startRemoveTransition(async () => {
      const result = await removeLessonMaterialAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <div className="flex min-w-40 flex-col gap-1.5">
      {attachments.length === 0 ? (
        <span className="text-xs text-white/40 italic">{t('courseLessons.noFiles')}</span>
      ) : (
        attachments.map((a) => (
          <div key={a.path} className="group flex items-center gap-1.5 text-xs">
            {a.type.startsWith('image/') && a.signedUrl ? (
              <Image
                src={a.signedUrl}
                alt=""
                width={20}
                height={20}
                unoptimized
                className="size-5 shrink-0 rounded object-cover"
              />
            ) : (
              <FileText className="size-3.5 shrink-0 text-white/60" />
            )}
            {a.signedUrl ? (
              <a
                href={a.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="max-w-28 truncate text-white/85 hover:text-white hover:underline"
                title={a.name}
              >
                {a.name}
              </a>
            ) : (
              <span className="max-w-28 truncate text-white/50" title={a.name}>
                {a.name}
              </span>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => handleRemove(a.path)}
                disabled={isRemovePending}
                aria-label={t('courseLessons.remove')}
                className="tap-scale shrink-0 text-white/30 opacity-100 transition-opacity hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))
      )}

      {canUpload && (
        <div className="flex flex-col gap-1">
          <input ref={inputRef} type="file" className="hidden" onChange={handleFileChange} disabled={isUploading} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
            className="h-7 w-fit gap-1.5 px-2 text-white/70 hover:text-white"
          >
            {isUploading ? <Upload className="size-3.5 animate-pulse" /> : <Paperclip className="size-3.5" />}
            {t('courseLessons.upload')}
          </Button>
          {isUploading && <Progress value={progress} className="h-1.5 w-32" />}
        </div>
      )}
    </div>
  );
}
