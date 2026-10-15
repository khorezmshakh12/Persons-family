import { NextResponse } from 'next/server';
import { getAuthState } from '@/lib/auth/session';
import { canSeeFor } from '@/lib/permissions';
import { CRM_TEMPLATE_B64, CRM_DATA_MARKER } from './crm-template';
import { loadCrmData } from './data';

// Serves the "CRM of Persons" page for the sidebar link (lib/nav.ts).
// The UI is the reviewed standalone template; the data is now read LIVE from
// the crm_* tables (see ./data.ts) and injected in place of the template's
// external <script src> — so the page reflects the database, not a snapshot.
//
// Student PII, so NOT a public/ file: getAuthState enforces is_active +
// session revocation, canSeeFor applies SECTION_ROLES.crmPersons (CEO/COO).
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { user, profile } = await getAuthState();
  if (!user || !profile) {
    return NextResponse.redirect(new URL('/staff/uz/login?reason=auth', req.url));
  }
  if (!canSeeFor(profile, 'crmPersons')) {
    return NextResponse.redirect(new URL('/staff/uz/dashboard', req.url));
  }

  const template = Buffer.from(CRM_TEMPLATE_B64, 'base64').toString('utf8');
  let data: Awaited<ReturnType<typeof loadCrmData>> | null = null;
  try {
    data = await loadCrmData();
  } catch (e) {
    console.error('[crm] data load failed', e);
  }

  // Escape `<` so no field value can close the <script> tag early.
  const json = data ? JSON.stringify(data).replace(/</g, '\\u003c') : 'null';
  const inlined = `<script>window.CRM=${json};</script>`;
  const html = template.replace(CRM_DATA_MARKER, inlined);

  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store, max-age=0',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
