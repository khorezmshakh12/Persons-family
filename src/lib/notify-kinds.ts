/** Telegram notification kinds a person can switch off (Sozlamalar ›
 * Bildirishnomalar). Client-safe. Messages sent without a kind (account,
 * security, direct admin notices) are always delivered. */
export const NOTIFY_KINDS = ['task', 'chat', 'news', 'kpi', 'pay', 'issue', 'stars', 'lesson', 'report'] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];

export const NOTIFY_META: Record<NotifyKind, { n: string; hint: string; quiet: boolean }> = {
  task: { n: 'Vazifalar', hint: 'Yangi vazifa, muddat eslatmasi, tasdiq / qaytarish', quiet: false },
  chat: { n: 'Chat', hint: 'Shaxsiy xabarlar va @eslatmalar', quiet: true },
  news: { n: 'E’lonlar va tadbirlar', hint: 'Kompaniya e’lonlari, tadbirlar', quiet: true },
  kpi: { n: 'KPI', hint: 'Reja eslatmalari va baholar', quiet: false },
  pay: { n: 'Oylik va avans', hint: 'To‘lovlar, avans qarorlari', quiet: false },
  issue: { n: 'Muammolar', hint: 'Sizga biriktirilgan muammolar', quiet: false },
  stars: { n: 'Yulduzlar va rag‘bat', hint: 'Yulduz, bonus, ogohlantirish, market', quiet: true },
  lesson: { n: 'Dars rejalari', hint: 'Reja tekshiruvi va izohlar', quiet: true },
  report: { n: 'Haftalik hisobotlar', hint: 'Dushanba xulosalari', quiet: true },
};
