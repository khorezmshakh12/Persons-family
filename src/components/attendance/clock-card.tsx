'use client';

import { useActionState } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import {
  clockInAction,
  clockOutAction,
  type AttendanceActionState,
} from '@/lib/actions/attendance';
import { formatDuration } from '@/lib/format-duration';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ClockCard({ openSession }: { openSession: { clockIn: string } | null }) {
  const t = useTranslations('attendance');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const [clockInState, clockInFormAction, clockInPending] = useActionState<AttendanceActionState, FormData>(
    clockInAction,
    undefined,
  );
  const [clockOutState, clockOutFormAction, clockOutPending] = useActionState<
    AttendanceActionState,
    FormData
  >(clockOutAction, undefined);

  const error = clockInState?.error ?? clockOutState?.error;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('myAttendance')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {openSession ? (
          <p className="text-muted-foreground text-sm">
            {t('clockedInSince', {
              time: format.dateTime(new Date(openSession.clockIn), { hour: '2-digit', minute: '2-digit' }),
              duration: formatDuration(openSession.clockIn, null, t('hoursAbbrev'), t('minutesAbbrev')),
            })}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">{t('notClockedIn')}</p>
        )}

        {error && <p className="text-destructive text-sm">{t(`errors.${error}`)}</p>}

        {openSession ? (
          <form action={clockOutFormAction}>
            <Button type="submit" variant="outline" disabled={clockOutPending}>
              {clockOutPending ? tCommon('loading') : t('clockOut')}
            </Button>
          </form>
        ) : (
          <form action={clockInFormAction}>
            <Button type="submit" disabled={clockInPending}>
              {clockInPending ? tCommon('loading') : t('clockIn')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
