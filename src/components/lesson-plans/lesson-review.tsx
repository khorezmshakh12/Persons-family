'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, PencilLine, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { SURFACE_CARD } from '@/lib/glass';
import { addDaysToKey } from '@/lib/time';
import { filledFields } from '@/lib/lesson-plan-status';
import { aiScoreLessonAction, reviewLessonAction } from '@/lib/actions/lesson-review';
import { celebrate } from '@/components/motion/events';
import { CompletionRing } from './lesson-week';
import type { DisciplineRow, WeekLesson } from '@/lib/lesson-week-data';

/* ------------------------------------------------------------ review queue */

/**
 * Head teacher / CEO: one day's plans as a two-pane queue — unreviewed
 * first; a verdict slides the next one in. Jev's score is advisory.
 */
export function LessonReviewQueue({ lessons, day, today }: { lessons: WeekLesson[]; day: string; today: string }) {
  const t = useTranslations('lessonPlans.review');
  const tl = useTranslations('lessonPlans');
  const [state, setState] = useState<Record<string, { verdict?: 'ok' | 'needs_work'; ai?: number | null }>>({});
  const items = lessons.filter((l) => !l.moved_to_lesson_id);
  const verdictOf = (l: WeekLesson) => state[l.id]?.verdict ?? l.verdict;
  const ordered = [...items].sort((a, b) => Number(!!verdictOf(a)) - Number(!!verdictOf(b)));
  const [sel, setSel] = useState<string | null>(ordered[0]?.id ?? null);
  const [note, setNote] = useState('');
  const [busy, start] = useTransition();
  const current = items.find((l) => l.id === sel) ?? null;
  const done = items.filter((l) => verdictOf(l)).length;

  const next = (fromId: string) => {
    const i = ordered.findIndex((l) => l.id === fromId);
    const rest = [...ordered.slice(i + 1), ...ordered.slice(0, Math.max(0, i))];
    return rest.find((l) => !verdictOf(l) && l.id !== fromId)?.id ?? fromId;
  };

  const decide = (verdict: 'ok' | 'needs_work') => {
    if (!current) return;
    start(async () => {
      const res = await reviewLessonAction({ lessonId: current.id, verdict, note });
      if (res.error) return void toast.error(t(`errors.${res.error === 'noteRequired' ? 'noteRequired' : 'failed'}`));
      setState((s) => ({ ...s, [current.id]: { ...s[current.id], verdict } }));
      if (verdict === 'ok') celebrate();
      toast.success(verdict === 'ok' ? t('okDone') : t('sentBack'));
      setNote('');
      setSel(next(current.id));
    });
  };

  const askAi = () => {
    if (!current) return;
    start(async () => {
      const res = await aiScoreLessonAction(current.id);
      if (res.error) return void toast.error(t('aiUnavailable'));
      setState((s) => ({ ...s, [current.id]: { ...s[current.id], ai: res.aiScore } }));
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {[today, addDaysToKey(today, 1)].map((d) => (
          <Link key={d} href={`?tab=review&day=${d}`} className={cn('inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold', d === day ? 'bg-au-accent text-au-accent-ink' : 'bg-au-card-2 text-au-muted hover:text-au-ink')}>
            {d === today ? t('today') : t('tomorrow')} · {d.slice(8)}.{d.slice(5, 7)}
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <p className={cn(SURFACE_CARD, 'p-8 text-center text-sm text-au-muted')}>{t('empty')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
          <div className={cn(SURFACE_CARD, 'flex flex-col gap-1 p-2 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto')}>
            <div className="px-2 pt-1 pb-2">
              <div className="mb-1 flex justify-between text-[11px] font-semibold text-au-muted">
                <span>{t('progress')}</span>
                <span className="tabular-nums">
                  {done}/{items.length}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-au-card-2">
                <div className="h-full rounded-full bg-au-ok transition-[width] duration-500 ease-out" style={{ width: `${(done / items.length) * 100}%` }} />
              </div>
            </div>
            {ordered.map((l, i) => {
              const v = verdictOf(l);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSel(l.id)}
                  aria-current={sel === l.id ? 'true' : undefined}
                  className={cn('ms-rise flex items-center gap-2.5 rounded-au-ctl px-2.5 py-2 text-left transition-colors', sel === l.id ? 'bg-au-accent-soft ring-1 ring-au-accent/40' : 'hover:bg-au-card-2')}
                  style={{ ['--i' as string]: Math.min(i, 8) }}
                >
                  <CompletionRing filled={filledFields(l)} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-au-ink">{l.group_name}</span>
                    <span className="block truncate text-[11px] text-au-faint">{[l.teacher, l.time].filter(Boolean).join(' · ')}</span>
                  </span>
                  {v === 'ok' && <Check className="size-4 text-au-ok" aria-label={t('ok')} />}
                  {v === 'needs_work' && <PencilLine className="size-4 text-au-bad" aria-label={t('needsWork')} />}
                </button>
              );
            })}
          </div>

          {current && (
            <article key={current.id} className={cn(SURFACE_CARD, 'ms-enter-right flex flex-col gap-4 p-5')}>
              <header className="flex flex-wrap items-center gap-3">
                <CompletionRing filled={filledFields(current)} size={44} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-bold text-au-ink">
                    {current.group_name} · #{current.lesson_number}
                  </h3>
                  <p className="text-xs text-au-muted">{[current.teacher, current.lesson_date, current.time].filter(Boolean).join(' · ')}</p>
                </div>
                {(state[current.id]?.ai ?? current.ai_score) ? (
                  <span className="ms-pop-in inline-flex h-7 items-center gap-1 rounded-full bg-au-info-soft px-2.5 text-xs font-bold text-au-info">
                    <Sparkles className="size-3.5" aria-hidden /> Jev {state[current.id]?.ai ?? current.ai_score}/5
                  </span>
                ) : (
                  <button type="button" onClick={askAi} disabled={busy} className="inline-flex h-7 items-center gap-1 rounded-full bg-au-info-soft px-2.5 text-xs font-bold text-au-info hover:opacity-85">
                    <Sparkles className="size-3.5" aria-hidden /> {t('askAi')}
                  </button>
                )}
              </header>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {(
                  [
                    ['topic', tl('courseLessons.topic')],
                    ['aim', tl('courseLessons.aim')],
                    ['language_focus', tl('courseLessons.languageFocus')],
                    ['anticipated_problems', tl('courseLessons.anticipatedProblems')],
                    ['homework', tl('courseLessons.homework')],
                    ['materials', tl('courseLessons.materials')],
                  ] as const
                ).map(([k, label]) => (
                  <div key={k} className="rounded-au-ctl bg-au-card-2 p-3">
                    <dt className="mb-1 text-[11px] font-semibold tracking-wider text-au-muted uppercase">{label}</dt>
                    <dd className={cn('whitespace-pre-wrap', current[k] ? 'text-au-ink' : 'text-au-faint italic')}>{current[k] || tl('courseLessons.notSet')}</dd>
                  </div>
                ))}
              </dl>
              {current.procedure.length > 0 && (
                <ol className="grid gap-1 rounded-au-ctl bg-au-card-2 p-3 text-[13px]">
                  {current.procedure.map((s, i) => (
                    <li key={i} className="grid grid-cols-[56px_1fr_auto] gap-2">
                      <span className="text-au-muted tabular-nums">{s.time}</span>
                      <span className="text-au-ink">{s.stage}</span>
                      <span className="text-au-faint">{s.interaction}</span>
                    </li>
                  ))}
                </ol>
              )}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                placeholder={t('notePlaceholder')}
                className="min-h-[72px] w-full rounded-au-ctl border border-au-line bg-au-card px-3 py-2 text-sm text-au-ink outline-none focus:border-au-accent"
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => decide('ok')} className="inline-flex h-9 items-center gap-1.5 rounded-au-ctl bg-au-ok px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  <Check className="size-4" /> {t('ok')}
                </button>
                <button type="button" disabled={busy} onClick={() => decide('needs_work')} className="inline-flex h-9 items-center gap-1.5 rounded-au-ctl border border-au-bad/40 bg-au-bad-soft px-4 text-sm font-semibold text-au-bad hover:opacity-90 disabled:opacity-50">
                  <PencilLine className="size-4" /> {t('needsWork')}
                </button>
              </div>
            </article>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ discipline */

const CELL = {
  complete: 'bg-au-ok',
  incomplete: 'bg-au-accent',
  missing: 'bg-au-bad',
} as const;

/** CEO: teacher × day at the deadline (nightly snapshots), with an on-time %. */
export function LessonDiscipline({ rows, days }: { rows: DisciplineRow[]; days: string[] }) {
  const t = useTranslations('lessonPlans.discipline');
  if (rows.length === 0) return <p className={cn(SURFACE_CARD, 'p-8 text-center text-sm text-au-muted')}>{t('empty')}</p>;
  const pct = (r: DisciplineRow) => {
    const vals = Object.values(r.cells);
    return vals.length ? Math.round((vals.filter((v) => v === 'complete').length / vals.length) * 100) : null;
  };
  const sorted = [...rows].sort((a, b) => (pct(a) ?? 0) - (pct(b) ?? 0));
  return (
    <div className={cn(SURFACE_CARD, 'overflow-x-auto p-4')}>
      <table className="w-full min-w-[640px] border-separate border-spacing-1 text-sm">
        <thead>
          <tr className="text-[10.5px] font-semibold text-au-faint">
            <th className="text-left font-semibold tracking-wide uppercase">{t('teacher')}</th>
            {days.map((d) => (
              <th key={d} className="font-semibold tabular-nums">
                {d.slice(8)}
              </th>
            ))}
            <th className="text-right font-semibold tracking-wide uppercase">{t('onTime')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, ri) => {
            const p = pct(r);
            return (
              <tr key={r.teacher_id}>
                <td className="max-w-[170px] truncate pr-2 font-semibold text-au-ink">{r.teacher}</td>
                {days.map((d, ci) => {
                  const s = r.cells[d];
                  return (
                    <td key={d} className="p-0">
                      <span
                        title={`${d}: ${s ? t(s) : t('noClass')}`}
                        className={cn('ms-wave mx-auto block size-5 rounded-[6px]', s ? CELL[s] : 'bg-au-card-2')}
                        style={{ ['--i' as string]: ri + ci }}
                      />
                    </td>
                  );
                })}
                <td className={cn('pl-2 text-right font-bold tabular-nums', p === null ? 'text-au-faint' : p >= 95 ? 'text-au-ok' : p >= 80 ? 'text-au-accent-text' : 'text-au-bad')}>
                  {p === null ? '—' : `${p}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-au-muted">
        {(['complete', 'incomplete', 'missing'] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <i className={cn('size-3 rounded-[4px]', CELL[s])} /> {t(s)}
          </span>
        ))}
      </div>
    </div>
  );
}
