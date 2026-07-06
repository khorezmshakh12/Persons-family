'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import { updateGroupAction, type GroupActionState } from '@/lib/actions/groups';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TaSelectField, type AssistantOption } from './ta-select-field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

export type GroupConfiguration = {
  subject: string | null;
  level: string | null;
  schedule: string | null;
  room: string | null;
  notes: string | null;
};

export function EditGroupDialog({
  groupId,
  name,
  configuration,
  assignedTaId,
  assistants,
}: {
  groupId: string;
  name: string;
  configuration: GroupConfiguration;
  assignedTaId: string | null;
  assistants: AssistantOption[];
}) {
  const t = useTranslations('lessonPlans');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<GroupActionState, FormData>(
    updateGroupAction,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="border-white/30 bg-white/10 text-white hover:bg-white/20" />}
      >
        <Pencil className="size-4" />
        {t('editGroup')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editGroup')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={groupId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{t('groupName')}</Label>
            <Input id="name" name="name" required maxLength={200} defaultValue={name} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="subject">{t('subject')}</Label>
              <Input id="subject" name="subject" maxLength={100} defaultValue={configuration.subject ?? ''} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="level">{t('level')}</Label>
              <Input id="level" name="level" maxLength={100} defaultValue={configuration.level ?? ''} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="schedule">{t('schedule')}</Label>
              <Input id="schedule" name="schedule" maxLength={200} defaultValue={configuration.schedule ?? ''} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="room">{t('room')}</Label>
              <Input id="room" name="room" maxLength={100} defaultValue={configuration.room ?? ''} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">{t('groupNotes')}</Label>
            <Textarea id="notes" name="notes" maxLength={2000} rows={3} defaultValue={configuration.notes ?? ''} />
          </div>
          <TaSelectField assistants={assistants} defaultValue={assignedTaId ?? 'none'} />
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
