import 'server-only';
import { signSsoToken } from './token';

// This is a server-to-server call between two Cloud Run services in the
// same GCP region — going out through the public domain (Cloudflare +
// persons-staffs-gateway) would add two extra network hops and make this
// depend on DNS/edge behavior for no reason, so it hits the Materials
// service's own stable *.run.app URL directly instead. basePath ("/materials")
// still applies regardless of which host reaches the app.
const MATERIALS_INTERNAL_URL =
  process.env.MATERIALS_INTERNAL_URL ?? 'https://persons-education-app-946738565039.europe-west3.run.app';

// Whether this phone number matches an active Materials account — used to
// hide the sidebar's "Materials" link for employees who don't have one
// (e.g. media specialists), rather than showing a link that just dumps
// them on Materials' login screen. See src/app/api/sso/materials/route.ts
// for the actual handoff, and Materials' app/api/sso/check/route.ts for
// the other end of this check.
export async function checkMaterialsLink(phone: string): Promise<boolean> {
  try {
    const token = signSsoToken({ phone });
    const res = await fetch(`${MATERIALS_INTERNAL_URL}/materials/api/sso/check?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { linked?: boolean };
    return data.linked === true;
  } catch {
    return false;
  }
}
