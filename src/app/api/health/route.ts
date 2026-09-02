import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

// Reached at /staff/api/health (basePath). The proxy matcher excludes /api,
// so this answers even in maintenance mode — used by the post-deploy smoke
// check and any uptime monitor.
export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  try {
    const [row] = await sql<{ ok: number }[]>`select 1 as ok`;
    return NextResponse.json(
      { status: 'ok', db: row?.ok === 1, ms: Date.now() - started },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { status: 'error', db: false, message: error instanceof Error ? error.message : 'db unreachable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
