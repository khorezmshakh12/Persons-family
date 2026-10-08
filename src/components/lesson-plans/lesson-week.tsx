'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, Copy, Clock3, MessageSquareWarning, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { SURFACE_CARD } from '@/lib/glass';
import { useNowTicker } from '@/lib/use-now-ticker';
import { addDaysToKey } from '@/lib/time';
import { filledFields, planDeadline, PLAN_REQUIRED_FIELDS, type PlanRequiredField } from '@/lib/lesson-plan-status';
import { copyLessonPlanAction, lessonCopySourcesAction, type CopySource } from '@/lib/actions/course-lessons';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { LessonTopicCell } from './lesson-topic-cell';
import { LessonPlanTextField, type LessonPlanField } from './lesson-plan-text-field';
import { LessonProcedureTable } from './lesson-procedure-table';
import type { WeekLesson } from '@/lib/lesson-week-data';

/* ------------------------------------------------------------ ring */

/** Five-segment completeness ring (the nightly check's five fields); the
 * fraction is also written out, so colour is never the only signal. */
export function CompletionRing({ filled, size = 34, pop = false }: { filled: number; size?: number; pop?: boolean }) {
  const share = filled / PLAN_REQUIRED_FIELDS.length;
  const done = filled === PLAN_REQUIRED_FIELDS.length;
  const tone = done ? 'var(--au-ok)' : filled === 0 ? 'var(--au-bad)' : 'var(--au-accent)';
  return (
    <span key={done ? 'done' : 'open'} className={cn('relative grid shrink-0 place-items-center', done && pop && 'ms-pop-in')} style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="15" fill="none" stroke="var(--au-card-2)" strokeWidth="4" />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke={tone}
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${share} 1`}
          className="ms-arc transition-[stroke-dasharray,stroke] duration-500 ease-out"
        />
      </svg>
      {done ? (
        <Check className="size-3.5 text-au-ok" strokeWidth={3} aria-label="5/5" />
      ) : (
        <span className="text-[9.5px] font-bold text-au-muted tabular-nums">{filled}/5</span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------ countdown */

function Countdown({ deadline }: { deadline: number }) {
  const t = useTranslations('lessonPlans.week');
  const now = useNowTicker();
  if (now === null) return null;
  const left = Math.max(0, deadline - now);
  const h = Math.floor(left / 3600_000);
  const m = Math.floor((left % 3600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  const urgent = left < 3600_000;
  return (
    <span className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-bold tabular-nums', urgent ? 'ms-breathe bg-au-bad-soft text-au-bad' : 'bg-au-card-2 text-au-ink')}>
      <Clock3 className="size-4" aria-hidden />
      {t('until')} {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}
      {urgent && <span key={s} className="lane-count">:{String(s).padStart(2, '0')}</span>}
    </span>
  );
}

/* ------------------------------------------------------------ panel */

type Values = Record<PlanRequiredField, string>;
const valuesOf = (l: WeekLesson): Values => ({
  topic: l.topic ?? '',
  aim: l.aim ?? '',
  language_focus: l.language_focus ?? '',
  anticipated_problems: l.anticipated_problems ?? '',
  homework: l.homework ?? '',
});

function LessonPanel({
  lesson,
  canEdit,
  onClose,
  onValues,
}: {
  lesson: WeekLesson;
  canEdit: boolean;
  onClose: () => void;
  onValues: (id: string, v: Values) => void;
}) {
  const t = useTranslations('lessonPlans');
  const tw = useTranslations('lessonPlans.week');
  const [values, setValues] = useState<Values>(() => valuesOf(lesson));
  const [savedAt, setSavedAt] = useState(0);
  const [sources, setSources] = useState<CopySource[] | null>(null);
  const [copying, startCopy] = useTransition();
  const filled = filledFields(values);

  const set = (k: PlanRequiredField) => (v: string) => {
    const next = { ...values, [k]: v };
    setValues(next);
    onValues(lesson.id, next);
  };
  const saved = () => setSavedAt(Date.now());

  useEffect(() => {
    if (!canEdit) return;
    let alive = true;
    lessonCopySourcesAction(lesson.id).then((s) => alive && setSources(s));
    return () => {
      alive = false;
    };
  }, [lesson.id, canEdit]);

  const fields: { k: Exclude<LessonPlanField, 'materials'>; label: string; ph: string }[] = [
    { k: 'aim', label: t('courseLessons.aim'), ph: t('courseLessons.aimPlaceholder') },
    { k: 'language_focus', label: t('courseLessons.languageFocus'), ph: t('courseLessons.languageFocusPlaceholder') },
    { k: 'anticipated_problems', label: t('courseLessons.anticipatedProblems'), ph: t('courseLessons.anticipatedProblemsPlaceholder') },
    { k: 'homework', label: t('courseLessons.homework'), ph: t('courseLessons.homeworkPlaceholder') },
  ];

  return (
    <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto border-au-line bg-au-card p-0 text-au-ink sm:max-w-xl">
      <SheetHeader className="sticky top-0 z-10 flex-row items-center gap-3 border-b border-au-line bg-au-card px-5 py-4">
        <CompletionRing filled={filled} size={44} pop />
        <div className="min-w-0 flex-1">
          <SheetTitle className="truncate text-base font-bold text-au-ink">
            {lesson.group_name} · #{lesson.lesson_number}
          </SheetTitle>
          <SheetDescription className="text-xs text-au-muted">
            {lesson.lesson_date}
            {lesson.time ? ` · ${lesson.time}` : ''}
            {lesson.room ? ` · ${lesson.room}` : ''}
          </SheetDescription>
        </div>
        <span key={savedAt} className={cn('text-xs font-semibold text-au-ok transition-opacity', savedAt ? 'ms-pop-in opacity-100' : 'opacity-0')} aria-live="polite">
          {savedAt ? `${tw('saved')} ✓` : ''}
        </span>
      </SheetHeader>

      <div className="flex flex-col gap-5 px-5 py-5">
        {lesson.verdict === 'needs_work' && lesson.review_note && (
          <div className="flex items-start gap-2 rounded-au-ctl border border-au-bad/30 bg-au-bad-soft px-3 py-2.5 text-sm text-au-ink">
            <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-au-bad" aria-hidden />
            <span>{lesson.review_note}</span>
          </div>
        )}

        {canEdit && sources && sources.length > 0 && (
          <div className="flex flex-col gap-2 rounded-au-ctl border border-dashed border-au-accent/50 bg-au-accent-soft/40 p-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-au-accent-text">
              <Copy className="size-3.5" aria-hidden /> {tw('copyFrom')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {sources.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={copying}
                  onClick={() =>
                    startCopy(async () => {
                      const res = await copyLessonPlanAction(lesson.id, s.id);
                      if (res?.error) return void toast.error(t(`errors.${res.error}`));
                      toast.success(tw('copied'));
                      onClose();
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-au-line bg-au-card px-2.5 py-1 text-xs font-semibold text-au-ink hover:border-au-accent"
                >
                  {s.label}
                  <span className="text-au-faint tabular-nums">{s.filled}/5</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label={t('courseLessons.topic')} done={!!values.topic.trim()}>
          <LessonTopicCell lessonId={lesson.id} topic={lesson.topic} canEdit={canEdit} className="w-full text-sm" onValueChange={set('topic')} onSaved={saved} />
        </Field>
        {fields.map((f) => (
          <Field key={f.k} label={f.label} done={!!values[f.k].trim()}>
            <LessonPlanTextField lessonId={lesson.id} field={f.k} value={lesson[f.k]} canEdit={canEdit} placeholder={f.ph} onValueChange={set(f.k)} onSaved={saved} />
          </Field>
        ))}
        <Field label={t('courseLessons.materials')} optional>
          <LessonPlanTextField lessonId={lesson.id} field="materials" value={lesson.materials} canEdit={canEdit} placeholder={t('courseLessons.materialsPlaceholder')} onSaved={saved} />
        </Field>
        <Field label={t('courseLessons.procedure')} optional>
          <LessonProcedureTable lessonId={lesson.id} steps={lesson.procedure} canEdit={canEdit} />
        </Field>
        <Link href={`/lesson-plans/${lesson.group_id}`} className="text-xs font-semibold text-au-accent-text hover:underline">
          {tw('openGroup')} →
        </Link>
      </div>
    </SheetContent>
  );
}

function Field({ label, done, optional, children }: { label: string; done?: boolean; optional?: boolean; children: React.ReactNode }) {
  const tw = useTranslations('lessonPlans.week');
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-au-muted uppercase">
        {!optional && (
          <span key={String(done)} className={cn('grid size-4 place-items-center rounded-full', done ? 'ms-pop-in bg-au-ok text-white' : 'border border-au-line')}>
            {done && <Check className="size-2.5" strokeWidth={3.5} />}
          </span>
        )}
        {label}
        {optional && <span className="font-normal tracking-normal text-au-faint normal-case">· {tw('optional')}</span>}
      </h4>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ week */

/**
 * The teacher's desk: every group's lessons for one Mon–Sat week, each with
 * its completeness ring; tomorrow's lessons and the 23:59 deadline on top.
 * A lesson opens in a side panel; edits update the rings live.
 */
export function LessonWeek({
  lessons,
  weekStart,
  today,
  canEdit,
  showTeacher,
}: {
  lessons: WeekLesson[];
  /** Monday, YYYY-MM-DD. */
  weekStart: string;
  /** Tashkent day key. */
  today: string;
  canEdit: boolean;
  showTeacher: boolean;
}) {
  const t = useTranslations('lessonPlans.week');
  const [overrides, setOverrides] = useState<Record<string, Values>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => addDaysToKey(weekStart, i)), [weekStart]);
  const filledOf = (l: WeekLesson) => filledFields(overrides[l.id] ?? valuesOf(l));
  const tomorrow = addDaysToKey(today, 1);
  const tomorrowLessons = lessons.filter((l) => l.lesson_date === tomorrow && !l.moved_to_lesson_id);
  const tFull = tomorrowLessons.filter((l) => filledOf(l) === 5).length;
  const tEmpty = tomorrowLessons.filter((l) => filledOf(l) === 0).length;
  const open = lessons.find((l) => l.id === openId) ?? null;
  const weekdays = t.raw('weekdays') as string[];

  return (
    <div className="flex flex-col gap-4">
      {/* Tomorrow + deadline */}
      <section className={cn(SURFACE_CARD, 'flex flex-wrap items-center gap-4 p-4 sm:p-5')}>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-[0.06em] text-au-accent-text uppercase">{t('tomorrow')}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <b className="text-xl text-au-ink tabular-nums">{tomorrowLessons.length}</b>
            <span className="text-au-muted">{t('lessons')}</span>
            <span className="inline-flex h-6 items-center rounded-full bg-au-ok-soft px-2 text-xs font-bold text-au-ok">● {tFull}</span>
            <span className="inline-flex h-6 items-center rounded-full bg-au-accent-soft px-2 text-xs font-bold text-au-accent-text">◐ {tomorrowLessons.length - tFull - tEmpty}</span>
            <span className="inline-flex h-6 items-center rounded-full bg-au-bad-soft px-2 text-xs font-bold text-au-bad">○ {tEmpty}</span>
          </div>
        </div>
        {tomorrowLessons.length > 0 && tFull < tomorrowLessons.length && <Countdown deadline={planDeadline(tomorrow).getTime()} />}
        {tomorrowLessons.length > 0 && tFull === tomorrowLessons.length && (
          <span className="ms-pop-in inline-flex h-8 items-center gap-1.5 rounded-full bg-au-ok-soft px-3 text-sm font-bold text-au-ok">
            <Sparkles className="size-4" aria-hidden /> {t('allReady')}
          </span>
        )}
      </section>

      {/* Week navigation */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-au-ink">
          {days[0].slice(8)}.{days[0].slice(5, 7)} — {days[5].slice(8)}.{days[5].slice(5, 7)}
        </h2>
        <div className="flex items-center gap-1">
          <Link href={`?tab=week&week=${addDaysToKey(weekStart, -7)}`} aria-label={t('prev')} className="grid size-8 place-items-center rounded-[8px] text-au-muted hover:bg-au-card-2 hover:text-au-ink">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href="?tab=week" className="h-8 rounded-[8px] px-2.5 text-xs leading-8 font-semibold text-au-muted hover:bg-au-card-2 hover:text-au-ink">
            {t('thisWeek')}
          </Link>
          <Link href={`?tab=week&week=${addDaysToKey(weekStart, 7)}`} aria-label={t('next')} className="grid size-8 place-items-center rounded-[8px] text-au-muted hover:bg-au-card-2 hover:text-au-ink">
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      {/* Mon–Sat; phones scroll sideways with snap */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 xl:grid-cols-6">
        {days.map((day, di) => {
          const list = lessons.filter((l) => l.lesson_date === day);
          const isToday = day === today;
          return (
            <section
              key={day}
              className={cn('ms-rise flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col gap-2 rounded-au-card border p-2.5 md:w-auto md:max-w-none', isToday ? 'border-au-accent bg-au-accent-soft/30' : 'border-au-line bg-au-card-2/40')}
              style={{ ['--i' as string]: di }}
              aria-label={day}
            >
              <header className="flex items-baseline justify-between px-1">
                <span className={cn('text-sm font-bold', isToday ? 'text-au-accent-text' : 'text-au-ink')}>{weekdays[di]}</span>
                <span className="text-xs text-au-faint tabular-nums">{day.slice(8)}.{day.slice(5, 7)}</span>
              </header>
              {list.length === 0 && <p className="px-1 py-3 text-center text-xs text-au-faint">{t('noLessons')}</p>}
              {list.map((l) => {
                const f = filledOf(l);
                const moved = !!l.moved_to_lesson_id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setOpenId(l.id)}
                    className={cn(
                      'group/l flex items-center gap-2.5 rounded-au-ctl border bg-au-card p-2.5 text-left shadow-au-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-au-card-hover focus-visible:ring-2 focus-visible:ring-au-accent focus-visible:outline-none',
                      l.verdict === 'needs_work' ? 'border-au-bad/40' : 'border-au-line',
                      moved && 'opacity-60',
                    )}
                  >
                    <CompletionRing filled={moved ? 5 : f} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-au-ink">{l.group_name}</span>
                      <span className="block truncate text-[11px] text-au-muted">
                        {[l.time, showTeacher ? l.teacher : null, l.topic || t('noTopic')].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {l.verdict === 'ok' && <Check className="size-4 shrink-0 text-au-ok" aria-label={t('reviewedOk')} />}
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpenId(null)}>
        {open && (
          <LessonPanel
            key={open.id}
            lesson={open}
            canEdit={canEdit && open.lesson_date >= today.slice(0, 7)}
            onClose={() => setOpenId(null)}
            onValues={(id, v) => setOverrides((o) => ({ ...o, [id]: v }))}
          />
        )}
      </Sheet>
    </div>
  );
}
