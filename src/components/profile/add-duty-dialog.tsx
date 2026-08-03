'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { createDutyAction, type ContractActionState } from '@/lib/actions/contracts';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function AddDutyDialog({
  staffId,
  contracts,
}: {
  staffId: string;
  /** Optional link to a specific contract — duties work standalone too. */
  contracts: { id: string; title: string }[];
}) {
  const t = useTranslations('profile.duties');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ContractActionState, FormData>(
    createDutyAction,
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
            size="sm"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20"
          />
        }
      >
        <Plus className="size-4" />
        {t('addDuty')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addDuty')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="dutyTitle">{t('dutyTitle')}</Label>
            <Input id="dutyTitle" name="title" required maxLength={200} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dutyDescription">{t('dutyDescription')}</Label>
            <Textarea id="dutyDescription" name="description" maxLength={2000} rows={3} />
          </div>
          {contracts.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="contractId">{t('linkedContract')}</Label>
              <Select name="contractId" defaultValue="">
                <SelectTrigger id="contractId" className="w-full">
                  <SelectValue>
                    {(value: string) => {
                      const contract = contracts.find((c) => c.id === value);
                      return contract ? contract.title : t('noContract');
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('noContract')}</SelectItem>
                  {contracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon('loading') : t('addDuty')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
