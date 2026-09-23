import { NextResponse } from 'next/server';

// Reached at /staff/api/version (basePath). The proxy matcher excludes
// /api, so this answers without an auth round trip — it carries nothing
// user-specific, only which deployment is serving.
//
// `K_REVISION` is Cloud Run's own env var for the current revision name
// (e.g. "persons-staff-app-00112-4d9"): stable across every instance of
// one deploy, and it changes on every deploy. That's exactly the signal
// VersionWatcher needs to tell "a new version shipped while this tab was
// open" — which is when a Server Action the open page still references
// gets a "Failed to find Server Action" 404 (see the Next.js deployment
// note: action IDs rotate per build). Falls back to a build-time value,
// then 'dev', so local and non-Cloud-Run environments still return
// something stable-per-process.
export const dynamic = 'force-dynamic';

const REVISION = process.env.K_REVISION || process.env.__NEXT_BUILD_ID || 'dev';

export function GET() {
  return NextResponse.json({ revision: REVISION }, { headers: { 'cache-control': 'no-store' } });
}
