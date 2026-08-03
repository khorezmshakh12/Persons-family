'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  attachContractFileAction,
  deleteContractAttachmentAction,
  requestContractFileReadUrlAction,
  requestContractFileUploadUrlAction,
} from '@/lib/actions/contracts';
import { Button } from '@/components/ui/button';

export type ContractAttachment = { id: string; file_name: string; file_type: string | null };

export function ContractAttachmentsList({
  contractId,
  attachments,
  canManage,
}: {
  contractId: string;
  attachments: ContractAttachment[];
  canManage: boolean;
}) {
  const t = useTranslations('profile.contracts');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isDeletePending, startDeleteTransition] = useTransition();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUploading(true);
    try {
      const uploadResult = await requestContractFileUploadUrlAction(contractId, file.name);
      if (uploadResult.error || !uploadResult.path || !uploadResult.token) {
        toast.error(t(`errors.${uploadResult.error ?? 'uploadFailed'}`));
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from('contract-files')
        .uploadToSignedUrl(uploadResult.path, uploadResult.token, file, { contentType: file.type });
      if (uploadError) {
        toast.error(`${t('errors.uploadFailed')}: ${uploadError.message}`);
        return;
      }

      const formData = new FormData();
      formData.set('contractId', contractId);
      formData.set('path', uploadResult.path);
      formData.set('fileName', file.name);
      formData.set('fileType', file.type);
      const attachResult = await attachContractFileAction(undefined, formData);
      if (attachResult?.error) toast.error(t(`errors.${attachResult.error}`));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownload(attachmentId: string) {
    setDownloadingId(attachmentId);
    try {
      const result = await requestContractFileReadUrlAction(attachmentId);
      if (result.error || !result.signedUrl) {
        toast.error(t(`errors.${result.error ?? 'downloadFailed'}`));
        return;
      }
      window.open(result.signedUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloadingId(null);
    }
  }

  function handleDelete(attachmentId: string) {
    startDeleteTransition(async () => {
      const formData = new FormData();
      formData.set('id', attachmentId);
      const result = await deleteContractAttachmentAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-white/60">{t('attachments')}</span>
      {attachments.length === 0 ? (
        <p className="text-xs text-white/40 italic">{t('noAttachments')}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {attachments.map((a) => (
            <div key={a.id} className="group flex items-center gap-2 text-sm">
              <FileText className="size-3.5 shrink-0 text-white/60" />
              <button
                type="button"
                onClick={() => handleDownload(a.id)}
                disabled={downloadingId === a.id}
                className="max-w-60 truncate text-left text-white/85 hover:text-white hover:underline disabled:opacity-50"
                title={a.file_name}
              >
                {a.file_name}
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  disabled={isDeletePending}
                  aria-label={t('deleteAttachment')}
                  className="shrink-0 text-white/30 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-300"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canManage && (
        <div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            disabled={isUploading}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
            className="h-7 w-fit gap-1.5 px-2 text-white/70 hover:text-white"
          >
            {isUploading ? (
              <Upload className="size-3.5 animate-pulse" />
            ) : (
              <Paperclip className="size-3.5" />
            )}
            {t('uploadFile')}
          </Button>
        </div>
      )}
    </div>
  );
}
