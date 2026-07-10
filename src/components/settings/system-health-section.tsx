'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { DatabaseBackup, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export function SystemHealthSection() {
  const t = useTranslations('settings.systemHealth');
  const [isPending, setIsPending] = useState(false);

  async function handleBackup() {
    setIsPending(true);
    try {
      const supabase = createClient();
      // Every query goes through the CEO's own RLS-scoped session — this
      // exports exactly what the CEO can already see across these tables,
      // nothing more (no service-role bypass).
      const [profiles, groups, lessons] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('groups').select('*'),
        supabase.from('course_lessons').select('*'),
      ]);

      if (profiles.error || groups.error || lessons.error) {
        toast.error(t('backupFailed'));
        return;
      }

      const backup = {
        exportedAt: new Date().toISOString(),
        company: 'Persons Education Company',
        profiles: profiles.data,
        groups: groups.data,
        courseLessons: lessons.data,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
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
