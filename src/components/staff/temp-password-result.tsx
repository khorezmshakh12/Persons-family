'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function TempPasswordResult({
  tempPassword,
  onDone,
}: {
  tempPassword: string;
  onDone: () => void;
}) {
  const t = useTranslations('staff');
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-medium">{t('tempPasswordTitle')}</h3>
        <p className="text-muted-foreground mt-1 text-sm">{t('tempPasswordDescription')}</p>
      </div>
      <div className="bg-muted flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-sm">
        <span className="flex-1 select-all">{tempPassword}</span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={handleCopy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
      <Button type="button" onClick={onDone} className="ml-auto w-fit">
        {t('done')}
      </Button>
    </div>
  );
}
