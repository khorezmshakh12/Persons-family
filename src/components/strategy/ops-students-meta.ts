import { formatUZS } from '@/lib/format-currency';
import type { PayGrade } from '@/lib/billing';

// Operation HQ › O'quvchilar: labels shared by the list, the card and the modals.

export const som = (v: number) => `${formatUZS(Math.round(v))} so‘m`;
export const dmy = (k: string) => `${k.slice(8, 10)}.${k.slice(5, 7)}.${k.slice(0, 4)}`;

export const METHODS: Record<string, string> = {
  cash: 'Naqd',
  card: 'Karta',
  click: 'Click',
  payme: 'Payme',
  uzum: 'Uzum',
  transfer: 'O‘tkazma',
  online: 'Onlayn',
  other: 'Boshqa',
};
export const PAY_METHODS = ['cash', 'card', 'click', 'payme', 'uzum', 'transfer', 'other'] as const;

export const GRADE: Record<PayGrade, { n: string; tone: 'ok' | 'warn' | 'bad' }> = {
  ok: { n: 'Vaqtida to‘laydi', tone: 'ok' },
  late: { n: 'Kechikib to‘laydi', tone: 'warn' },
  hard: { n: 'To‘lashi qiyin', tone: 'bad' },
};

export const TRIGGERS: Record<string, string> = {
  before: 'Avto: to‘lovdan oldin',
  due: 'Avto: to‘lov kuni',
  paid: 'To‘lov qabul qilinganda',
  none: 'Faqat qo‘lda',
};

export const VARS = ['{ism}', '{ota_ona}', '{summa}', '{sana}', '{qarz}', '{tolandi}', '{havola}'];

export const CALLS: Record<string, string> = {
  promised: 'To‘lashga va’da berdi',
  no_answer: 'Javob bermadi',
  refused: 'To‘lamaydi',
  other: 'Boshqa',
};

/** Exit reasons, and what to do when one keeps coming back. */
export const REASONS: { n: string; fix: string }[] = [
  { n: 'Qimmat, to‘lay olmayapti', fix: 'Bo‘lib to‘lash yoki 10–15% chegirma taklif qiling; «To‘lashi qiyin»larga oldindan qo‘ng‘iroq qiling.' },
  { n: 'Darsga kelmay qo‘ydi', fix: 'Ketma-ket 2 dars kelmasa ota-onaga qo‘ng‘iroq qiling; «Ketish xavfi» filtrini har hafta ko‘rib chiqing.' },
  { n: 'Vaqt to‘g‘ri kelmaydi', fix: 'Boshqa vaqtdagi guruhni taklif qiling (Bo‘sh joylar vitrinasi); kechki yoki dam olish kuni guruhini ochishni ko‘ring.' },
  { n: 'Ko‘chib ketdi', fix: 'Onlayn format yoki yaqin filialni taklif qiling.' },
  { n: 'O‘qituvchi yoqmadi', fix: 'O‘qituvchi bilan suhbat va dars kuzatuvi; boshqa o‘qituvchiga o‘tkazishni taklif qiling.' },
  { n: 'Natija sezilmadi', fix: 'Har oy ota-onaga natija hisobotini yuboring; oraliq test va maqsadni kelishib oling.' },
  { n: 'Boshqa markazga o‘tdi', fix: 'Raqobatchi narx va dasturini o‘rganing; ketganlardan qisqa so‘rovnoma oling.' },
  { n: 'Kasallik / oilaviy sabab', fix: 'Chiqarish o‘rniga muzlatishni taklif qiling — o‘quvchi qaytadi.' },
  { n: 'Boshqa', fix: 'Izohlarni o‘qib, takrorlanayotgan sababni alohida tur qilib qo‘shing.' },
];
export const fixFor = (reason: string) => REASONS.find((r) => r.n === reason)?.fix ?? REASONS[REASONS.length - 1].fix;

export const errText = (e: string) =>
  e === 'invalidInput'
    ? 'Maydonlarni tekshiring'
    : e === 'forbidden'
      ? "Ruxsat yo'q"
      : e === 'noTelegram'
        ? 'Ota-ona Telegram botga ulanmagan'
        : e === 'sendFailed'
          ? 'Telegram’ga yuborib bo‘lmadi'
          : e === 'notFound'
            ? 'O‘quvchi topilmadi'
            : e === 'hasPayments'
              ? 'To‘lovi bor o‘quvchini o‘chirib bo‘lmaydi — arxivlang'
              : e === 'feeRequired'
                ? 'Oylik summani kiriting'
                : e === 'paymentLocked'
                  ? 'Bu to‘lov bekor qilingan yoki qaytarish yozuvi, uni o‘zgartirib bo‘lmaydi'
                  : "Saqlab bo'lmadi";

/** A Postgres timestamptz text (any offset) as a Date. */
export const tsDate = (s: string) => new Date(s.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
const TK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
/** «22.10.2026 16:30» in Tashkent time. */
export const when = (s: string) => {
  const p = Object.fromEntries(TK.formatToParts(tsDate(s)).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
};
/** «5 daq oldin», «3 soat oldin», «2 kun oldin». */
export const ago = (s: string, now = Date.now()) => {
  const m = Math.max(0, Math.round((now - tsDate(s).getTime()) / 60000));
  return m < 60 ? `${m} daq oldin` : m < 1440 ? `${Math.round(m / 60)} soat oldin` : `${Math.round(m / 1440)} kun oldin`;
};
