import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { ThemeSettingsCard } from '@/components/theme/theme-settings-card';
import { ProfileSection } from '@/components/settings/profile-section';
import { TelegramConnectSection } from '@/components/settings/telegram-connect-section';
import { AnnouncementSection } from '@/components/settings/announcement-section';
import { SystemHealthSection } from '@/components/settings/system-health-section';
import { sql } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const t = await getTranslations('settings');
  const tTheme = await getTranslations('themeSettings');
  const { profile } = await getAuthState();
  const isCeo = profile!.role === 'ceo';

  let currentAnnouncement: string | null = null;
  if (isCeo) {
    const [row] = await sql<{ message: string }[]>`
      select message from platform_announcements order by created_at desc limit 1
    `;
    currentAnnouncement = row?.message ?? null;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-1 pb-8 sm:px-7">
      <div className="flex flex-col gap-6 rounded-au-card border border-au-line bg-au-card p-6 text-au-ink shadow-au-card">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-au-ink">{t('profile.cardTitle')}</h1>
          <p className="text-au-muted">{t('profile.cardSubtitle')}</p>
        </div>
        <ProfileSection teacherLevel={profile!.teacher_level} />
      </div>

      <div className="flex flex-col gap-6 rounded-au-card border border-au-line bg-au-card p-6 text-au-ink shadow-au-card">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight font-heading text-au-ink">
            {t('telegram.cardTitle')}
          </h2>
          <p className="text-au-muted">{t('telegram.cardSubtitle')}</p>
        </div>
        <TelegramConnectSection isConnected={profile!.telegram_id !== null} />
      </div>

      {isCeo && (
        <div className="flex flex-col gap-6 rounded-au-card border border-au-line bg-au-card p-6 text-au-ink shadow-au-card">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold tracking-tight font-heading text-au-ink">
              {t('announcement.cardTitle')}
            </h2>
            <p className="text-au-muted">{t('announcement.cardSubtitle')}</p>
          </div>
          <AnnouncementSection currentMessage={currentAnnouncement} />
        </div>
      )}

      {isCeo && (
        <div className="flex flex-col gap-6 rounded-au-card border border-au-line bg-au-card p-6 text-au-ink shadow-au-card">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold tracking-tight font-heading text-au-ink">
              {t('systemHealth.cardTitle')}
            </h2>
            <p className="text-au-muted">{t('systemHealth.cardSubtitle')}</p>
          </div>
          <SystemHealthSection />
        </div>
      )}

      <div className="flex flex-col gap-6 rounded-au-card border border-au-line bg-au-card p-6 text-au-ink shadow-au-card">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight font-heading text-au-ink">{tTheme('title')}</h2>
          <p className="text-au-muted">{tTheme('description')}</p>
        </div>
        <ThemeSettingsCard />
      </div>
    </div>
  );
}
