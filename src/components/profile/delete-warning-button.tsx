'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/navigation';
import { deleteWarningAction } from '@/lib/actions/warnings';

/** Remove a warning that was issued by mistake (warnings.manage). */
export function DeleteWarningButton({ warningId, label, confirmText }: { warningId: string; label: string; confirmText: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-full text-au-faint hover:bg-au-card hover:text-au-bad disabled:opacity-50"
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        start(async () => {
          const fd = new FormData();
          fd.set('warningId', warningId);
          const res = await deleteWarningAction({}, fd);
          if (res?.error) return void toast.error(label);
          router.refresh();
        });
      }}
    >
      <Trash2 className="size-4" />
    </button>
  );
}
