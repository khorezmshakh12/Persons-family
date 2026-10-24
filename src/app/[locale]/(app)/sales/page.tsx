import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

/** Sales (Qabul statistikasi) section removed (owner, 2026-10-23) — leads live in Operation HQ › Sales. */
export default async function SalesPage() {
  redirect({ href: '/operations', locale: await getLocale() });
}
