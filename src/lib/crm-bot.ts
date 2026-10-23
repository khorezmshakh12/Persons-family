import 'server-only';
import { sql } from '@/lib/db/client';
import { escapeTelegramText, sendTelegramManyAs } from '@/lib/telegram';

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
type TgMessage = { chat: { id: number }; from?: { id: number; username?: string }; text?: string; contact?: TgContact };
export type TgUpdate = { message?: TgMessage };

// CRM lid-botidan ixtiyoriy chatga xabar yuborish (lead-message route uchun).
// Token yo'q bo'lsa yoki xatolik bo'lsa false qaytaradi.
export async function sendToChat(chatId: number, text: string): Promise<boolean> {
  if (!TOKEN) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return r.ok;
  } catch (e) {
    console.error('[crm-bot] sendToChat failed', e);
    return false;
  }
}

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

// Sales team for bot leads: Office and Sales managers (primary or extra position).
const SALES_ROLES = ['office_manager', 'sales_manager'];

/** Round-robin owner: the sales person who got a bot lead longest ago (none if no team). */
const nextOwner = () => sql<{ id: string }[]>`
  select p.id from profiles p
  where p.is_active and (p.role::text = any(${SALES_ROLES}) or exists (
    select 1 from profile_roles r where r.user_id = p.id and r.role::text = any(${SALES_ROLES})))
  order by (select max(l.created_at) from crm_leads l where l.owner_id = p.id and l.source = 'telegram') asc nulls first, p.created_at
  limit 1`;

/** Speed-to-lead: tell the owner (or the whole sales team) on the staff bot right away. */
async function notifyNewLead(leadId: string, name: string, phone: string) {
  const [owner] = await sql<{ telegram_id: number | null }[]>`
    select p.telegram_id from crm_leads l join profiles p on p.id = l.owner_id where l.id = ${leadId}`;
  const ids = owner?.telegram_id
    ? [owner.telegram_id]
    : (
        await sql<{ telegram_id: number }[]>`
          select distinct p.telegram_id from profiles p where p.is_active and p.telegram_id is not null
            and (p.role::text = any(${SALES_ROLES}) or exists (select 1 from profile_roles r where r.user_id = p.id and r.role::text = any(${SALES_ROLES})))`
      ).map((r) => r.telegram_id);
  if (!ids.length) return;
  await sendTelegramManyAs(
    'report',
    ids,
    `🆕 <b>Yangi lid — Telegram bot</b>\n${escapeTelegramText(name)} · ${escapeTelegramText(phone)}\n\n15 daqiqa ichida bog‘laning: Operation HQ › Sales › Telegram.`,
    { record: false },
  );
}

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
    const username = msg.from?.username ?? null;
    const greeting = `Hurmatli <b>${escapeTelegramText(name)}</b>, sizni oilamizdan ko‘rib turganimizdan xursandmiz! 🎉\nBu bot orqali sizga markazimiz yangiliklari va xabarlari borib turadi.`;
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
        await sql`update crm_contacts set telegram_chat_id = ${chatId}, telegram_username = ${username}
          where student_id = ${match.student_id} and right(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = ${l9}`;
        await send(
          chatId,
          `${greeting}\n\n✅ Siz <b>${escapeTelegramText(match.full_name)}</b> ning vakili sifatida ulandingiz.\nMarkazdan davomat, to‘lov va e’lonlar shu yerga keladi.`,
          REMOVE_KB,
        );
      } else {
        // A lead already on the board with this phone (added by a manager) is
        // linked to this chat instead of opening a duplicate (owner, 2026-10-22).
        const [known] = l9
          ? await sql<{ id: string }[]>`
              select id from crm_leads
              where archived_at is null and right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 9) = ${l9}
              order by created_at desc limit 1`
          : [];
        if (known) {
          await sql`update crm_leads set telegram_chat_id = ${chatId}, telegram_username = ${username},
            name = coalesce(nullif(name, ''), ${name}), updated_at = now() where id = ${known.id}`;
          await sql`insert into crm_lead_log (lead_id, text) values (${known.id}, 'Telegram botga ulandi (telefon raqami orqali)')`;
        } else {
          // section_id = null → Operation HQ › Sales'dagi «Telegram» ustuni (CRM'da «So'rovlar»).
          const [owner] = await nextOwner();
          const [lead] = await sql<{ id: string }[]>`
            insert into crm_leads (section_id, name, phone, source, status, branch, telegram_chat_id, telegram_username, owner_id)
            values (null, ${name}, ${phone}, 'telegram', 'open', 'persons_lc', ${chatId}, ${username}, ${owner?.id ?? null})
            returning id`;
          await sql`insert into crm_lead_log (lead_id, text) values (${lead.id}, 'Telegram botda /start bosib ro‘yxatdan o‘tdi')`;
          await notifyNewLead(lead.id, name, phone).catch((e) => console.error('[crm-bot] notify failed', e));
        }
        await send(chatId, `${greeting}\n\n✅ Arizangiz qabul qilindi!\nTez orada menejerlarimiz siz bilan bog‘lanadi.`, REMOVE_KB);
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
