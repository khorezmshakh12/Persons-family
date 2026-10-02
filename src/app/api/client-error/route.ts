import { NextResponse } from 'next/server';
import { getAuthState } from '@/lib/auth/session';
import { logSystemAction } from '@/lib/audit-log';

// Browser errors from signed-in pages (components/app-shell/error-reporter.tsx)
// land in system_logs as 'client.error', so a crash a staff member hits is
// visible without them having to report it. Signed-in only, size-capped, and
// throttled per instance so a looping error can't flood the table.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
let windowStart = 0;
let count = 0;

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

export async function POST(request: Request) {
  const { user } = await getAuthState();
  if (!user) return new NextResponse(null, { status: 204 });

  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    count = 0;
  }
  if (++count > MAX_PER_WINDOW) return new NextResponse(null, { status: 204 });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const message = clip(body.message, 500);
  if (!message) return new NextResponse(null, { status: 400 });

  logSystemAction(
    'client.error',
    `${message}\npath: ${clip(body.path, 200)}\nua: ${clip(request.headers.get('user-agent'), 160)}\n${clip(body.stack, 1500)}`,
  );
  return new NextResponse(null, { status: 204 });
}
