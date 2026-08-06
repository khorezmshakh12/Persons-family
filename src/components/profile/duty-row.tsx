'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { deleteDutyAction } from '@/lib/actions/contracts';
import { Badge } from '@/components/ui/badge';

export function DutyRow({
  id,
  title,
  description,
  contractTitle,
  canManage,
}: {
  id: string;
  title: string;
  description: string | null;
  contractTitle: string | null;
  canManage: boolean;
}) {
  const t = useTranslations('profile.duties');
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('id', id);
      const result = await deleteDutyAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-white/15 bg-white/5 p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-white">{title}</span>
          {contractTitle && (
            <Badge variant="tint" tint="slate" className="text-[11px] font-normal text-white/60">
              {contractTitle}
            </Badge>
          )}
        </div>
        {description && <p className="text-sm whitespace-pre-wrap text-white/70">{description}</p>}
      </div>
      {canManage && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          aria-label={t('delete')}
          className="shrink-0 text-white/50 hover:text-red-400 disabled:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}
