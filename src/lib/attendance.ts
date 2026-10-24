/** Xodimlar davomati — pure helpers shared by the page, the client view and
 * the Server Actions. Times are "HH:MM" strings in Tashkent time. */

export const ATTENDANCE_STATUSES = ['office', 'late', 'remote', 'left', 'absent'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  office: 'Ofisda',
  late: 'Kechikdi',
  remote: 'Masofadan',
  left: 'Ketgan',
  absent: 'Kelmadi',
};

export const WORK_START = '09:00';
export const WORK_END = '18:00';
/** Arriving after this counts as late. */
export const LATE_AFTER = '09:05';

export const TIME_RE = /^\d{2}:\d{2}$/;
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type AttendanceRecord = {
  checkIn: string;
  checkOut: string;
  status: AttendanceStatus;
  note: string;
};

export const EMPTY_RECORD: AttendanceRecord = { checkIn: '', checkOut: '', status: 'absent', note: '' };

/** "8 s 12 daq" between two HH:MM times, or an em dash. */
export function workedHours(checkIn: string, checkOut: string): string {
  if (!checkIn || !checkOut) return '—';
  const [inH, inM] = checkIn.split(':').map(Number);
  const [outH, outM] = checkOut.split(':').map(Number);
  const diff = outH * 60 + outM - (inH * 60 + inM);
  if (diff <= 0) return '—';
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h} s ${m > 0 ? `${m} daq` : ''}`.trim();
}

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

/** "14-Oktabr 2026-yil (Chorshanba)" for a YYYY-MM-DD day key. */
export function formatUzbekDay(day: string): string {
  if (!DAY_RE.test(day)) return '';
  const [y, m, d] = day.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${d}-${MONTHS[m - 1]} ${y}-yil (${WEEKDAYS[wd]})`;
}
