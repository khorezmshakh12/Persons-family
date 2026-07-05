'use client';

import { useTranslations } from 'next-intl';
import { logoutAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function LogoutButton({ className }: { className?: string }) {
  const t = useTranslations('common');

  return (
    <form action={logoutAction}>
      <Button type="submit" variant="outline" className={cn('w-fit', className)}>
        {t('logout')}
      </Button>
    </form>
  );
}
