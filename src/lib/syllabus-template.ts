import { courseLevel } from './course-levels';

/**
 * Standart 3 oylik kurs: 36 dars (har oy 12 ta).
 *   - progress test: 7, 14, 25, 32
 *   - Middle Exam: 18 (kitobning 1-yarmi)
 *   - Level Up Exam: 36
 *   - qolgan 30 tasi oddiy grammar dars (ustoz o'zi yozadi)
 * Middle / Level Up'ga yaqin progress test qo'yilmaydi: Materials'dagi
 * 3- va 6-qism grammar'i oldingi testga qo'shiladi (PROGRESS_PARTS).
 * 36 dan keyingi darslar shu shablonni qaytadan boshlaydi.
 */
export const COURSE_LENGTH = 36;

export type LessonType = 'lesson' | 'progress_test' | 'midterm' | 'final_test';

const PROGRESS_POSITIONS = [7, 14, 25, 32] as const;
/** n-progress test qaysi Materials qismlarini qamraydi. */
const PROGRESS_PARTS: number[][] = [[1], [2, 3], [4], [5, 6]];

function cyclePos(pos: number): number {
  return ((pos - 1) % COURSE_LENGTH) + 1;
}

/** «7-dars» yoki ikkinchi kursdan boshlab «2-kurs · 7-dars». */
export function coursePosLabel(pos: number): string {
  const course = Math.floor((pos - 1) / COURSE_LENGTH) + 1;
  return course > 1 ? `${course}-kurs · ${cyclePos(pos)}-dars` : `${cyclePos(pos)}-dars`;
}

export function lessonTypeForPosition(pos: number): LessonType {
  const p = cyclePos(pos);
  if (p === 36) return 'final_test';
  if (p === 18) return 'midterm';
  if ((PROGRESS_POSITIONS as readonly number[]).includes(p)) return 'progress_test';
  return 'lesson';
}

/** Kursdagi pozitsiya jadval bo'yicha: kurs boshlangan kundan har bir dars
 * kuni (sana tartibida) navbatdagi raqamni oladi — 1, 2, … 36, keyin keyingi
 * kurs 37 … 72. Ko'chirib yuborilgan dars (`moved_to`) bu ro'yxatga kirmaydi,
 * shuning uchun dars kechiksa undan keyingi imtihonlar ham bir dars suriladi.
 * `rows` — hisobga olinadigan darslar, sana tartibida. */
export type PlanRow = { id: string; date: string; filled: boolean };
export type PlanAssignment = { id: string; date: string; filled: boolean; pos: number; type: LessonType };

export function planPositions(rows: PlanRow[]): PlanAssignment[] {
  return rows.map((r, i) => ({ ...r, pos: i + 1, type: lessonTypeForPosition(i + 1) }));
}

/** «6-dars yozildi → 7-darsda Progress Test» xabari kerak bo'lgan imtihonlar:
 * oldingi dars lesson plani yozilgan, imtihon kuni bugun yoki keyin. */
export function examsToAnnounce(plan: PlanAssignment[], today: string): PlanAssignment[] {
  return plan.filter((a, i) => a.type !== 'lesson' && i > 0 && plan[i - 1].filled && a.date >= today);
}

/** Joriy kursda imtihongacha nechta grammar dars o'tilgan (xabar matni uchun). */
export function grammarLessonsBefore(pos: number): number {
  let n = 0;
  for (let q = 1; q < cyclePos(pos); q++) if (lessonTypeForPosition(q) === 'lesson') n += 1;
  return n;
}

export const EXAM_LABEL: Record<Exclude<LessonType, 'lesson'>, string> = {
  progress_test: 'Progress Test',
  midterm: 'Middle Exam',
  final_test: 'Level Up Exam',
};

const MATERIALS_EXAM_BASE = 'https://www.persons-staffs.uz/materials/level-exam/take';

export type ExamPlan = {
  topic: string;
  aim: string;
  materials: string | null;
  homework: string;
  procedure: { time: string; stage: string; interaction: string }[];
};

/** Imtihon kuni uchun avtomatik lesson plan. Oddiy dars uchun null. Daraja
 * Materials'da bo'lmasa (IELTS, CEFR, iTEP…) havola qo'yilmaydi. */
export function examPlanFor(pos: number, levelSlug: string | null): ExamPlan | null {
  const type = lessonTypeForPosition(pos);
  if (type === 'lesson') return null;
  const level = courseLevel(levelSlug);
  const onMaterials = level?.materials ? level : null;
  const levelName = level?.label ?? '';

  if (type === 'progress_test') {
    const n = PROGRESS_POSITIONS.indexOf(cyclePos(pos) as (typeof PROGRESS_POSITIONS)[number]) + 1;
    const parts = PROGRESS_PARTS[n - 1];
    const partsLabel = parts.length > 1 ? `Part ${parts.join(' + ')}` : `Part ${parts[0]}`;
    return {
      topic: `Progress Test ${n}`,
      aim: `Progress Test ${n} (${partsLabel}): grammar, vocabulary va reading bo‘yicha bilimni tekshirish`,
      materials: onMaterials
        ? parts
            .map((p) => `Materials › Progress Test · ${onMaterials.label} · Part ${p}: ${MATERIALS_EXAM_BASE}/progress/${onMaterials.slug}?p=${p}`)
            .join('\n')
        : null,
      homework: 'Xatolar ustida ishlash (Materials natijalar sahifasi)',
      procedure: [
        { time: '5', stage: 'Kirish, imtihon qoidalari', interaction: 'T-Ss' },
        { time: '25', stage: 'Grammar · 25 savol', interaction: 'Individual' },
        { time: '25', stage: 'Vocabulary · 25 savol', interaction: 'Individual' },
        { time: '25', stage: 'Reading · 25 savol', interaction: 'Individual' },
        { time: '10', stage: 'Natijalarni ko‘rib chiqish', interaction: 'T-Ss' },
      ],
    };
  }

  if (type === 'midterm') {
    return {
      topic: 'Middle Exam',
      aim: `Middle Exam${levelName ? ` · ${levelName}` : ''}: kitobning birinchi yarmi (Part 1–3) bo‘yicha oraliq imtihon`,
      materials: onMaterials ? `Materials › Middle Exam · ${onMaterials.label}: ${MATERIALS_EXAM_BASE}/middle/${onMaterials.slug}` : null,
      homework: 'Xatolar ustida ishlash (Materials natijalar sahifasi)',
      procedure: [
        { time: '25', stage: 'Grammar · 25 savol', interaction: 'Individual' },
        { time: '25', stage: 'Vocabulary · 25 savol', interaction: 'Individual' },
        { time: '25', stage: 'Reading · 25 savol', interaction: 'Individual' },
        { time: '15', stage: 'Speaking · 5 savol (ustoz baholaydi)', interaction: 'T-S' },
      ],
    };
  }

  return {
    topic: 'Level Up Exam',
    aim: `Level Up Exam${levelName ? ` · ${levelName}` : ''}: butun daraja bo‘yicha yakuniy imtihon (keyingi darajaga o‘tish)`,
    materials: onMaterials ? `Materials › Level Up Exam · ${onMaterials.label}: ${MATERIALS_EXAM_BASE}/final/${onMaterials.slug}` : null,
    homework: '—',
    procedure: [
      { time: '20', stage: 'Grammar · 25 savol', interaction: 'Individual' },
      { time: '20', stage: 'Vocabulary · 25 savol', interaction: 'Individual' },
      { time: '20', stage: 'Reading · 25 savol', interaction: 'Individual' },
      { time: '15', stage: 'Listening · 25 savol', interaction: 'Individual' },
      { time: '25', stage: 'Writing (ustoz baholaydi)', interaction: 'Individual' },
      { time: '20', stage: 'Speaking · 5 savol (ustoz baholaydi)', interaction: 'T-S' },
    ],
  };
}
