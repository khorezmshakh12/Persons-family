'use client';

import { useTranslations } from 'next-intl';
import { logoutAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const t = useTranslations('common');

  return (
    <form action={logoutAction}>
      <Button type="submit" variant="outline" className="w-fit">
        {t('logout')}
      </Button>
    </form>
  );
}
