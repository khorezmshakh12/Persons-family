import { telegramBot } from './telegram';
import { createAdminClient } from './supabase/admin';

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

    const admin = createAdminClient();
    const { data: linkRow } = await admin
      .from('telegram_link_tokens')
      .select('profile_id, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (!linkRow || new Date(linkRow.expires_at) < new Date()) {
      await ctx.reply("Havola muddati o'tgan yoki noto'g'ri. Ilovadan qaytadan urinib ko'ring.");
      return;
    }

    const chatId = ctx.chat.id;
    await admin.from('profiles').update({ telegram_id: chatId }).eq('id', linkRow.profile_id);
    await admin.from('telegram_link_tokens').delete().eq('token', token);

    const { data: profile } = await admin
      .from('profiles')
      .select('first_name')
      .eq('id', linkRow.profile_id)
      .maybeSingle();

    await ctx.reply(
      `✅ Xush kelibsiz${profile ? `, ${profile.first_name}` : ''}! Telegram hisobingiz Persons Education platformasiga ulandi. Endi muhim bildirishnomalarni shu yerda olasiz.`,
    );
  });
}
