import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { LESSON_PLAN_ROLES } from '@/lib/nav';

// Lesson-plan visibility is CEO / Head Teacher / IT Developer (view-only) /
// owning teacher / assigned TA only — the nav item is already hidden for
// everyone else (src/lib/nav.ts); this blocks a direct visit to the URL too.
// Kept as an allowlist matching that nav entry rather than a denylist of the
// roles that lost access, so a future role addition doesn't slip through by
// default.
//
// This check used to live in lesson-plans/page.tsx and
// lesson-plans/[groupId]/page.tsx themselves. Both of those are wrapped by a
// sibling loading.tsx, and redirect() called from a segment that's under a
// loading.tsx Suspense boundary runs in Next's streaming mode (a client-side
// meta-tag redirect instead of a clean HTTP 307) — which was intermittently
// corrupting the client router's cache-node tree on soft navigation and
// surfacing as a React #310 crash (the same "Something went wrong" bug fixed
// for /profile, /finance and /missions — see the comment on
// ProfileDetailContent in profile/[id]/page.tsx). A layout.tsx is not itself
// wrapped by a loading.tsx in the same folder, so doing the redirect here
// instead is a clean, non-streaming HTTP redirect.
export default async function LessonPlansLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getAuthState();
  const locale = await getLocale();

  if (!profile || !LESSON_PLAN_ROLES.includes(profile.role)) {
    redirect({ href: '/dashboard', locale });
  }

  return <>{children}</>;
}
