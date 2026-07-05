import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Profile } from '@/lib/auth/session';
import type { Database } from '@/lib/supabase/types';
import { StaffRowActions } from './staff-row-actions';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

type StaffPerformance = Database['public']['Tables']['staff_performance']['Row'];

export async function StaffTable({
  currentUserId,
  actingRole,
}: {
  currentUserId: string;
  actingRole: Profile['role'];
}) {
  const t = await getTranslations('staff');
  const supabase = await createClient();

  const { data: staff } = await supabase
    .from('profiles')
    .select(
      'id, first_name, last_name, phone, date_of_birth, role, avatar_url, is_active, created_at, created_by, must_change_password',
    )
    .order('created_at', { ascending: true });

  const { data: performance } = await supabase
    .from('staff_performance')
    .select('id, staff_id, current_tier, months_in_tier, weekly_progress_score, bonus, penalty, notes, updated_at, updated_by');

  const performanceByStaffId: Record<string, StaffPerformance> = Object.fromEntries(
    (performance ?? []).map((row) => [row.staff_id, row]),
  );

  return (
    <div className={cn(GLASS_CARD)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('table.name')}</TableHead>
            <TableHead>{t('table.phone')}</TableHead>
            <TableHead>{t('table.role')}</TableHead>
            <TableHead>{t('table.status')}</TableHead>
            <TableHead className="text-right">{t('table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(staff ?? []).map((person) => (
            <TableRow key={person.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarImage src={person.avatar_url ?? undefined} alt="" />
                    <AvatarFallback>
                      {person.first_name[0]}
                      {person.last_name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span>
                    {person.first_name} {person.last_name}
                  </span>
                </div>
              </TableCell>
              <TableCell>{person.phone}</TableCell>
              <TableCell>{t(`roles.${person.role}`)}</TableCell>
              <TableCell>
                <Badge variant={person.is_active ? 'default' : 'secondary'}>
                  {person.is_active ? t('status.active') : t('status.inactive')}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <StaffRowActions
                  target={person}
                  currentUserId={currentUserId}
                  actingRole={actingRole}
                  performance={performanceByStaffId[person.id] ?? null}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
