'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Upload } from 'lucide-react';
import { useBackground } from './background-context';
import { MAX_UPLOAD_BYTES } from '@/lib/background-themes';
import { Button } from '@/components/ui/button';

export function CustomBackgroundUpload() {
  const t = useTranslations('settings');
  const { setBackgroundUrl } = useBackground();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('invalidType');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('tooLarge');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const saveResult = setBackgroundUrl(result);
        if (saveResult?.error) setError(saveResult.error);
      }
    };
    reader.onerror = () => setError('readFailed');
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        className="w-fit border-white/30 bg-white/10 text-white hover:bg-white/20"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        {t('upload.button')}
      </Button>
      <p className="text-xs text-white/60">{t('upload.hint')}</p>
      {error && <p className="text-sm text-red-300">{t(`upload.errors.${error}`)}</p>}
    </div>
  );
}
