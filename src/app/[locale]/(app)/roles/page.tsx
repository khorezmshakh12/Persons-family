import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

/** Positions now live in Platform settings. */
export default async function RolesPage() {
  redirect({ href: '/platform?tab=roles', locale: await getLocale() });
}
