import { NextResponse } from 'next/server';
import { getAuthState } from '@/lib/auth/session';
import { canSeeFor } from '@/lib/permissions';
import { CRM_HTML_B64 } from './crm-html';

// Serves the "CRM of Persons" standalone page (the persons.schoolup.uz clone)
// for the sidebar link in lib/nav.ts. The page carries student PII, so it is
// NOT a public/ file (those are served unauthenticated) — it is gated here
// exactly like any other section: getAuthState enforces is_active + session
// revocation, and canSeeFor applies the role matrix (CEO / COO / Admin
// Manager, see SECTION_ROLES.crmPersons) plus any per-person override.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { user, profile } = await getAuthState();

  // Not signed in → the app's login, carrying a reason (the proxy bounces a
  // reason-less /login redirect back; see AGENTS.md).
  if (!user || !profile) {
    return NextResponse.redirect(new URL('/staff/uz/login?reason=auth', req.url));
  }
  // Signed in but not one of the three allowed roles → back to the dashboard.
  if (!canSeeFor(profile, 'crmPersons')) {
    return NextResponse.redirect(new URL('/staff/uz/dashboard', req.url));
  }

  const html = Buffer.from(CRM_HTML_B64, 'base64').toString('utf8');
  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Private data — never shared/proxy caches, never disk.
      'cache-control': 'private, no-store, max-age=0',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
