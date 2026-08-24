import { NextRequest, NextResponse } from 'next/server';
import { generateLessonSlotsForMonth, getAllGroupIds } from '@/lib/lesson-generation';

// Cloud Scheduler fires this a few days before each month starts (see the
// lesson-plan-check-daily job created this session for the identical
// CRON_SECRET bearer-auth pattern and the /staff basePath gotcha) so every
// group already has next month's dated slots ready before the 1st, the same
// way createGroupAction seeds the current month for a brand-new group.
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const tashkentToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  const [year, month] = tashkentToday.split('-').map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const groupIds = await getAllGroupIds();
  let totalCreated = 0;
  for (const groupId of groupIds) {
    totalCreated += await generateLessonSlotsForMonth(groupId, nextYear, nextMonth);
  }

  return NextResponse.json({ ok: true, groups: groupIds.length, rowsCreated: totalCreated, month: `${nextYear}-${nextMonth}` });
}
