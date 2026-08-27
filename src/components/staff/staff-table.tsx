import { getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import { Link } from '@/i18n/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OnlineDot } from '@/components/presence/online-dot';
import type { Profile } from '@/lib/auth/session';
import { StaffRowActions } from './staff-row-actions';
import { TeacherLevelBadge } from './teacher-level-badge';
import { InternshipLevelBadge } from './internship-level-badge';
import { isLevelReviewDue } from '@/lib/teacher-level';
import { roleLabel } from '@/lib/roles';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { ExportButtons } from '@/components/export/export-buttons';

export async function StaffTable({
  currentUserId,
  actingRole,
}: {
  currentUserId: string;
  actingRole: Profile['role'];
}) {
  const t = await getTranslations('staff');

  const staffRows = await sql<Profile[]>`
    select id, first_name, last_name, phone, date_of_birth, role, avatar_url, is_active, created_at,
      created_by, must_change_password, telegram_id, teacher_level, level_updated_at, internship_level,
      email, address, emergency_contact
    from profiles order by created_at asc
  `;
  const staff = await Promise.all(
    staffRows.map(async (person) => ({ ...person, avatarUrl: await resolveAvatarUrl(person.avatar_url) })),
  );

  const exportRows = staff.map((person) => ({
    name: `${person.first_name} ${person.last_name}`,
    phone: person.phone,
    role: person.role,
    status: person.is_active ? 'active' : 'inactive',
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <ExportButtons
          filename="staff-directory"
          columns={[
            { header: 'Name', key: 'name' },
            { header: 'Phone', key: 'phone' },
            { header: 'Role', key: 'role' },
            { header: 'Status', key: 'status' },
          ]}
          rows={exportRows}
        />
      </div>
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
            {staff.map((person, index) => (
              <TableRow
                key={person.id}
                style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
                className="animate-fade-in-up"
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <Avatar className="size-8">
                        <AvatarImage src={person.avatarUrl ?? undefined} alt="" />
                        <AvatarFallback>
                          {person.first_name[0]}
                          {person.last_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <OnlineDot
                        userId={person.id}
                        className="absolute right-0 bottom-0 size-2 border border-slate-900"
                      />
                    </div>
                    <Link href={`/profile/${person.id}`} className="hover:underline">
                      {person.first_name} {person.last_name}
                    </Link>
                  </div>
                </TableCell>
                <TableCell>{person.phone}</TableCell>
                <TableCell>{roleLabel(t, person.role)}</TableCell>
                <TableCell>
                  {person.role === 'teacher' && person.teacher_level ? (
                    <div className="flex items-center gap-2">
                      <TeacherLevelBadge level={person.teacher_level} />
                      {actingRole === 'ceo' && person.level_updated_at && isLevelReviewDue(person.level_updated_at) && (
                        <Badge variant="tint" tint="amber">
                          {t('table.reviewDue')}
                        </Badge>
                      )}
                    </div>
                  ) : person.role === 'internship' && person.internship_level ? (
                    <InternshipLevelBadge level={person.internship_level} />
                  ) : (
                    <span className="text-white/40">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="tint" tint={person.is_active ? 'green' : 'slate'}>
                    {person.is_active ? t('status.active') : t('status.inactive')}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <StaffRowActions
                    target={person}
                    currentUserId={currentUserId}
                    actingRole={actingRole}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
