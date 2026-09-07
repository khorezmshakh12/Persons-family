'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { upsertSalaryNoteAction, type SalaryActionState } from '@/lib/actions/salary';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { springs } from '@/lib/motion';

export function SalaryNoteForm({
  staffId,
  currentComment,
  isCeo,
}: {
  staffId: string;
  currentComment: string;
  isCeo: boolean;
}) {
  const t = useTranslations('salary');
  const tCommon = useTranslations('common');
  const [state, formAction, isPending] = useActionState<SalaryActionState, FormData>(upsertSalaryNoteAction, undefined);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (state?.error) toast.error(t(`errors.${state.error}`));
    else if (state && !state.error) {
      toast.success(t('commentSaved'));
      setEditing(false);
    }
  }, [state, t]);

  if (!isCeo) {
    return currentComment ? <p className="text-sm text-white/70">{currentComment}</p> : null;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {!editing ? (
        <motion.button
          key="view"
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={springs.snappy}
          type="button"
          onClick={() => setEditing(true)}
          className="tap-scale text-left text-sm text-white/70 hover:text-white hover:underline"
        >
          {currentComment || t('totalCommentPlaceholder')}
        </motion.button>
      ) : (
        <motion.form
          key="edit"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={springs.gentle}
          action={formAction}
          className="flex flex-col gap-2 overflow-hidden"
        >
          <input type="hidden" name="staffId" value={staffId} />
          <Textarea
            name="comment"
            defaultValue={currentComment}
            placeholder={t('totalCommentPlaceholder')}
            rows={2}
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isPending} className="w-fit">
              {tCommon('save')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} className="w-fit">
              {tCommon('cancel')}
            </Button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
