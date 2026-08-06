import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { isTelegramConfigured } from '@/lib/telegram';
import { BroadcastForm } from '@/components/telegram/broadcast-form';
import { WebhookRegisterButton } from '@/components/telegram/webhook-register-button';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function TelegramSetupPage() {
  const t = await getTranslations('telegramSetup');
  const { profile } = await getAuthState();
  const supabase = await createClient();

  const { data: staff } = await supabase.from('profiles').select('telegram_id').eq('is_active', true);
  const total = staff?.length ?? 0;
  const connected = (staff ?? []).filter((s) => s.telegram_id !== null).length;
  const configured = isTelegramConfigured();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-8">
      <div className="rounded-3xl border border-white/20 bg-white/10 p-8 text-white shadow-xl backdrop-blur-md">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <p className="mt-1 text-white/70">{t('subtitle')}</p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className={cn('size-2.5 rounded-full', configured ? 'bg-emerald-400' : 'bg-red-400')} />
          <span className="text-sm font-medium">
            {configured ? t('status.configured') : t('status.notConfigured')}
          </span>
        </div>
        <p className="text-sm text-white/70">{t('status.connectedCount', { connected, total })}</p>
        {!configured && <p className="text-xs text-white/50">{t('status.notConfiguredHint')}</p>}
        {(profile!.role === 'ceo' || profile!.role === 'it_developer') && configured && <WebhookRegisterButton />}
      </div>

      {(profile!.role === 'ceo' || profile!.role === 'it_developer') && (
        <div className="flex flex-col gap-4 rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-xl backdrop-blur-md">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
              {t('broadcast.title')}
            </h2>
            <p className="text-sm text-white/70">{t('broadcast.description')}</p>
          </div>
          <BroadcastForm />
        </div>
      )}
    </div>
  );
}
