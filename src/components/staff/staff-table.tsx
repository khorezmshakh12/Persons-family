import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Profile } from '@/lib/auth/session';
import { StaffRowActions } from './staff-row-actions';
import { TeacherLevelBadge } from './teacher-level-badge';
import { isLevelReviewDue } from '@/lib/teacher-level';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

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
      'id, first_name, last_name, phone, date_of_birth, role, avatar_url, is_active, created_at, created_by, must_change_password, telegram_id, teacher_level, level_updated_at',
    )
    .order('created_at', { ascending: true });

  return (
    <div className={cn(GLASS_CARD)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('table.name')}</TableHead>
            <TableHead>{t('table.phone')}</TableHead>
            <TableHead>{t('table.role')}</TableHead>
            <TableHead>{t('table.level')}</TableHead>
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
                {person.role === 'teacher' ? (
                  <div className="flex items-center gap-2">
                    <TeacherLevelBadge level={person.teacher_level} />
                    {actingRole === 'ceo' && isLevelReviewDue(person.level_updated_at) && (
                      <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-1 text-[11px] font-semibold text-amber-200">
                        {t('table.reviewDue')}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-white/40">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={person.is_active ? 'default' : 'secondary'}>
                  {person.is_active ? t('status.active') : t('status.inactive')}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <StaffRowActions target={person} currentUserId={currentUserId} actingRole={actingRole} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
