import { NextResponse } from 'next/server';
import { CRM_BOT_SECRET, handleBotUpdate, type TgUpdate } from '@/lib/crm-bot';

export const dynamic = 'force-dynamic';

// CRM Telegram lid-boti webhook'i. PUBLIC (proxy /api'ni chetlab o'tadi) —
// Telegram'ning secret_token header'i bilan tekshiriladi. Doim 200 qaytaradi.
export async function POST(req: Request) {
  if (CRM_BOT_SECRET) {
    const got = req.headers.get('x-telegram-bot-api-secret-token');
    if (got !== CRM_BOT_SECRET) return new NextResponse('ok', { status: 200 }); // jimgina rad
  }
  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return new NextResponse('ok', { status: 200 });
  }
  try {
    await handleBotUpdate(update);
  } catch (e) {
    console.error('[crm-bot] handler failed', e);
  }
  return new NextResponse('ok', { status: 200 });
}
