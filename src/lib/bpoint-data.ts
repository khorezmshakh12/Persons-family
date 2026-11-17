import 'server-only';
import { sql } from '@/lib/db/client';
import { tashkentYmd } from '@/lib/time';
import { loadPayByMonth } from '@/lib/pay-run-data';
import { bpointByMonth, bpointProgress, type BpointProgress } from '@/lib/bpoint';

const SHORT_UZ = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

export type BpointView = {
  year: number;
  /** Monthly target (0 = not set). */
  target: number;
  note: string | null;
  progress: BpointProgress;
  /** All 12 months; months not reached yet carry no amount. */
  months: { label: string; amount: number | null }[];
};

/** One person's B-nuqta for the current Tashkent year: har oy uchun
 * haqiqatda olingan summa (oylik to'lov + avans), yanvardan joriy oygacha
 * (src/lib/bpoint.ts). The staff finance page and the profile Finance tab
 * both render this, so they always show the same thing. */
export async function loadBpoint(staffId: string): Promise<BpointView> {
  const { year, month } = tashkentYmd();
  const [rows, ytd] = await Promise.all([
    sql<{ amount: number; note: string | null }[]>`select amount, note from staff_bpoint where user_id = ${staffId} and year = ${year}`,
    loadPayByMonth(`${year}-01-01`, `${year}-${String(month).padStart(2, '0')}-01`, staffId),
  ]);
  const target = rows[0]?.amount ?? 0;
  const byMonth = bpointByMonth(ytd, year);
  return {
    year,
    target,
    note: rows[0]?.note ?? null,
    progress: bpointProgress(target, byMonth, month - 1),
    months: byMonth.map((v, i) => ({ label: SHORT_UZ[i], amount: i < month ? Math.round(v) : null })),
  };
}
