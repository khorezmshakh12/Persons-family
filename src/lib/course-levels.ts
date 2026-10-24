/** Guruh darajalari — ro'yxat tartibi = o'qish ketma-ketligi (guruhlar shu
 * tartibda ko'rsatiladi). `materials: true` — Materials saytida shu daraja
 * uchun Progress / Middle / Level Up imtihoni bor (slug Materials'dagi bilan bir xil). */
export const COURSE_LEVELS = [
  { slug: 'beginner', label: 'Beginner', materials: true },
  { slug: 'elementary', label: 'Elementary', materials: true },
  { slug: 'pre-intermediate', label: 'Pre-Intermediate', materials: true },
  { slug: 'intermediate', label: 'Intermediate', materials: true },
  { slug: 'upper-intermediate', label: 'Upper-Intermediate', materials: true },
  { slug: 'advanced', label: 'Advanced', materials: true },
  { slug: 'ielts-foundation', label: 'IELTS Foundation', materials: false },
  { slug: 'ielts', label: 'IELTS', materials: false },
  { slug: 'cefr', label: 'CEFR', materials: false },
  { slug: 'itep', label: 'iTEP', materials: false },
] as const;

export type CourseLevelSlug = (typeof COURSE_LEVELS)[number]['slug'];

export const COURSE_LEVEL_SLUGS = COURSE_LEVELS.map((l) => l.slug) as [CourseLevelSlug, ...CourseLevelSlug[]];

export function courseLevel(slug: string | null | undefined) {
  return COURSE_LEVELS.find((l) => l.slug === slug) ?? null;
}

/** Saralash uchun: darajasi yo'q guruhlar oxirida. */
export function courseLevelOrder(slug: string | null | undefined): number {
  const i = COURSE_LEVELS.findIndex((l) => l.slug === slug);
  return i < 0 ? COURSE_LEVELS.length : i;
}
