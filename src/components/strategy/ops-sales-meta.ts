import type { SalesData, SalesLead } from '@/lib/ops-sales';
import { tsDate } from './ops-students-meta';

// Operation HQ › Sales: labels and board rules shared by the board, the card and the modals.

export const SOURCES: Record<string, string> = {
  telegram: 'Telegram',
  insta: 'Instagram',
  ref: 'Tavsiya',
  walk: 'O‘zi keldi',
  call: 'Qo‘ng‘iroq',
  site: 'Sayt',
  other: 'Boshqa',
};
export const sourceName = (s: string) => SOURCES[s] ?? (s || 'Boshqa');
export const NEW_SOURCES = ['insta', 'ref', 'walk', 'call', 'site', 'other'] as const;

/** Group colours map onto Aurora tokens (no hex in components). */
export const GROUP_TONE: Record<string, { pill: string; dot: string }> = {
  g1: { pill: 'bg-au-accent-soft text-au-accent', dot: 'bg-au-accent' },
  g2: { pill: 'bg-au-bad-soft text-au-bad', dot: 'bg-au-bad' },
  g3: { pill: 'bg-au-ok-soft text-au-ok', dot: 'bg-au-ok' },
  g4: { pill: 'bg-au-info-soft text-au-info', dot: 'bg-au-info' },
  g5: { pill: 'bg-au-chart-3/15 text-au-chart-3', dot: 'bg-au-chart-3' },
  g6: { pill: 'bg-au-chart-4/15 text-au-chart-4', dot: 'bg-au-chart-4' },
};
export const GROUP_COLORS = Object.keys(GROUP_TONE);

export const LOST_REASONS = ['Qimmat', 'Vaqt to‘g‘ri kelmaydi', 'Uzoq', 'Boshqa markazni tanladi', 'Javob bermadi', 'Shunchaki qiziqdi', 'Boshqa'];
export const LOST_FIX: Record<string, string> = {
  Qimmat: 'Bo‘lib to‘lash yoki birinchi oyga chegirma taklif qiling; narxdan oldin natija va dasturni ko‘rsating.',
  'Vaqt to‘g‘ri kelmaydi': 'Kechki va dam olish kuni vaqtlarini qo‘shing; lid so‘ragan vaqtni izohga yozib, ochilganda qayta bog‘laning.',
  Uzoq: 'Onlayn darsni taklif qiling; qaysi hududdan kelayotganini yozib boring — yangi filial uchun ma’lumot.',
  'Boshqa markazni tanladi': 'Raqobatchi narxi va taklifini so‘rang; bepul sinov darsini birinchi qo‘ng‘iroqdayoq taklif qiling.',
  'Javob bermadi': 'Birinchi 15 daqiqada qo‘ng‘iroq qiling; 2 marta javob bermasa Telegram xabar yuboring.',
  'Shunchaki qiziqdi': 'Telegram orqali foydali material va aksiya haqida xabar yuborib turing.',
  Boshqa: 'Izohlarni o‘qib, takrorlanayotgan sababni ro‘yxatga qo‘shing.',
};

/** The board column a lead sits in: its stage, «Telegram» (bot, no stage) or the first stage. */
export const TELEGRAM_COL = 'telegram';
export function columnOf(l: SalesLead, firstStage: string | null): string {
  if (l.sectionId) return l.sectionId;
  return l.source === 'telegram' ? TELEGRAM_COL : (firstStage ?? TELEGRAM_COL);
}
export const firstOpenStage = (d: SalesData) => d.stages.find((s) => s.kind !== 'joined' && s.kind !== 'lost')?.id ?? null;

/** Speed-to-lead: not contacted 15 minutes after arriving. */
export const isWaiting = (l: SalesLead, now: number) => !l.firstContactAt && !l.studentId && !l.lostReason && now - tsDate(l.createdAt).getTime() > 15 * 60_000;
export const daysInStage = (l: SalesLead, now: number) => Math.floor((now - tsDate(l.stageAt).getTime()) / 86_400_000);

export const leadErr = (e: string) =>
  e === 'invalidInput'
    ? 'Maydonlarni tekshiring (ism va telefon majburiy)'
    : e === 'forbidden'
      ? "Ruxsat yo'q"
      : e === 'reasonRequired'
        ? 'Rad etish sababini tanlang'
        : e === 'noTelegram'
          ? 'Lid Telegram botga ulanmagan'
          : e === 'sendFailed'
            ? 'Telegram’ga yuborib bo‘lmadi'
            : e === 'notFound'
              ? 'Lid topilmadi'
              : "Saqlab bo'lmadi";
