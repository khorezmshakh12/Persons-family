'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { TASHKENT_OFFSET_MS } from '@/lib/time';
import { setSubstituteAction } from '@/lib/actions/operations';
import { fmtMin, isScheduled, overlaps, toMin, type SchedGroup } from '@/lib/ops-schedule';
import { playSound, toast } from './suite-shell';
import { courseColor, toSched } from './ops-schedule-timeline';
import type { OpsData } from './operations-workspace';
import { KIND } from './ops-calendar';

type Att = OpsData['today']['attendance'][number];
const nowMinutes = () => Math.floor(((Date.now() + TASHKENT_OFFSET_MS) % 864e5) / 6e4);

/** How the group's teacher stands today, from HR › Davomat. */
function teacherState(a: Att | undefined): { tone: 'ok' | 'warn' | 'bad' | 'mute'; text: string; problem: boolean } {
  if (!a) return { tone: 'mute', text: 'Belgilanmagan', problem: false };
  if (a.status === 'absent') return { tone: 'bad', text: 'Kelmadi', problem: true };
  if (a.status === 'left') return { tone: 'bad', text: 'Ketib qolgan', problem: true };
  if (a.status === 'late') return { tone: 'warn', text: `Kechikdi${a.check_in ? ` · ${a.check_in}` : ''}`, problem: true };
  return { tone: 'ok', text: a.status === 'remote' ? 'Masofadan' : `Keldi${a.check_in ? ` · ${a.check_in}` : ''}`, problem: false };
}

/**
 * Operation HQ › Bugun (2026-10-22): today's lessons on today's cohort, the
 * teachers HR marked absent/late with substitutes who are free at that hour
 * (same course first), and the rooms free right now.
 */
export function TodayOps({ data, capOf, rooms }: { data: OpsData; capOf: (r: string) => number; rooms: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(nowMinutes());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const { today } = data;
  const all = useMemo(() => toSched(data.groups), [data.groups]);
  const lessons = useMemo(
    () => all.filter((g): g is SchedGroup & { cohort: 'odd' | 'even' } => isScheduled(g) && g.cohort === today.cohort).sort((a, b) => toMin(a.time) - toMin(b.time)),
    [all, today.cohort],
  );
  const att = useMemo(() => new Map(today.attendance.map((a) => [a.profile_id, a])), [today.attendance]);
  const subOf = useMemo(() => new Map(today.subs.map((s) => [s.group_id, s.teacher_id])), [today.subs]);
  const nameOf = (id: string) => data.staff.find((s) => s.id === id)?.name ?? '—';
  const end = (g: SchedGroup) => toMin(g.time) + g.duration;
  const phase = (g: SchedGroup) => (now === null ? 'wait' : now >= end(g) ? 'done' : now >= toMin(g.time) ? 'live' : 'wait');

  // Teachers on today's lessons whose HR mark is a problem, lessons not over yet.
  const problems = lessons.filter((g) => g.teacher_id && teacherState(att.get(g.teacher_id)).problem && phase(g) !== 'done');

  // Who can take group g: a teacher not marked absent, with no own lesson or
  // substitution overlapping it today. Same course first, then those in office.
  const candidates = (g: SchedGroup) => {
    const pool = new Set([...today.teacherIds, ...all.flatMap((x) => (x.teacher_id ? [x.teacher_id] : []))]);
    pool.delete(g.teacher_id ?? '');
    return [...pool]
      .filter((id) => {
        const s = att.get(id)?.status;
        if (s === 'absent' || s === 'left') return false;
        const busy = lessons.some((o) => o.id !== g.id && (o.teacher_id === id || subOf.get(o.id) === id) && overlaps(o.time, o.duration, g.time, g.duration));
        return !busy;
      })
      .map((id) => {
        const same = all.some((o) => o.teacher_id === id && o.course.trim().toLowerCase() === g.course.trim().toLowerCase() && g.course.trim() !== '');
        const inOffice = att.get(id)?.status === 'office';
        return { id, name: nameOf(id), same, inOffice, score: (same ? 2 : 0) + (inOffice ? 1 : 0) };
      })
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 3);
  };

  const assign = (groupId: string, teacherId: string | null, ok: string) =>
    start(async () => {
      const r = await setSubstituteAction(groupId, teacherId);
      if (r.error) {
        playSound('err');
        toast.error(r.error === 'forbidden' ? "Ruxsat yo'q" : "Saqlab bo'lmadi");
        return;
      }
      playSound('ok');
      toast.success(ok);
      router.refresh();
    });

  // Rooms free right now, and until when.
  const freeRooms =
    now === null
      ? []
      : rooms
          .filter((r) => !lessons.some((g) => g.room === r && phase(g) === 'live'))
          .map((r) => {
            const next = lessons.filter((g) => g.room === r && toMin(g.time) > now)[0];
            return { room: r, until: next ? next.time : null, cap: capOf(r) };
          });
  const live = lessons.filter((g) => phase(g) === 'live').length;
  const done = lessons.filter((g) => phase(g) === 'done').length;

  const events = data.calendar.filter((e) => e.day === today.day);
  const holiday = events.find((e) => e.kind === 'holiday');
  if (!today.cohort || holiday)
    return (
      <div className="sx-card">
        <div className="sx-empty">{holiday ? `Bugun ${holiday.title} — darslar yo‘q.` : 'Bugun yakshanba — darslar yo‘q.'}</div>
      </div>
    );

  return (
    <div className="sx-grid">
      {events.length > 0 && (
        <div className="sx-card s12 flex flex-wrap items-center gap-2 !py-3">
          <b className="text-sm text-au-ink">Bugun kalendarda:</b>
          {events.map((e) => (
            <span key={e.id} className={cn('sx-pl', KIND[e.kind].tone)}>
              {KIND[e.kind].n} · {e.title}
              {e.time ? ` · ${e.time}` : ''}
              {e.room ? ` · ${e.room}` : ''}
            </span>
          ))}
        </div>
      )}
      <div className="sx-card sx-stat dark s3">
        <div className="l">Bugungi darslar</div>
        <div className="v">{lessons.length}</div>
        <div className="d">{today.cohort === 'odd' ? 'toq kun · Du-Chor-Ju' : 'juft kun · Se-Pay-Sha'} · {done} tasi tugadi</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Hozir darsda</div>
        <div className="v">{now === null ? '—' : live}</div>
        <div className="d">{now === null ? '' : `soat ${fmtMin(now)}`}</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">O‘qituvchi muammosi</div>
        <div className="v" style={{ color: problems.length ? 'var(--au-bad)' : 'var(--au-ok)' }}>{problems.length}</div>
        <div className="d">{problems.length ? 'kelmagan yoki kechikkan' : 'hammasi joyida'}</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Hozir bo‘sh xonalar</div>
        <div className="v">{now === null ? '—' : `${freeRooms.length}/${rooms.length}`}</div>
      </div>

      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Bugungi darslar</h3>
          <small>HR › Davomat bo‘yicha o‘qituvchi holati</small>
        </div>
        {lessons.length === 0 ? (
          <div className="sx-empty">Bugun jadvalda dars yo‘q</div>
        ) : (
          <div className="sx-tw max-h-[420px] overflow-auto">
            <table className="sx-tbl">
              <thead>
                <tr>
                  <th className="l">Vaqt</th>
                  <th className="l">Guruh</th>
                  <th className="l">Xona</th>
                  <th className="l">O‘qituvchi</th>
                  <th className="l">Holat</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((g) => {
                  const st = teacherState(g.teacher_id ? att.get(g.teacher_id) : undefined);
                  const sub = subOf.get(g.id);
                  const ph = phase(g);
                  return (
                    <tr key={g.id} className={cn(ph === 'done' && 'opacity-55')}>
                      <td className="l whitespace-nowrap">
                        {g.time}–{fmtMin(end(g))}
                      </td>
                      <td className="l">
                        <i className="mr-2 inline-block h-2.5 w-1 rounded-full align-middle" style={{ background: courseColor(g.course) }} />
                        <b>{g.name}</b>
                      </td>
                      <td className="l">{g.room}</td>
                      <td className="l">
                        {sub ? (
                          <>
                            <s className="text-au-faint">{g.teacher || '—'}</s> → <b>{nameOf(sub)}</b>
                          </>
                        ) : (
                          <>
                            {g.teacher || '—'} {g.teacher_id && <span className={cn('sx-pl', st.tone)}>{st.text}</span>}
                          </>
                        )}
                      </td>
                      <td className="l">
                        <span className={cn('sx-pl', ph === 'live' ? 'ok' : ph === 'done' ? 'mute' : 'info')}>
                          {ph === 'live' ? 'Hozir' : ph === 'done' ? 'Tugadi' : 'Kutilmoqda'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Hozir bo‘sh xonalar</h3>
          <small>sinov darsi yoki otrabotka uchun</small>
        </div>
        {now === null ? null : freeRooms.length === 0 ? (
          <div className="sx-empty">Hozir hamma xona band</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {freeRooms.map((r) => (
              <li key={r.room} className="flex items-center gap-2 rounded-lg border border-au-line px-3 py-2 text-sm">
                <b className="text-au-ink">{data.rooms.find((x) => x.code === r.room)?.title || r.room}</b>
                <span className="text-xs text-au-muted">{r.cap} o‘rin</span>
                <span className="flex-1" />
                <span className={cn('sx-pl', r.until ? 'warn' : 'ok')}>{r.until ? `${r.until} gacha bo‘sh` : 'kun oxirigacha bo‘sh'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Kelmagan va kechikkan o‘qituvchilar</h3>
          <small>o‘rinbosar — shu soatda bo‘sh, avval shu kursni o‘qitadiganlar</small>
        </div>
        {problems.length === 0 ? (
          <div className="sx-empty">Bugungi darslarda o‘qituvchi muammosi yo‘q ✓</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {problems.map((g) => {
              const st = teacherState(att.get(g.teacher_id!));
              const sub = subOf.get(g.id);
              const list = candidates(g);
              return (
                <li key={g.id} className={cn('rounded-lg border px-3 py-2.5', st.tone === 'bad' ? 'border-au-bad/30 bg-au-bad-soft' : 'border-au-accent/30 bg-au-accent-soft/60')}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <b className="text-au-ink">{g.teacher}</b>
                    <span className={cn('sx-pl', st.tone)}>{st.text}</span>
                    <span className="text-au-muted">
                      · {g.name} · {g.room} · {g.time}–{fmtMin(end(g))}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {sub ? (
                      <>
                        <span className="sx-pl ok">O‘rinbosar: {nameOf(sub)}</span>
                        {data.canEdit && (
                          <button className="sx-btn sm" disabled={pending} onClick={() => assign(g.id, null, 'O‘rinbosar bekor qilindi')}>
                            Bekor qilish
                          </button>
                        )}
                      </>
                    ) : list.length === 0 ? (
                      <span className="text-xs text-au-muted">Shu soatda bo‘sh o‘qituvchi topilmadi</span>
                    ) : (
                      list.map((c) => (
                        <button
                          key={c.id}
                          className="sx-btn sm"
                          disabled={pending || !data.canEdit}
                          title={data.canEdit ? 'O‘rinbosar qilib tayinlash' : "Tayinlashga ruxsat yo'q"}
                          onClick={() => assign(g.id, c.id, `${c.name} → ${g.name}`)}
                        >
                          {c.name}
                          {c.same && <span className="text-xs text-au-ok"> · shu kurs</span>}
                          {data.canEdit && <span className="text-xs text-au-muted"> · Tayinlash</span>}
                        </button>
                      ))
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
