import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { ThemeSettingsCard } from '@/components/theme/theme-settings-card';
import { MotionSettingsCard } from '@/components/theme/motion-settings-card';
import { BgSettingsCard } from '@/components/theme/bg-settings-card';
import { ProfileSection } from '@/components/settings/profile-section';
import { TelegramConnectSection } from '@/components/settings/telegram-connect-section';
import { AnnouncementSection } from '@/components/settings/announcement-section';
import { SystemHealthSection } from '@/components/settings/system-health-section';
import { sql } from '@/lib/db/client';
import { can } from '@/lib/permissions';

import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { NotificationsPanel, SecurityPanel } from '@/components/settings/settings-hub';
import type { NotifyKind } from '@/lib/notify-kinds';
export const dynamic = 'force-dynamic';

const SECTIONS = ['profile', 'security', 'notifications', 'appearance', 'telegram', 'system'] as const;
type Section = (typeof SECTIONS)[number];
const LABEL: Record<Section, string> = {
  profile: 'Profil',
  security: 'Xavfsizlik',
  notifications: 'Bildirishnomalar',
  appearance: 'Ko‘rinish',
  telegram: 'Telegram',
  system: 'Tizim (CEO)',
};

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="ms-rise flex flex-col gap-5 rounded-au-card border border-au-line bg-au-card p-6 text-au-ink shadow-au-card">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold tracking-tight text-au-ink">{title}</h2>
        {subtitle && <p className="text-sm text-au-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/** Sozlamalar — one place per concern, with a section menu (sections v6). */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const t = await getTranslations('settings');
  const tTheme = await getTranslations('themeSettings');
  const tMotion = await getTranslations('motionSettings');
  const tBg = await getTranslations('bgSettings');
  const { profile } = await getAuthState();
  const isCeo = can(profile!.role, 'news.publish');
  const q = (await searchParams).s;
  const sections = SECTIONS.filter((k) => k !== 'system' || isCeo);
  const sec: Section = (sections as readonly string[]).includes(q ?? '') ? (q as Section) : 'profile';

  let content: React.ReactNode = null;
  if (sec === 'profile') {
    content = (
      <Card title={t('profile.cardTitle')} subtitle={t('profile.cardSubtitle')}>
        <ProfileSection teacherLevel={profile!.teacher_level} />
      </Card>
    );
  } else if (sec === 'security') {
    const [row] = await sql<{ last_seen_at: string | null; sessions_revoked_at: string | null }[]>`
      select last_seen_at, sessions_revoked_at from profiles where id = ${profile!.id}`;
    content = (
      <Card title="Xavfsizlik" subtitle="Kirish holati va barcha qurilmalardan chiqish. Parolni “Profil” bo‘limida almashtirasiz.">
        <SecurityPanel lastSeen={row?.last_seen_at ?? null} revokedAt={row?.sessions_revoked_at ?? null} mustChange={profile!.must_change_password} />
      </Card>
    );
  } else if (sec === 'notifications') {
    const [row] = await sql<{ muted: string[]; quiet_from: string | null; quiet_to: string | null }[]>`
      select muted, quiet_from::text as quiet_from, quiet_to::text as quiet_to from notification_prefs where user_id = ${profile!.id}`;
    content = (
      <Card title="Bildirishnomalar" subtitle="Telegram’da qaysi xabarlar kelishini o‘zingiz tanlaysiz. Saytdagi belgilar o‘zgarmaydi.">
        <NotificationsPanel
          initial={{ muted: (row?.muted ?? []) as NotifyKind[], quietFrom: row?.quiet_from ?? null, quietTo: row?.quiet_to ?? null }}
          telegram={profile!.telegram_id !== null}
        />
      </Card>
    );
  } else if (sec === 'appearance') {
    content = (
      <>
        <Card title={tTheme('title')} subtitle={tTheme('description')}>
          <ThemeSettingsCard />
        </Card>
        <Card title={tMotion('title')} subtitle={tMotion('description')}>
          <MotionSettingsCard />
        </Card>
        <Card title={tBg('title')} subtitle={tBg('description')}>
          <BgSettingsCard />
        </Card>
      </>
    );
  } else if (sec === 'telegram') {
    content = (
      <Card title={t('telegram.cardTitle')} subtitle={t('telegram.cardSubtitle')}>
        <TelegramConnectSection isConnected={profile!.telegram_id !== null} />
      </Card>
    );
  } else if (sec === 'system' && isCeo) {
    const [row] = await sql<{ message: string }[]>`select message from platform_announcements order by created_at desc limit 1`;
    content = (
      <>
        <Card title={t('announcement.cardTitle')} subtitle={t('announcement.cardSubtitle')}>
          <AnnouncementSection currentMessage={row?.message ?? null} />
        </Card>
        <Card title={t('systemHealth.cardTitle')} subtitle={t('systemHealth.cardSubtitle')}>
          <SystemHealthSection />
        </Card>
      </>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 px-4 pt-1 pb-8 sm:px-7 md:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Sozlamalar" className="flex gap-1 overflow-x-auto md:sticky md:top-4 md:flex-col md:self-start">
        {sections.map((k) => (
          <Link
            key={k}
            href={k === 'profile' ? '/settings' : `/settings?s=${k}`}
            aria-current={sec === k ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-au-ctl px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
              sec === k ? 'bg-au-accent-soft text-au-accent-text' : 'text-au-muted hover:bg-au-card-2 hover:text-au-ink',
            )}
          >
            {LABEL[k]}
          </Link>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-5">{content}</div>
    </div>
  );
}
