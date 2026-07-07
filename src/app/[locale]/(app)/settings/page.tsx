import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { ThemeSelector } from '@/components/theme/theme-selector';
import { CustomBackgroundUpload } from '@/components/theme/custom-background-upload';
import { ProfileSection } from '@/components/settings/profile-section';
import { TelegramConnectSection } from '@/components/settings/telegram-connect-section';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const t = await getTranslations('settings');
  const { user, profile } = await getAuthState();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-6 rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{t('profile.cardTitle')}</h1>
          <p className="text-white/70">{t('profile.cardSubtitle')}</p>
        </div>
        <ProfileSection userId={user!.id} />
      </div>

      <div className="flex flex-col gap-6 rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
            {t('telegram.cardTitle')}
          </h2>
          <p className="text-white/70">{t('telegram.cardSubtitle')}</p>
        </div>
        <TelegramConnectSection isConnected={profile!.telegram_id !== null} />
      </div>

      <div className="flex flex-col gap-6 rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{t('title')}</h2>
          <p className="text-white/70">{t('subtitle')}</p>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white/90">{t('presetsTitle')}</h3>
          <ThemeSelector />
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-6">
          <h3 className="text-sm font-semibold text-white/90">{t('uploadTitle')}</h3>
          <CustomBackgroundUpload />
        </div>
      </div>
    </div>
  );
}
