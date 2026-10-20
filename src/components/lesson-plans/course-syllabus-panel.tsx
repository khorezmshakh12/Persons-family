'use client';

import { Fragment, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { tagSyllabusAction, importTopicsAction } from '@/lib/actions/course-syllabus';

export type SyllabusRow = { pos: number | null; type: string; topic: string | null };

const TYPE_LABEL: Record<string, string> = {
  lesson: 'Dars',
  progress_test: 'Progress test',
  midterm: 'Oraliq imtihon',
  month_test: 'Oylik test',
  final_test: 'Yakuniy test',
};
const TYPE_CLS: Record<string, string> = {
  lesson: 'border-au-line text-au-muted',
  progress_test: 'border-au-accent/40 text-au-accent-text bg-au-accent-soft',
  midterm: 'border-indigo-400/50 text-indigo-700 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-500/10',
  month_test: 'border-amber-400/50 text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/10',
  final_test: 'border-au-bad/40 text-au-bad bg-au-bad/5',
};

/** Kurs rejasi (3 oy · 36 dars) — standart shablon: oraliq imtihon 18,
 * progress test 7/13/19/25/31, oylik test 12/24, yakuniy 36. Guruh sahifasi
 * ochilganda avtomatik to'ldiriladi; ustoz o'zgartira oladi. CSV («dars#,mavzu»)
 * orqali mavzu yuklanadi. */
export function CourseSyllabusPanel({ groupId, canManage, rows }: { groupId: string; canManage: boolean; rows: SyllabusRow[] }) {
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const tagged = rows.some((r) => r.pos !== null);

  const tag = () =>
    start(async () => {
      setMsg('');
      const res = await tagSyllabusAction(groupId);
      setMsg('ok' in res ? `✓ ${res.count ?? 0} dars belgilandi` : `Xatolik: ${res.error}`);
    });
  const imp = () =>
    start(async () => {
      setMsg('');
      const res = await importTopicsAction(groupId, csv);
      if ('ok' in res) { setMsg(`✓ ${res.count ?? 0} mavzu yuklandi`); setCsv(''); } else setMsg(`Xatolik: ${res.error}`);
    });

  return (
    <div className="flex flex-col gap-3 rounded-au-card border border-au-line bg-au-card p-5">
      <div>
        <h3 className="text-base font-bold text-au-ink">Kurs rejasi · 3 oy · 36 dars</h3>
        <p className="text-sm text-au-muted">Oraliq imtihon 18 · progress test 7/13/19/25/31 · oylik test 12/24 · yakuniy 36. Guruh ochilganda avtomatik to‘ldiriladi, ustoz o‘zgartira oladi.</p>
      </div>

      {canManage && (
        <div className="flex flex-col gap-2 rounded-au-ctl border border-au-line bg-au-card-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={tag} disabled={pending} className="rounded-au-ctl bg-au-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
              Rejani qayta belgilash (3 oy + imtihonlar)
            </button>
            {msg && <span className="text-xs text-au-muted">{msg}</span>}
          </div>
          <label className="text-xs font-semibold text-au-muted">Mavzularni yuklash — CSV («dars#,mavzu» har qatorда; Excel’dan «Save as CSV»):</label>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={4}
            placeholder={'1,Tanishuv va kirish\n2,Present Simple\n7,Progress test 1'}
            className="w-full rounded-au-ctl border border-au-line bg-au-card px-3 py-2 font-mono text-xs text-au-ink outline-none focus:border-au-accent"
          />
          <button type="button" onClick={imp} disabled={pending || !csv.trim() || !tagged} className="self-start rounded-au-ctl border border-au-line px-3 py-1.5 text-sm font-semibold text-au-ink disabled:opacity-40">
            Mavzularni yuklash
          </button>
          {!tagged && <span className="text-xs text-au-muted">Avval «Rejani belgilash»ни bosing.</span>}
        </div>
      )}

      {tagged && (
        <div className="max-h-[360px] overflow-y-auto rounded-au-ctl border border-au-line">
          <table className="w-full text-sm">
            <tbody>
              {rows
                .filter((r) => r.pos !== null)
                .map((r, idx, list) => {
                  const month = Math.ceil((r.pos as number) / 12);
                  const prevMonth = idx > 0 ? Math.ceil((list[idx - 1].pos as number) / 12) : 0;
                  return (
                    <Fragment key={r.pos}>
                      {month !== prevMonth && (
                        <tr className="bg-au-card-2">
                          <td colSpan={3} className="px-3 py-1.5 text-[11px] font-bold tracking-wide text-au-muted uppercase">
                            {month}-oy
                          </td>
                        </tr>
                      )}
                      <tr className="border-b border-au-line last:border-0">
                        <td className="w-10 px-3 py-2 text-au-faint tabular-nums">{r.pos}</td>
                        <td className="px-2 py-2">
                          <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', TYPE_CLS[r.type] ?? TYPE_CLS.lesson)}>
                            {TYPE_LABEL[r.type] ?? r.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-au-ink">{r.topic || <span className="text-au-faint">—</span>}</td>
                      </tr>
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
