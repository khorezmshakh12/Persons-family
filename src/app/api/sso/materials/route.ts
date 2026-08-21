import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/gcp/session';
import { sql } from '@/lib/db/client';
import { signSsoToken } from '@/lib/sso/token';

// The shared production domain both apps live under (see
// persons-staffs-gateway) — hardcoded like next.config.ts's
// serverActions.allowedOrigins, since it's fixed infrastructure, not
// per-environment config.
const GATEWAY_ORIGIN = 'https://www.persons-staffs.uz';

// Sidebar "Materials" link target (see lib/nav.ts). Mints a short-lived
// handoff token off the already-authenticated Staff session and redirects
// into Materials' own /api/sso, which matches it to a Materials account by
// phone number — see src/lib/sso/token.ts for why this is safe enough for
// an internal handoff despite the two apps having fully separate auth.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${GATEWAY_ORIGIN}/staff/en/login`);
  }

  const [profile] = await sql<{ phone: string }[]>`
    select phone from profiles where id = ${user.uid}
  `;
  if (!profile?.phone) {
    return NextResponse.redirect(`${GATEWAY_ORIGIN}/materials`);
  }

  let token: string;
  try {
    token = signSsoToken({ phone: profile.phone });
  } catch {
    // e.g. SSO_SHARED_SECRET missing — degrade to a plain Materials visit
    // rather than a raw 500.
    return NextResponse.redirect(`${GATEWAY_ORIGIN}/materials`);
  }
  return NextResponse.redirect(`${GATEWAY_ORIGIN}/materials/api/sso?token=${encodeURIComponent(token)}`);
}
