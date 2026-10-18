import 'server-only';
import { sql } from '@/lib/db/client';

// CRM Telegram lid-boti mantiqi. Xodim botidan (TELEGRAM_BOT_TOKEN) alohida —
// o'z tokeni CRM_BOT_TOKEN. Token/secret keyin env/secret orqali beriladi;
// yo'q bo'lsa handler jim no-op qiladi (webhook baribir 200 qaytaradi).
//
// Webhook'ni ulash (token berilgandan keyin, bir marta):
//   curl "https://api.telegram.org/bot<CRM_BOT_TOKEN>/setWebhook" \
//     -d url="https://www.persons-staffs.uz/staff/api/crm-bot" \
//     -d secret_token="<CRM_BOT_SECRET>"

const TOKEN = process.env.CRM_BOT_TOKEN;
export const CRM_BOT_SECRET = process.env.CRM_BOT_SECRET;

type TgContact = { phone_number?: string; user_id?: number };
type TgMessage = { chat: { id: number }; from?: { id: number }; text?: string; contact?: TgContact };
export type TgUpdate = { message?: TgMessage };

async function tg(method: string, body: Record<string, unknown>): Promise<void> {
  if (!TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('[crm-bot] tg send failed', method, e);
  }
}

const send = (chatId: number, text: string, replyMarkup?: unknown) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });

const CONTACT_KB = {
  keyboard: [[{ text: '📱 Telefon raqamni yuborish', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};
const REMOVE_KB = { remove_keyboard: true };

const last9 = (phone: string) => phone.replace(/\D/g, '').slice(-9);
const looksLikePhone = (t: string) => t.replace(/\D/g, '').length >= 7;

async function welcome(chatId: number) {
  await sql`
    insert into crm_bot_sessions (chat_id, step, phone, updated_at)
    values (${chatId}, 'await_phone', null, now())
    on conflict (chat_id) do update set step = 'await_phone', phone = null, updated_at = now()`;
  await send(
    chatId,
    'Assalomu alaykum! 👋\nPersons Education ga xush kelibsiz.\nRo‘yxatdan o‘tish uchun telefon raqamingizni yuboring 👇',
    CONTACT_KB,
  );
}

export async function handleBotUpdate(update: TgUpdate): Promise<void> {
  const msg = update.message;
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const text = (msg.text ?? '').trim();

  if (text === '/start' || text.startsWith('/start')) {
    await welcome(chatId);
    return;
  }

  const [session] = await sql<{ step: string; phone: string | null }[]>`
    select step, phone from crm_bot_sessions where chat_id = ${chatId}`;
  if (!session) {
    await welcome(chatId); // har qanday xabar oqimni boshlaydi
    return;
  }

  if (session.step === 'await_phone') {
    // Faqat o'z kontaktini qabul qilamiz; yoki yozilgan raqam.
    let phone: string | null = null;
    if (msg.contact?.phone_number && (!msg.contact.user_id || msg.contact.user_id === msg.from?.id)) {
      phone = msg.contact.phone_number;
    } else if (text && looksLikePhone(text)) {
      phone = text;
    }
    if (!phone) {
      await send(chatId, 'Iltimos, telefon raqamingizni pastdagi tugma orqali yuboring yoki yozib qoldiring.', CONTACT_KB);
      return;
    }
    await sql`update crm_bot_sessions set step = 'await_name', phone = ${phone}, updated_at = now() where chat_id = ${chatId}`;
    await send(chatId, 'Rahmat! ✅\nEndi ism va familyangizni yozing (masalan: <b>Ali Valiyev</b>).', REMOVE_KB);
    return;
  }

  if (session.step === 'await_name') {
    const name = text.slice(0, 120);
    if (!name) {
      await send(chatId, 'Iltimos, ism va familyangizni yozing (masalan: Ali Valiyev).');
      return;
    }
    const phone = session.phone ?? '';
    const l9 = last9(phone);
    try {
      // Telefon mavjud o'quvchi/ota-ona kontaktiga mos kelsa — biriktiramiz.
      const [match] = l9
        ? await sql<{ student_id: string; full_name: string }[]>`
            select c.student_id, s.full_name from crm_contacts c
            join crm_students s on s.id = c.student_id
            where s.archived_at is null and right(regexp_replace(c.phone, '[^0-9]', '', 'g'), 9) = ${l9}
            order by (c.kind = 'guardian') desc limit 1`
        : [];
      if (match) {
        await sql`update crm_contacts set telegram_chat_id = ${chatId}
          where student_id = ${match.student_id} and right(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = ${l9}`;
        await send(
          chatId,
          `✅ Siz <b>${match.full_name}</b> ning vakili sifatida ulandingiz.\nMarkazdan davomat, to‘lov va e’lonlar shu yerga keladi.`,
          REMOVE_KB,
        );
      } else {
        await sql`
          insert into crm_leads (section_id, name, phone, source, status, branch, telegram_chat_id)
          values ((select id from crm_lead_sections where archived_at is null order by sort limit 1),
                  ${name}, ${phone}, 'telegram', 'open', 'persons_lc', ${chatId})`;
        await send(chatId, '✅ Arizangiz qabul qilindi!\nTez orada menejerlarimiz siz bilan bog‘lanadi.', REMOVE_KB);
      }
      await sql`update crm_bot_sessions set step = 'done', updated_at = now() where chat_id = ${chatId}`;
    } catch (e) {
      console.error('[crm-bot] resolve failed', e);
      await send(chatId, 'Kechirasiz, texnik xatolik yuz berdi. Birozdan so‘ng qayta urinib ko‘ring.');
    }
    return;
  }

  // step = 'done' yoki noma'lum — qayta boshlash taklifi.
  await send(chatId, 'Qayta ro‘yxatdan o‘tish uchun /start buyrug‘ini yuboring.');
}
