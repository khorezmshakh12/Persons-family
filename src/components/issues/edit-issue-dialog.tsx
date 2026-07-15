'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import { updateIssueAction, type IssueActionState } from '@/lib/actions/issues';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

export type EditableIssue = { id: string; title: string; description: string | null };

/** Title/description only — everything else on an issue (status, assignee,
 * voice note) stays admin-gated through the board itself, matching what
 * updateIssueAction and protect_issue_fields allow a non-admin creator to
 * touch. */
export function EditIssueDialog({ issue }: { issue: EditableIssue }) {
  const t = useTranslations('issues');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<IssueActionState, FormData>(updateIssueAction, undefined);

  useEffect(() => {
    if (state && !state.error) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t('editIssue')}
            className="border-white/30 bg-white/10 text-white hover:bg-white/20"
          />
        }
      >
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editIssue')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={issue.id} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`issue-title-${issue.id}`}>{t('titleLabel')}</Label>
            <Input id={`issue-title-${issue.id}`} name="title" defaultValue={issue.title} required maxLength={200} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`issue-description-${issue.id}`}>{t('descriptionLabel')}</Label>
            <Textarea
              id={`issue-description-${issue.id}`}
              name="description"
              defaultValue={issue.description ?? ''}
              maxLength={2000}
              rows={4}
            />
          </div>
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon('loading') : t('saveChanges')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
