'use client';

import { useState, useRef, useEffect, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { requestMarketImageUploadUrlAction } from '@/lib/actions/market';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export function MarketImageField({
  name = 'imageUrl',
  defaultValue,
  initialStored,
  disabled = false,
  onUploadingChange,
  className,
}: {
  name?: string;
  defaultValue?: string | null;
  initialStored?: string | null;
  disabled?: boolean;
  onUploadingChange?: (isUploading: boolean) => void;
  className?: string;
}) {
  const t = useTranslations('market');
  const [path, setPath] = useState<string>(initialStored ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(defaultValue ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const handleFileProcess = useCallback(
    async (file: File) => {
      if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
        toast.error(t('errors.invalidImageType'));
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast.error(t('errors.imageTooLarge'));
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setIsUploading(true);
      onUploadingChange?.(true);

      try {
        const result = await requestMarketImageUploadUrlAction(file.name, file.type);
        if (result.error) {
          const errorMsg =
            result.error === 'invalidImageType'
              ? t('errors.invalidImageType')
              : result.error === 'sessionExpired'
                ? t('errors.sessionExpired')
                : result.error === 'forbidden'
                  ? t('errors.forbidden')
                  : t('errors.uploadFailed');
          toast.error(errorMsg);
          return;
        }

        if (!result.url || !result.path) {
          toast.error(t('errors.uploadFailed'));
          return;
        }

        const res = await fetch(result.url, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type,
          },
          body: file,
        });

        if (!res.ok) {
          toast.error(t('errors.uploadFailed'));
          return;
        }

        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }
        const newObjUrl = URL.createObjectURL(file);
        objectUrlRef.current = newObjUrl;

        setPreviewUrl(newObjUrl);
        setPath(result.path);
      } catch (error) {
        console.error('Market image upload error:', error);
        toast.error(t('errors.uploadFailed'));
      } finally {
        setIsUploading(false);
        onUploadingChange?.(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [t, onUploadingChange],
  );

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileProcess(file);
    }
  }

  function handleDragOver(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) {
      setIsDragOver(true);
    }
  }

  function handleDragLeave(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }

  function handleDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled || isUploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileProcess(file);
    }
  }

  function handleRemove() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setPath('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <input type="hidden" name={name} value={path} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        tabIndex={-1}
        className="sr-only"
        disabled={disabled || isUploading}
        onChange={handleFileChange}
      />

      {isUploading ? (
        <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/30 bg-white/5 p-6 text-center">
          <Loader2 className="size-7 animate-spin text-teal-400" />
          <span className="text-sm font-medium text-white">{t('admin.uploading')}</span>
        </div>
      ) : previewUrl ? (
        <div className="group relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/15 bg-white/5 shadow-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Market reward preview"
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-2.5 right-2.5">
            <Button
              type="button"
              variant="destructive"
              size="icon-xs"
              aria-label={t('admin.removeImage')}
              onClick={handleRemove}
              className="bg-black/60 text-white backdrop-blur-md hover:bg-rose-600 border border-white/20 shadow-md transition-colors"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'group flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center transition-all duration-200 outline-none select-none cursor-pointer',
            isDragOver
              ? 'border-teal-400 bg-teal-500/15 ring-2 ring-teal-400/40'
              : 'border-white/25 bg-white/5 hover:border-white/40 hover:bg-white/10 focus-visible:border-teal-400 focus-visible:ring-2 focus-visible:ring-teal-400/50',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          <div className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white/70 group-hover:scale-110 group-hover:text-white transition-transform">
            <ImagePlus className="size-5" />
          </div>
          <span className="text-sm font-medium text-white">{t('admin.imageDropzone')}</span>
          <span className="text-xs text-white/50">{t('admin.imageHint')}</span>
        </button>
      )}
    </div>
  );
}
