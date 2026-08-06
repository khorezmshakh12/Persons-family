import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AdminRowActions } from './admin-row-actions';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

// CEO-exclusive by design — the parent page only renders this for a CEO,
// but this check is repeated here too (defense in depth, matching every
// Server Action in this app re-checking authorization instead of trusting
// the page-level gate alone).
export async function AdminManagementSection() {
  const t = await getTranslations('staff');
  const { profile } = await getAuthState();
  if (profile?.role !== 'ceo') return null;

  const supabase = await createClient();
  const { data: admins } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, phone, avatar_url, is_active')
    .eq('role', 'admin_manager')
    .order('first_name', { ascending: true });

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-lg font-medium">{t('adminManagement.title')}</h2>
        <p className="text-sm text-white/60">{t('adminManagement.subtitle')}</p>
      </div>

      {!admins || admins.length === 0 ? (
        <p className="text-sm text-white/70">{t('adminManagement.noAdmins')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {admins.map((admin) => {
            const initials = `${admin.first_name[0]}${admin.last_name[0]}`;
            return (
              <div
                key={admin.id}
                className="flex flex-col gap-3 rounded-xl border border-white/15 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="size-10 shrink-0">
                    <AvatarImage src={admin.avatar_url ?? undefined} alt="" />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {admin.first_name} {admin.last_name}
                    </span>
                    <span className="text-xs text-white/50">{admin.phone}</span>
                  </div>
                  <Badge variant="tint" tint={admin.is_active ? 'green' : 'slate'}>
                    {admin.is_active ? t('status.active') : t('status.inactive')}
                  </Badge>
                </div>
                <AdminRowActions
                  adminId={admin.id}
                  adminName={`${admin.first_name} ${admin.last_name}`}
                  isActive={admin.is_active}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
