'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { createNewsAction, type CompanyNewsActionState } from '@/lib/actions/company-news';
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

export function CreateNewsDialog() {
  const t = useTranslations('companyNews');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<CompanyNewsActionState, FormData>(
    createNewsAction,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        {t('addNews')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addNews')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">{t('titleLabel')}</Label>
            <Input id="title" name="title" required maxLength={200} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="content">{t('contentLabel')}</Label>
            <Textarea id="content" name="content" required maxLength={5000} rows={5} />
          </div>
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon('loading') : t('publish')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
