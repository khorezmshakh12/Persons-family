'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { fmtMln, type Course } from '@/lib/accounting';
import { saveCourseAction } from '@/lib/actions/accounting';
import {
  removeDebtorAction,
  saveDebtorAction,
  saveFinMonthAction,
  saveFinSettingsAction,
} from '@/lib/actions/strategy-finance';
import { AGE, ageOf, capacityOf, debtSummary, type AgeKey, type FinInputs, type FinShift, type monthInputs } from '@/lib/strategy-finance';
import { MONF } from '@/lib/strategy';
import { toast } from './suite-shell';
import type { BooksLite } from './view-finance';

function errText(code: string) {
  if (code === 'forbidden') return "Ruxsat yo'q";
  if (code === 'sessionExpired') return 'Sessiya tugadi — qayta kiring';
  if (code === 'invalidInput') return "Ma'lumot noto'g'ri";
  if (code === 'notFound') return 'Topilmadi — sahifani yangilang';
  return 'Saqlab bo‘lmadi, qayta urinib ko‘ring';
}
const num = (v: string) => Math.max(0, Number(v) || 0);
const ming = (v: number) => `${Math.round(v / 1e3).toLocaleString('ru-RU').replace(/\s/g, ' ')} ming`;

function Field({ label, unit, value, onChange }: { label: string; unit: string; value: string | number; onChange: (v: string) => void }) {
  return (
    <label className="fn-fi">
      <span>{label}</span>
      <span className="u">
        <input type="number" min={0} className="sx-inp" value={value} onChange={(e) => onChange(e.target.value)} />
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
  const [st, setSt] = useState(fin.settings);
  const [m, setM] = useState({
    students: inp.students === null ? '' : String(inp.students),
    paid: String(inp.paid),
    newS: inp.newFromLeads ? '' : String(inp.newStudents ?? ''),
  });
  const courseN = books.courses.reduce((a, c) => a + c.students, 0);

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
            <div className="sx-empty">
              Kurs yo‘q — <Link href="/accounting">Hisob-kitob → Xarajat & marja</Link> bo‘limida qo‘shing
            </div>
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
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c, i) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      {(['students', 'fee', 'teacher_cost', 'book_cost'] as CourseKey[]).map((k) => (
                        <td key={k}>
                          <input
                            type="number"
                            min={0}
                            value={c[k]}
                            aria-label={`${c.name} · ${k}`}
                            onChange={(e) => setCourses((list) => list.map((x, j) => (j === i ? { ...x, [k]: num(e.target.value) } : x)))}
                            onBlur={() => saveCourse(courses[i])}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
          <Field label="Jami o‘quvchilar (bu oy)" unit="ta" value={m.students} onChange={(v) => setM((x) => ({ ...x, students: v }))} />
          {courseN > 0 && String(courseN) !== m.students && (
            <button className="fn-link" onClick={() => setM((x) => ({ ...x, students: String(courseN) }))}>
              Kurslardan olish ({courseN})
            </button>
          )}
          <Field label="Bu oy to‘lov qilganlar" unit="ta" value={m.paid} onChange={(v) => setM((x) => ({ ...x, paid: v }))} />
          <label className="fn-fi">
            <span>Bu oy yangi o‘quvchilar</span>
            <span className="u">
              <input
                type="number"
                min={0}
                className="sx-inp"
                placeholder={`lidlardan: ${fin.enrolled[ym] ?? 0}`}
                value={m.newS}
                onChange={(e) => setM((x) => ({ ...x, newS: e.target.value }))}
              />
              <em>ta</em>
            </span>
          </label>
          <button className="sx-btn primary sm mt-2 w-full justify-center" disabled={pending} onClick={save}>
            {pending ? 'Saqlanmoqda…' : 'Saqlash va qayta hisoblash'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ debtors */

type Form = { id?: string; name: string; phone: string; courseId: string; grp: string; amount: string; dueDate: string };
const EMPTY = (today: string): Form => ({ name: '', phone: '', courseId: '', grp: '', amount: '', dueDate: today });

const smsHref = (phones: string[], body: string) => `sms:${phones.join(',')}?body=${encodeURIComponent(body)}`;

export function DebtorsModal({ fin, courses, today, onClose }: { fin: FinInputs; courses: Course[]; today: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | AgeKey>('all');
  const [form, setForm] = useState<Form | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const cn = (id: string | null) => courses.find((c) => c.id === id)?.name ?? '—';
  const d = useMemo(() => debtSummary(fin.debtors.filter((x) => !gone.has(x.id)), today), [fin.debtors, gone, today]);
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

  const remove = (id: string, paid: boolean, name: string, amount: number) =>
    start(async () => {
      const res = await removeDebtorAction({ id, paid });
      if (res.error) return void toast.error(errText(res.error));
      setGone((s) => new Set(s).add(id));
      toast.success(paid ? `${name} — to‘lov qabul qilindi (+${ming(amount)})` : `${name} ro‘yxatdan olindi`);
      router.refresh();
    });

  const submit = () => {
    if (!form) return;
    start(async () => {
      const res = await saveDebtorAction({
        id: form.id,
        name: form.name,
        phone: form.phone,
        courseId: form.courseId || null,
        grp: form.grp,
        amount: num(form.amount),
        dueDate: form.dueDate,
      });
      if (res.error) return void toast.error(errText(res.error));
      toast.success(form.id ? 'Qarzdor yangilandi' : 'Qarzdor qo‘shildi');
      setForm(null);
      router.refresh();
    });
  };

  return (
    <div className="fn-dmbg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fn-dm" role="dialog" aria-modal="true" aria-label="Qarzdorlar ro‘yxati">
        <div className="fn-dmh">
          <div className="ic">!</div>
          <div>
            <h3>Qarzdorlar ro‘yxati</h3>
            <p>To‘lov muddati o‘tgan o‘quvchilar · {mon}</p>
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
          <button className="sx-btn primary sm" onClick={() => setForm(EMPTY(today))}>
            + Qarzdor
          </button>
        </div>
        {form && (
          <div className="fn-dmf">
            <input className="sx-inp" placeholder="Ism familiya" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="sx-inp" placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <select className="sx-inp" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} aria-label="Kurs">
              <option value="">Kurs —</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input className="sx-inp" placeholder="Guruh" value={form.grp} onChange={(e) => setForm({ ...form, grp: e.target.value })} />
            <input className="sx-inp" type="number" min={0} placeholder="Qarz, so‘m" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <label className="fn-due">
              <span>To‘lov muddati</span>
              <input className="sx-inp" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </label>
            <button className="sx-btn primary sm" disabled={pending || !form.name.trim() || num(form.amount) <= 0} onClick={submit}>
              Saqlash
            </button>
            <button className="sx-btn sm" onClick={() => setForm(null)}>
              Bekor
            </button>
          </div>
        )}
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
                        <button
                          onClick={() =>
                            setForm({
                              id: x.id,
                              name: x.name,
                              phone: x.phone,
                              courseId: x.course_id ?? '',
                              grp: x.grp,
                              amount: String(x.amount),
                              dueDate: x.due_date,
                            })
                          }
                        >
                          Tahrir
                        </button>
                        <button className="pay" disabled={pending} onClick={() => remove(x.id, true, x.name, x.amount)}>
                          To‘landi
                        </button>
                        <button disabled={pending} onClick={() => remove(x.id, false, x.name, x.amount)} aria-label="O‘chirish">
                          ✕
                        </button>
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
