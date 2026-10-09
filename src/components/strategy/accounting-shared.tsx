'use client';

import { useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { toast } from './suite-shell';

/** Shared bits of the Hisob-kitob modules (split 2026-10-10, v8-B). */
export const err = (c: string) =>
  c === 'forbidden'
    ? "Ruxsat yo'q"
    : c === 'invalidInput'
      ? "Ma'lumot noto'g'ri"
      : c === 'notFound'
        ? 'Topilmadi'
        : c === 'periodClosed'
          ? 'Bu oy yopilgan — o‘zgartirish uchun “Oy yopish” bo‘limida qayta oching'
          : c === 'inUse'
          ? 'Bu hisob ishlatilgan (jurnal, qoldiq yoki byudjet) — o‘chirib bo‘lmaydi'
          : 'Saqlab bo‘lmadi (kod band bo‘lishi mumkin)';
export const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Runs a server action, toasts the outcome and refreshes server data. */
export function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, ok?: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(err(res.error));
      else {
        if (ok) toast.success(ok);
        after?.();
        router.refresh();
      }
    });
  return { run, pending };
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const t = String(v ?? '');
    return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const blob = new Blob(['\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
