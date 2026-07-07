import { NextRequest, NextResponse } from 'next/server';
import { telegramBot } from '@/lib/telegram';
import '@/lib/telegram-bot-handlers';

// Telegram calls this endpoint directly (not through next-intl's [locale]
// routing), so it lives under the plain (locale-less) app/api tree.
export async function POST(req: NextRequest) {
  if (!telegramBot) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  // Telegram echoes back whatever secret_token we registered via
  // setWebhook on every request — this is what stops anyone else from
  // POSTing a forged "chat_id capture" update to this endpoint.
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const update = await req.json();
  await telegramBot.handleUpdate(update);
  return NextResponse.json({ ok: true });
}
