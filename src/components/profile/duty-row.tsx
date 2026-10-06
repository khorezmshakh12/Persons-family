'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2, Pencil } from 'lucide-react';
import { deleteDutyAction, updateDutyAction, type ContractActionState } from '@/lib/actions/contracts';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useActionState, useEffect } from 'react';

export function DutyRow({
  id,
  title,
  description,
  contractTitle,
  contractId,
  contracts,
  canManage,
}: {
  id: string;
  title: string;
  description: string | null;
  contractTitle: string | null;
  contractId: string | null;
  contracts: { id: string; title: string }[];
  canManage: boolean;
}) {
  const t = useTranslations('profile.duties');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [editState, editFormAction, editIsPending] = useActionState<ContractActionState, FormData>(
    updateDutyAction,
    undefined,
  );

  useEffect(() => {
    if (editState && !editState.error) {
      toast.success(t('dutyUpdated'));
      setEditOpen(false);
    } else if (editState?.error) {
      toast.error(t(`errors.${editState.error}`));
    }
  }, [editState, t]);

  function handleDelete() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('id', id);
      const result = await deleteDutyAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3 rounded-xl border border-au-line bg-au-card-2 p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-au-ink">{title}</span>
            {contractTitle && (
              <Badge variant="tint" tint="slate" className="text-[11px] font-normal text-au-muted">
                {contractTitle}
              </Badge>
            )}
          </div>
          {description && <p className="text-sm whitespace-pre-wrap text-au-muted">{description}</p>}
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              aria-label={t('edit')}
              className="tap-scale text-au-muted hover:text-au-ink disabled:opacity-50"
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              aria-label={t('delete')}
              className="tap-scale text-au-muted hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editDuty')}</DialogTitle>
          </DialogHeader>
          <form action={editFormAction} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={id} />
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edit-title-${id}`}>{t('dutyTitle')}</Label>
              <Input id={`edit-title-${id}`} name="title" defaultValue={title} required maxLength={200} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edit-description-${id}`}>{t('dutyDescription')}</Label>
              <Textarea
                id={`edit-description-${id}`}
                name="description"
                defaultValue={description || ''}
                maxLength={2000}
                rows={3}
              />
            </div>
            {contracts.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`edit-contractId-${id}`}>{t('linkedContract')}</Label>
                <Select name="contractId" defaultValue={contractId || ''}>
                  <SelectTrigger id={`edit-contractId-${id}`} className="w-full">
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
            {editState?.error && <p className="text-destructive text-sm">{t(`errors.${editState.error}`)}</p>}
            <DialogFooter>
              <Button type="submit" disabled={editIsPending}>
                {editIsPending ? tCommon('loading') : 'Tahrirlash'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
