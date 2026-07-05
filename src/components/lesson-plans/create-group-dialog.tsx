'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Plus } from 'lucide-react';
import { createGroupAction, type GroupActionState } from '@/lib/actions/groups';
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

export function CreateGroupDialog() {
  const t = useTranslations('lessonPlans');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<GroupActionState, FormData>(
    createGroupAction,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error && state.groupId) {
      setOpen(false);
      router.push(`/lesson-plans/${state.groupId}`);
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        {t('createGroup')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('createGroup')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{t('groupName')}</Label>
            <Input id="name" name="name" required maxLength={200} placeholder="Matematika A" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="subject">{t('subject')}</Label>
              <Input id="subject" name="subject" maxLength={100} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="level">{t('level')}</Label>
              <Input id="level" name="level" maxLength={100} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="schedule">{t('schedule')}</Label>
              <Input id="schedule" name="schedule" maxLength={200} placeholder="Mon/Wed/Fri 14:00" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="room">{t('room')}</Label>
              <Input id="room" name="room" maxLength={100} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">{t('groupNotes')}</Label>
            <Textarea id="notes" name="notes" maxLength={2000} rows={3} />
          </div>
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon('loading') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
