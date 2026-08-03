import { getTranslations } from 'next-intl/server';
import { Mail, MapPin, Phone, Send, ShieldAlert } from 'lucide-react';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { EditContactInfoDialog } from './edit-contact-info-dialog';

export type ProfileContactInfo = {
  phone: string;
  email: string | null;
  address: string | null;
  emergency_contact: string | null;
  telegram_id: number | null;
};

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-white/50" />
      <div className="flex flex-col">
        <span className="text-xs text-white/50">{label}</span>
        <span className="text-sm text-white">{value}</span>
      </div>
    </div>
  );
}

export async function ContactInfoCard({
  profile,
  isSelf,
}: {
  profile: ProfileContactInfo;
  isSelf: boolean;
}) {
  const t = await getTranslations('profile.contactInfo');

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('title')}
        </h2>
        {isSelf && (
          <EditContactInfoDialog
            defaultEmail={profile.email ?? ''}
            defaultAddress={profile.address ?? ''}
            defaultEmergencyContact={profile.emergency_contact ?? ''}
          />
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Row icon={Phone} label={t('phone')} value={profile.phone} />
        <Row icon={Mail} label={t('email')} value={profile.email || t('notSet')} />
        <Row icon={MapPin} label={t('address')} value={profile.address || t('notSet')} />
        <Row
          icon={ShieldAlert}
          label={t('emergencyContact')}
          value={profile.emergency_contact || t('notSet')}
        />
        <Row
          icon={Send}
          label={t('telegram')}
          value={profile.telegram_id ? t('telegramLinked') : t('telegramNotLinked')}
        />
      </div>
    </div>
  );
}
