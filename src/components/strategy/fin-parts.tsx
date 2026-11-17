'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { fmtMln, type Course } from '@/lib/accounting';
import { deleteCourseAction, saveCourseAction } from '@/lib/actions/accounting';
import { saveFinMonthAction, saveFinSettingsAction } from '@/lib/actions/strategy-finance';
import { AGE, ageOf, capacityOf, debtSummary, type AgeKey, type FinInputs, type FinShift, type monthInputs } from '@/lib/strategy-finance';
import { MONF } from '@/lib/strategy';
import { formatUZS } from '@/lib/format-currency';
import { MoneyInput } from '@/components/ui/money-input';
import { ask, toast } from './suite-shell';
import type { BooksLite } from './view-finance';

function errText(code: string) {
  if (code === 'forbidden') return "Ruxsat yo'q";
  if (code === 'sessionExpired') return 'Sessiya tugadi — qayta kiring';
  if (code === 'invalidInput') return "Ma'lumot noto'g'ri";
  if (code === 'notFound') return 'Topilmadi — sahifani yangilang';
  return 'Saqlab bo‘lmadi, qayta urinib ko‘ring';
}
const num = (v: string) => Math.max(0, Number(v) || 0);
const ming = (v: number) => `${formatUZS(Math.round(v / 1e3))} ming`;

function Field({ label, unit, value, onChange }: { label: string; unit: string; value: string | number; onChange: (v: string) => void }) {
  const displayValue = (value === 0 || value === '0') ? '' : value;
  return (
    <label className="fn-fi">
      <span>{label}</span>
      <span className="u">
        <input type="number" min={0} className="sx-inp" value={displayValue} onChange={(e) => onChange(e.target.value)} />
        <em>{unit}</em>
      </span>
    </label>
  );
}

/* ------------------------------------------------------------ editor */

type CourseKey = 'students' | 'fee' | 'teacher_cost' | 'book_cost';

/** "Oylik ma'lumotlar": course tariffs, fixed costs (read-only, from the
 * journal), capacity + shift mix, gross-margin target and the month's
 * head-counts. Everything saves to the database. */
export function FinEditor({
  books,
  fin,
  ym,
  inp,
  fixed,
}: {
  books: BooksLite;
  fin: FinInputs;
  ym: string;
  inp: ReturnType<typeof monthInputs>;
  fixed: { selling: number; admin: number; other: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [courses, setCourses] = useState(books.courses);
  const [srcCourses, setSrcCourses] = useState(books.courses);
  const [newName, setNewName] = useState('');
  // After add/delete the server list changes — take it, keep other edits.
  if (srcCourses !== books.courses) {
    setSrcCourses(books.courses);
    setCourses(books.courses);
  }
  const [st, setSt] = useState(fin.settings);
  const m = {
    students: inp.students === null ? '' : String(inp.students),
    paid: String(inp.paid),
    newS: inp.newFromLeads ? '' : String(inp.newStudents ?? ''),
  };

  const saveCourse = (c: Course) => {
    const was = books.courses.find((x) => x.id === c.id);
    if (!was || (['students', 'fee', 'teacher_cost', 'book_cost'] as CourseKey[]).every((k) => was[k] === c[k])) return;
    start(async () => {
      const res = await saveCourseAction({
        id: c.id,
        name: c.name,
        fee: c.fee,
        students: Math.round(c.students),
        teacherCost: c.teacher_cost,
        bookCost: c.book_cost,
      });
      if (res.error) return void toast.error(errText(res.error));
      toast.success(`«${c.name}» saqlandi`);
      router.refresh();
    });
  };

  const addCourse = () => {
    const name = newName.trim();
    if (!name) return;
    start(async () => {
      const res = await saveCourseAction({ name, fee: 0, students: 0, teacherCost: 0, bookCost: 0 });
      if (res.error) return void toast.error(errText(res.error));
      toast.success(`«${name}» qo‘shildi`);
      setNewName('');
      router.refresh();
    });
  };

  const removeCourse = async (c: Course) => {
    if (!(await ask(`«${c.name}» kursi o‘chirilsinmi?`))) return;
    start(async () => {
      const res = await deleteCourseAction(c.id);
      if (res.error) return void toast.error(errText(res.error));
      toast.success(`«${c.name}» o‘chirildi`);
      router.refresh();
    });
  };

  const setShift = (i: number, patch: Partial<FinShift>) =>
    setSt((s) => ({ ...s, shifts: s.shifts.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  const save = () =>
    start(async () => {
      const a = await saveFinSettingsAction({ ...st, shifts: st.shifts.filter((x) => x.t.trim()) });
      if (a.error) return void toast.error(errText(a.error));
      const b = await saveFinMonthAction({
        ym,
        students: m.students === '' ? null : Math.round(num(m.students)),
        paid: Math.round(num(m.paid)),
        newStudents: m.newS === '' ? null : Math.round(num(m.newS)),
        capacity: capacityOf(st),
      });
      if (b.error) return void toast.error(errText(b.error));
      toast.success('Ma’lumotlar saqlandi — metrikalar qayta hisoblandi');
      router.refresh();
    });

  return (
    <div className="sx-card fn-ed">
      <div className="fn-edh">
        <b>Oylik ma’lumotlar · {MONF[+ym.slice(5, 7) - 1]} {ym.slice(0, 4)}</b>
        <small>O‘zgartiring — barcha metrikalar darhol qayta hisoblanadi</small>
      </div>
      <div className="fn-edb">
        <div className="fn-edc">
          <h5>Kurslar · tushum va to‘g‘ridan-to‘g‘ri xarajat</h5>
          {courses.length === 0 ? (
            <div className="sx-empty">Kurs yo‘q — quyida qo‘shing</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="fn-crs">
                <thead>
                  <tr>
                    <th>Kurs</th>
                    <th>O‘quvchi</th>
                    <th>Oylik to‘lov, so‘m</th>
                    <th>O‘qituvchi, so‘m/oy</th>
                    <th>Darslik, so‘m/o‘q.</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c, i) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      {(['students', 'fee', 'teacher_cost', 'book_cost'] as CourseKey[]).map((k) => (
                        <td key={k}>
                          {k === 'students' ? (
                            <input
                              type="number"
                              min={0}
                              value={(c[k] === 0 || c[k] === undefined) ? '' : c[k]}
                              aria-label={`${c.name} · ${k}`}
                              onChange={(e) => setCourses((list) => list.map((x, j) => (j === i ? { ...x, [k]: e.target.value === '' ? 0 : num(e.target.value) } : x)))}
                              onBlur={() => saveCourse(courses[i])}
                            />
                          ) : (
                            <MoneyInput
                              className=""
                              placeholder=""
                              value={c[k]}
                              aria-label={`${c.name} · ${k}`}
                              onValue={(v) => setCourses((list) => list.map((x, j) => (j === i ? { ...x, [k]: v ?? 0 } : x)))}
                              onBlur={() => saveCourse(courses[i])}
                            />
                          )}
                        </td>
                      ))}
                      <td>
                        <button className="sx-chipb" disabled={pending} onClick={() => removeCourse(c)} aria-label={`${c.name} kursini o‘chirish`}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="fn-addc">
            <input
              className="sx-inp"
              placeholder="Yangi kurs nomi"
              value={newName}
              maxLength={120}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCourse()}
              aria-label="Yangi kurs nomi"
            />
            <button className="sx-btn sm" disabled={pending || !newName.trim()} onClick={addCourse}>
              + Kurs
            </button>
          </div>
        </div>
        <div className="fn-edc">
          <h5>Doimiy xarajatlar · jurnaldan</h5>
          <div className="fn-ro">
            <span>Marketing (9410)</span>
            <b>{fmtMln(fixed.selling)}</b>
          </div>
          <div className="fn-ro">
            <span>Ma’muriy · ijara, maosh (9420)</span>
            <b>{fmtMln(fixed.admin)}</b>
          </div>
          <div className="fn-ro">
            <span>Boshqa operatsion (9430)</span>
            <b>{fmtMln(fixed.other)}</b>
          </div>
          <Link href="/accounting" className="fn-link">
            Jurnalda kiritish →
          </Link>
          <h5 className="mt-3">Maqsad</h5>
          <Field label="Yalpi marja maqsadi" unit="%" value={st.target} onChange={(v) => setSt((s) => ({ ...s, target: Math.min(100, num(v)) }))} />
        </div>
        <div className="fn-edc">
          <h5>Sig‘im va oy holati</h5>
          <Field label="Xonalar soni" unit="xona" value={st.rooms} onChange={(v) => setSt((s) => ({ ...s, rooms: Math.round(num(v)) }))} />
          <Field label="Xonadagi o‘rinlar" unit="o‘rin" value={st.seats} onChange={(v) => setSt((s) => ({ ...s, seats: Math.round(num(v)) }))} />
          <div className="fn-fi">
            <span>Smenalar · boshlanishi va o‘quvchilar ulushi, %</span>
          </div>
          {st.shifts.map((x, i) => (
            <div key={i} className="fn-shift">
              <input className="sx-inp" type="time" value={x.t} onChange={(e) => setShift(i, { t: e.target.value })} aria-label="Smena vaqti" />
              <input className="sx-inp" type="number" min={0} max={100} value={x.p} onChange={(e) => setShift(i, { p: Math.min(100, num(e.target.value)) })} aria-label="Ulush, %" />
              <button className="sx-chipb" onClick={() => setSt((s) => ({ ...s, shifts: s.shifts.filter((_, j) => j !== i) }))} aria-label="Smenani o‘chirish">
                ✕
              </button>
            </div>
          ))}
          {st.shifts.length < 8 && (
            <button className="sx-btn sm" onClick={() => setSt((s) => ({ ...s, shifts: [...s.shifts, { t: '', p: 0 }] }))}>
              + Smena
            </button>
          )}
          <div className="fn-note">
            Sig‘im: {st.rooms} × {st.seats} × {st.shifts.length} = <b>{capacityOf(st)}</b> o‘rin
          </div>
          {/* Head counts come from Operatsiya HQ now (owner, 2026-11-16) — not typed here. */}
          <div className="fn-note">
            Operatsiya HQ&apos;dan avtomatik: faol o‘quvchilar <b>{inp.students ?? '—'}</b> · bu oy to‘lov qilganlar <b>{inp.paid}</b> · yangi o‘quvchilar{' '}
            <b>{inp.newStudents ?? 0}</b>
          </div>
          <button className="sx-btn primary sm mt-2 w-full justify-center" disabled={pending} onClick={save}>
            {pending ? 'Saqlanmoqda…' : 'Saqlash va qayta hisoblash'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ debtors */

const smsHref = (phones: string[], body: string) => `sms:${phones.join(',')}?body=${encodeURIComponent(body)}`;

export function DebtorsModal({ fin, courses, today, onClose }: { fin: FinInputs; courses: Course[]; today: string; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | AgeKey>('all');
  const cn = (id: string | null) => courses.find((c) => c.id === id)?.name ?? '—';
  const d = useMemo(() => debtSummary(fin.debtors, today), [fin.debtors, today]);
  const list = d.rows.filter(
    (x) => (f === 'all' || ageOf(x.days).k === f) && (!q || `${x.name} ${cn(x.course_id)} ${x.grp}`.toLowerCase().includes(q.toLowerCase().trim())),
  );
  const phones = d.rows.map((x) => x.phone.replace(/[^\d+]/g, '')).filter(Boolean);
  const mon = `${MONF[+today.slice(5, 7) - 1]} ${today.slice(0, 4)}`;

  useEffect(() => {
    const kd = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', kd);
    return () => document.removeEventListener('keydown', kd);
  }, [onClose]);


  return (
    <div className="fn-dmbg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fn-dm" role="dialog" aria-modal="true" aria-label="Qarzdorlar ro‘yxati">
        <div className="fn-dmh">
          <div className="ic">!</div>
          <div>
            <h3>Qarzdorlar ro‘yxati</h3>
            <p>Operatsiya HQ balansi manfiy o‘quvchilar · {mon} · to‘lov va qo‘ng‘iroqlar Operatsiya HQ › O‘quvchilar&apos;da</p>
          </div>
          <button className="sx-chipb ml-auto" onClick={onClose} aria-label="Yopish">
            ✕
          </button>
        </div>
        <div className="fn-dmt">
          <input className="sx-inp" placeholder="Ism, kurs yoki guruh bo‘yicha qidirish…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="sx-seg">
            <button className={f === 'all' ? 'on' : ''} onClick={() => setF('all')}>
              Barchasi
            </button>
            {AGE.map((a) => (
              <button key={a.k} className={f === a.k ? 'on' : ''} onClick={() => setF(a.k)}>
                {a.n}
              </button>
            ))}
          </div>
          {phones.length > 0 ? (
            <a className="sx-btn sm" href={smsHref(phones, `Assalomu alaykum! O‘quv to‘lovingiz muddati o‘tdi. Iltimos, to‘lovni amalga oshiring. — Persons`)}>
              Barchasiga SMS
            </a>
          ) : (
            <button className="sx-btn sm" disabled title="Telefon raqamlari kiritilmagan">
              Barchasiga SMS
            </button>
          )}
        </div>
        <div className="fn-dml">
          {list.length === 0 ? (
            <div className="sx-empty">{d.count === 0 ? 'Qarzdor yo‘q' : 'Hech narsa topilmadi'}</div>
          ) : (
            <table className="sx-tbl">
              <thead>
                <tr>
                  <th className="l">O‘quvchi</th>
                  <th className="l">Kurs</th>
                  <th>Qarz</th>
                  <th className="l">Kechikish</th>
                  <th>Amal</th>
                </tr>
              </thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.id}>
                    <td className="l">
                      <div className="fn-who">
                        <span className="ava">
                          {x.name
                            .split(' ')
                            .map((s) => s[0])
                            .join('')
                            .slice(0, 2)}
                        </span>
                        <span>
                          {x.name}
                          <small>{[x.grp, x.phone].filter(Boolean).join(' · ')}</small>
                        </span>
                      </div>
                    </td>
                    <td className="l">{cn(x.course_id)}</td>
                    <td>
                      <b>{ming(x.amount)}</b>
                    </td>
                    <td className="l">
                      <span className={`fn-dd ${ageOf(x.days).k}`}>{x.days} kun</span>
                    </td>
                    <td>
                      <div className="fn-act">
                        {x.phone ? (
                          <a
                            href={smsHref(
                              [x.phone.replace(/[^\d+]/g, '')],
                              `Assalomu alaykum, ${x.name}! ${cn(x.course_id)} kursi uchun ${ming(x.amount)} so‘m to‘lov muddati ${x.days} kun o‘tdi. — Persons`,
                            )}
                          >
                            Eslatma
                          </a>
                        ) : (
                          <button disabled title="Telefon kiritilmagan">
                            Eslatma
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="fn-dmfoot">
          <span>
            {d.count} o‘quvchi · ko‘rsatilgan: {list.length}
          </span>
          <span>
            Jami qarzdorlik: <b>{fmtMln(d.total)} so‘m</b>
          </span>
        </div>
      </div>
    </div>
  );
}
