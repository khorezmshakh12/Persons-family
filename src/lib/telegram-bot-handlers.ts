import { telegramBot } from './telegram';
import { sql } from './db/client';

// Registered once at module load (the webhook route imports this module
// purely for this side effect) rather than inside the request handler —
// Telegraf composes handlers as middleware, so re-registering on every
// request on a warm serverless instance would stack duplicate handlers and
// fire them more than once per update.
if (telegramBot) {
  telegramBot.start(async (ctx) => {
    const token = ctx.startPayload;
    if (!token) {
      await ctx.reply(
        "Ushbu botga ulanish uchun Persons Education platformasidagi Sozlamalar bo'limidan shaxsiy havoladan foydalaning.",
      );
      return;
    }

    const [linkRow] = await sql<{ profile_id: string; expires_at: string }[]>`
      select profile_id, expires_at from telegram_link_tokens where token = ${token}
    `;

    if (!linkRow || new Date(linkRow.expires_at) < new Date()) {
      await ctx.reply("Havola muddati o'tgan yoki noto'g'ri. Ilovadan qaytadan urinib ko'ring.");
      return;
    }

    const chatId = ctx.chat.id;
    await sql`update profiles set telegram_id = ${chatId} where id = ${linkRow.profile_id}`;
    await sql`delete from telegram_link_tokens where token = ${token}`;

    const [profile] = await sql<{ first_name: string }[]>`
      select first_name from profiles where id = ${linkRow.profile_id}
    `;

    await ctx.reply(
      `✅ Xush kelibsiz${profile ? `, ${profile.first_name}` : ''}! Telegram hisobingiz Persons Education platformasiga ulandi. Endi muhim bildirishnomalarni shu yerda olasiz.`,
    );
  });

  // Registered after .start() so it only ever sees messages that aren't the
  // /start deep-link (Telegraf stops at the first matching handler). Any
  // message from a group/supergroup the bot is a member of gets that chat's
  // id recorded — this is how the lesson-plan-check cron (and any future
  // group broadcast) finds the team's Telegram group without a manual
  // "paste your chat id" step.
  telegramBot.on('message', async (ctx) => {
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
    await sql`
      insert into telegram_group_chats (chat_id, title) values (${ctx.chat.id}, ${ctx.chat.title ?? null})
      on conflict (chat_id) do update set title = excluded.title
    `;
  });
}
