'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { resyncGroupScheduleAction } from '@/lib/actions/groups';
import { Button } from '@/components/ui/button';

/**
 * One-click "make the lesson plan match this group's current odd/even
 * rotation" — see resyncGroupScheduleAction. The automatic reconcile on a
 * schedule change is best-effort and silent; this is the visible recovery
 * path, and it reports back what it did rather than leaving the CEO to
 * guess why some off-rotation days are still on the board.
 */
export function ResyncScheduleButton({ groupId }: { groupId: string }) {
  const t = useTranslations('lessonPlans');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();

  function handleResync() {
    const formData = new FormData();
    formData.set('id', groupId);
    startTransition(async () => {
      const result = await resyncGroupScheduleAction(formData);
      if ('error' in result) {
        toast.error(t(`resync.errors.${result.error}`));
        return;
      }
      // The "kept" count only matters when it's non-zero — an off-rotation
      // day that survived because a teacher already filled it in, which the
      // CEO has to move or delete by hand.
      toast.success(
        result.kept > 0
          ? t('resync.doneWithKept', {
              created: result.created,
              removed: result.removed,
              kept: result.kept,
            })
          : t('resync.done', { created: result.created, removed: result.removed }),
      );
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={handleResync}
      className="border-white/30 bg-white/10 text-white hover:bg-white/20"
    >
      <RefreshCw className={isPending ? 'size-4 animate-spin' : 'size-4'} />
      {isPending ? tCommon('loading') : t('resync.button')}
    </Button>
  );
}
