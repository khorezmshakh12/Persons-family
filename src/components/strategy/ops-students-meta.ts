import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { formatUZS } from '@/lib/format-currency';
import type { PayGrade } from '@/lib/billing';

// Operation HQ › O'quvchilar: labels shared by the list, the card and the modals.
// Labels come from messages (`ops.*`) — call useOpsMeta() inside a component.

export const som = (v: number) => `${formatUZS(Math.round(v))} so‘m`;
export const dmy = (k: string) => `${k.slice(8, 10)}.${k.slice(5, 7)}.${k.slice(0, 4)}`;

export const PAY_METHODS = ['cash', 'card', 'click', 'payme', 'uzum', 'transfer', 'other'] as const;
const METHOD_KEYS = ['cash', 'card', 'click', 'payme', 'uzum', 'transfer', 'online', 'other'] as const;
const CALL_KEYS = ['promised', 'no_answer', 'refused', 'other'] as const;
const TRIGGER_KEYS = ['before', 'due', 'paid', 'none'] as const;

/** Exit reasons as stored in the DB (crm_students.leave_reason) — never translate these values. */
export const REASON_VALUES = [
  'Qimmat, to‘lay olmayapti',
  'Darsga kelmay qo‘ydi',
  'Vaqt to‘g‘ri kelmaydi',
  'Ko‘chib ketdi',
  'O‘qituvchi yoqmadi',
  'Natija sezilmadi',
  'Boshqa markazga o‘tdi',
  'Kasallik / oilaviy sabab',
  'Boshqa',
] as const;

export const VARS = ['{ism}', '{ota_ona}', '{summa}', '{sana}', '{qarz}', '{tolandi}', '{havola}'];

const ERR_KEYS = ['tooMuch', 'invalidInput', 'forbidden', 'noTelegram', 'sendFailed', 'notFound', 'hasPayments', 'feeRequired', 'paymentLocked', 'chargeLocked', 'tooOld', 'duplicate', 'frozen', 'sessionExpired', 'updateFailed', 'loadFailed'];

export type OpsMeta = ReturnType<typeof useOpsMeta>;

export function useOpsMeta() {
  const t = useTranslations('ops');
  return useMemo(() => {
    const METHODS = Object.fromEntries(METHOD_KEYS.map((k) => [k, t(`method.${k}`)])) as Record<string, string>;
    const GRADE: Record<PayGrade, { n: string; tone: 'ok' | 'warn' | 'bad' }> = {
      ok: { n: t('grade.ok'), tone: 'ok' },
      late: { n: t('grade.late'), tone: 'warn' },
      hard: { n: t('grade.hard'), tone: 'bad' },
    };
    const TRIGGERS = Object.fromEntries(TRIGGER_KEYS.map((k) => [k, t(`trigger.${k}`)])) as Record<string, string>;
    const CALLS = Object.fromEntries(CALL_KEYS.map((k) => [k, t(`call.${k}`)])) as Record<string, string>;
    /** v = stored value, n = label, fix = what to do. */
    const REASONS = REASON_VALUES.map((v, i) => ({ v, n: t(`reason.r${i}`), fix: t(`fix.r${i}`) }));
    const reasonLabel = (v: string) => REASONS.find((r) => r.v === v)?.n ?? v;
    const fixFor = (v: string) => (REASONS.find((r) => r.v === v) ?? REASONS[REASONS.length - 1]).fix;
    const errText = (e: string) => (ERR_KEYS.includes(e) ? t(`err.${e}`) : t('err.other', { code: e }));
    /** «5 min ago», «3 h ago», «2 d ago». */
    const ago = (s: string, now = Date.now()) => {
      const m = Math.max(0, Math.round((now - tsDate(s).getTime()) / 60000));
      return m < 60 ? t('ago.min', { n: m }) : m < 1440 ? t('ago.hour', { n: Math.round(m / 60) }) : t('ago.day', { n: Math.round(m / 1440) });
    };
    return { METHODS, GRADE, TRIGGERS, CALLS, REASONS, reasonLabel, fixFor, errText, ago };
  }, [t]);
}

/** A Postgres timestamptz text (any offset) as a Date. */
export const tsDate = (s: string) => new Date(s.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
const TK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
/** «22.10.2026 16:30» in Tashkent time. */
export const when = (s: string) => {
  const p = Object.fromEntries(TK.formatToParts(tsDate(s)).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
};
