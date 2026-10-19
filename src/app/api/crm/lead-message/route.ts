import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';
import { sendToChat } from '@/lib/crm-bot';

export const dynamic = 'force-dynamic';

// Telegram'ga ulangan lidga CRM lid-botidan qo'lda xabar yuborish.
// Yuborilgan xabar crm_messages'ga (out) log qilinadi.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { leadId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const leadId = (body.leadId ?? '').trim();
  const text = (body.text ?? '').trim();
  if (!leadId || !text) return NextResponse.json({ error: 'Lid va matn majburiy' }, { status: 400 });

  try {
    const [lead] = await sql<{ telegram_chat_id: string | null }[]>`
      select telegram_chat_id from crm_leads where id = ${leadId} limit 1`;
    if (!lead) return NextResponse.json({ error: 'Lid topilmadi' }, { status: 400 });
    if (lead.telegram_chat_id == null) return NextResponse.json({ error: 'Bu lidda Telegram ulanmagan' }, { status: 400 });

    const ok = await sendToChat(Number(lead.telegram_chat_id), text);
    await sql`
      insert into crm_messages (lead_id, channel, direction, body, status, sent_at, created_by)
      values (${leadId}, 'telegram', 'out', ${text}, ${ok ? 'sent' : 'failed'}, now(), ${me.id})`;
    if (!ok) return NextResponse.json({ error: 'Telegram’ga yuborib bo‘lmadi (token yoki chat muammosi)' }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] lead message failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
