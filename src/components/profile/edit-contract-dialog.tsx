'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import { updateContractAction, type ContractActionState } from '@/lib/actions/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type EditableContract = {
  id: string;
  staffId: string;
  title: string;
  startDate: string;
  endDate: string | null;
  status: 'active' | 'frozen' | 'ended';
};

const STATUSES = ['active', 'frozen', 'ended'] as const;

export function EditContractDialog({ contract }: { contract: EditableContract }) {
  const t = useTranslations('profile.contracts');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ContractActionState, FormData>(
    updateContractAction,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t('editContract')}
            className="border-white/30 bg-white/10 text-white hover:bg-white/20"
          />
        }
      >
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editContract')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={contract.id} />
          <input type="hidden" name="staffId" value={contract.staffId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`contractTitle-${contract.id}`}>{t('contractTitle')}</Label>
            <Input
              id={`contractTitle-${contract.id}`}
              name="title"
              defaultValue={contract.title}
              required
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`startDate-${contract.id}`}>{t('startDate')}</Label>
              <Input
                id={`startDate-${contract.id}`}
                name="startDate"
                type="date"
                defaultValue={contract.startDate}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`endDate-${contract.id}`}>{t('endDate')}</Label>
              <Input
                id={`endDate-${contract.id}`}
                name="endDate"
                type="date"
                defaultValue={contract.endDate ?? ''}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`status-${contract.id}`}>{t('statusLabel')}</Label>
            <Select name="status" defaultValue={contract.status}>
              <SelectTrigger id={`status-${contract.id}`} className="w-full">
                <SelectValue>{(value: string) => t(`status.${value}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon('loading') : tCommon('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
