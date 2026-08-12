import { getAuthState } from '@/lib/auth/session';
import { ProfileDetailContent } from './[id]/page';

export const dynamic = 'force-dynamic';

// "My Profile" from the sidebar renders the caller's own profile in place
// rather than redirect()-ing to /profile/[id] — see the comment on
// ProfileDetailContent for why that redirect was crashing the client
// router under Next 16.
export default async function ProfilePage() {
  const { user } = await getAuthState();
  return <ProfileDetailContent id={user!.id} />;
}
