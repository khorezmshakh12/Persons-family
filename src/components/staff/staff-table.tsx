import { getTranslations } from 'next-intl/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Profile } from '@/lib/auth/session';
import { StaffRowActions } from './staff-row-actions';

export async function StaffTable({
  staff,
  currentUserId,
  actingRole,
}: {
  staff: Profile[];
  currentUserId: string;
  actingRole: Profile['role'];
}) {
  const t = await getTranslations('staff');

  return (
    <div className="rounded-md border">
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
          {staff.map((person) => (
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
                <StaffRowActions target={person} currentUserId={currentUserId} actingRole={actingRole} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
