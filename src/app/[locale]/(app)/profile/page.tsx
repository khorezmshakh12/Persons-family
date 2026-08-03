import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';

// "My Profile" from the sidebar always resolves to the caller's own id —
// same redirect-to-a-real-route precedent as performance/page.tsx.
export default async function ProfilePage() {
  const { user } = await getAuthState();
  const locale = await getLocale();
  redirect({ href: `/profile/${user!.id}`, locale });
}
