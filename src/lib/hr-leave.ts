/**
 * HR › Ta'til va Ishga olish (Core'dan ko'chgan, owner 2026-11-21).
 * Ta'til: xodim so'raydi → CEO / COO / HR (leave.review) tasdiqlaydi yoki
 * izoh bilan rad etadi; qaror bekor qilinsa yana «kutilmoqda» bo'ladi.
 * Ishga olish: vakansiya, ariza / suhbat / offer soni, yopish va qayta ochish.
 * Client-safe.
 */

export const LEAVE_KINDS = ['vacation', 'sick', 'day_off', 'remote'] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export const LEAVE_KIND_LABEL: Record<LeaveKind, string> = {
  vacation: 'Ta’til',
  sick: 'Kasallik',
  day_off: 'Bir kunlik ruxsat',
  remote: 'Masofadan ish',
};

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: 'Kutilmoqda',
  approved: 'Tasdiqlangan',
  rejected: 'Rad etilgan',
  cancelled: 'Bekor qilingan',
};

export type LeaveRow = {
  id: string;
  userId: string;
  name: string;
  kind: LeaveKind;
  from: string;
  to: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
};

export type Vacancy = {
  id: string;
  title: string;
  dept: string;
  seats: number;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt: string | null;
  applicants: number;
  interviews: number;
  offers: number;
  note: string | null;
};

/** Inclusive day count between two YYYY-MM-DD keys. */
export function leaveDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export const fmtDayKey = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
