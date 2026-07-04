import { getTranslations, getFormatter } from 'next-intl/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDuration } from '@/lib/format-duration';
import { StaffFilter } from './staff-filter';

type Record = {
  id: string;
  work_date: string;
  clock_in: string;
  clock_out: string | null;
  profiles: { first_name: string; last_name: string } | null;
};

export async function AllStaffAttendance({
  records,
  staffList,
}: {
  records: Record[];
  staffList: { id: string; first_name: string; last_name: string }[];
}) {
  const t = await getTranslations('attendance');
  const format = await getFormatter();

  return (
    <div className="flex flex-col gap-4">
      <StaffFilter staffList={staffList} />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.staff')}</TableHead>
              <TableHead>{t('table.date')}</TableHead>
              <TableHead>{t('table.clockIn')}</TableHead>
              <TableHead>{t('table.clockOut')}</TableHead>
              <TableHead>{t('table.duration')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center">
                  {t('noRecords')}
                </TableCell>
              </TableRow>
            )}
            {records.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : '—'}</TableCell>
                <TableCell>{r.work_date}</TableCell>
                <TableCell>
                  {format.dateTime(new Date(r.clock_in), { hour: '2-digit', minute: '2-digit' })}
                </TableCell>
                <TableCell>
                  {r.clock_out
                    ? format.dateTime(new Date(r.clock_out), { hour: '2-digit', minute: '2-digit' })
                    : t('stillClockedIn')}
                </TableCell>
                <TableCell>
                  {formatDuration(r.clock_in, r.clock_out, t('hoursAbbrev'), t('minutesAbbrev'))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
