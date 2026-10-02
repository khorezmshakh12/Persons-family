import { getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { isTelegramConfigured } from '@/lib/telegram';
import { BroadcastForm } from '@/components/telegram/broadcast-form';
import { WebhookRegisterButton } from '@/components/telegram/webhook-register-button';
import { cn } from '@/lib/utils';
import { Page, PageHeader } from '@/components/app-shell/page';

export const dynamic = 'force-dynamic';

export default async function TelegramSetupPage() {
  const t = await getTranslations('telegramSetup');

  const staff = await sql<{ telegram_id: number | null }[]>`
    select telegram_id from profiles where is_active = true
  `;
  const total = staff.length;
  const connected = staff.filter((s) => s.telegram_id !== null).length;
  const configured = isTelegramConfigured();

  return (
    <Page width="narrow">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="flex flex-col gap-4 rounded-au-card border border-au-line bg-au-card p-6 text-au-ink shadow-au-card">
        <div className="flex items-center gap-2">
          <span className={cn('size-2.5 rounded-full', configured ? 'bg-emerald-400' : 'bg-red-400')} />
          <span className="text-sm font-medium">
            {configured ? t('status.configured') : t('status.notConfigured')}
          </span>
        </div>
        <p className="text-sm text-au-muted">{t('status.connectedCount', { connected, total })}</p>
        {!configured && <p className="text-xs text-au-muted">{t('status.notConfiguredHint')}</p>}
        {configured && <WebhookRegisterButton />}
      </div>

      <div className="flex flex-col gap-4 rounded-au-card border border-au-line bg-au-card p-6 text-au-ink shadow-au-card">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold text-au-ink">
            {t('broadcast.title')}
          </h2>
          <p className="text-sm text-au-muted">{t('broadcast.description')}</p>
        </div>
        <BroadcastForm />
      </div>
    </Page>
  );
}
