'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { DatabaseBackup, Loader2 } from 'lucide-react';
import { exportSystemBackupAction } from '@/lib/actions/admin-management';
import { Button } from '@/components/ui/button';

export function SystemHealthSection() {
  const t = useTranslations('settings.systemHealth');
  const [isPending, setIsPending] = useState(false);

  async function handleBackup() {
    setIsPending(true);
    try {
      const result = await exportSystemBackupAction();
      if (result.error || !result.backup) {
        toast.error(t('backupFailed'));
        return;
      }

      const blob = new Blob([JSON.stringify(result.backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `persons-erp-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t('backupComplete'));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-white/70">{t('description')}</p>
      <Button type="button" onClick={handleBackup} disabled={isPending} className="w-fit">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <DatabaseBackup className="size-4" />}
        {isPending ? t('backingUp') : t('backupButton')}
      </Button>
    </div>
  );
}
