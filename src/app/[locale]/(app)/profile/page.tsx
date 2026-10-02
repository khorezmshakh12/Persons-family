import { getAuthState } from '@/lib/auth/session';
import { ProfileDetailContent } from './[id]/page';

export const dynamic = 'force-dynamic';

// "My Profile" from the sidebar renders the caller's own profile in place
// rather than redirect()-ing to /profile/[id] — see the comment on
// ProfileDetailContent for why that redirect was crashing the client
// router under Next 16.
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { user } = await getAuthState();
  const { tab } = await searchParams;
  return <ProfileDetailContent id={user!.id} tab={tab} hrefBase="/profile" />;
}
