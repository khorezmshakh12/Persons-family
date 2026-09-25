import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

/** Core v2 now lives inside the site's own sections; old links land on the Dashboard. */
export default async function CorePage() {
  redirect({ href: '/dashboard', locale: await getLocale() });
}
