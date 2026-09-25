import { NextResponse } from 'next/server';
import { getAuthState } from '@/lib/auth/session';
import { applyCorePatch, loadCore } from '@/lib/core-state';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { profile } = await getAuthState();
  if (!profile) return NextResponse.json({ error: 'sessionExpired' }, { status: 401 });
  try {
    const { state } = await loadCore(profile);
    return NextResponse.json({ state });
  } catch {
    return NextResponse.json({ error: 'loadFailed' }, { status: 500 });
  }
}

/** Body: { patch: changed top-level keys of Core's S, prevTasks?: tasks before the change } */
export async function PUT(req: Request) {
  const { profile } = await getAuthState();
  if (!profile) return NextResponse.json({ errors: ['Sessiya tugagan — qayta kiring'] }, { status: 401 });
  let body: { patch?: Record<string, unknown>; prevTasks?: never[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errors: ["Noto'g'ri so'rov"] }, { status: 400 });
  }
  if (!body.patch || typeof body.patch !== 'object' || JSON.stringify(body.patch).length > 5_000_000) {
    return NextResponse.json({ errors: ["Noto'g'ri so'rov"] }, { status: 400 });
  }
  try {
    const errors = await applyCorePatch(profile, body.patch, body.prevTasks);
    const needFresh = 'tasks' in body.patch || 'staff' in body.patch;
    return NextResponse.json({ errors, state: needFresh ? (await loadCore(profile)).state : undefined });
  } catch (e) {
    console.error('core PUT failed', e instanceof Error ? e.message : e);
    return NextResponse.json({ errors: ["Saqlab bo'lmadi"] }, { status: 500 });
  }
}
