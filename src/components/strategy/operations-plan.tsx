'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import type { OpsPlan } from '@/lib/ops-plan';
import { deleteRoomAction, deleteSlotHoldAction, saveRoomAction, saveSlotHoldAction, setGroupEnrollmentAction } from '@/lib/actions/operations';
import { ask, playSound, toast } from './suite-shell';
import type { OpsData } from './operations-workspace';

const errMsg = (e: string) =>
  e === 'forbidden' ? "Ruxsat yo'q" : e === 'invalidInput' ? "Ma'lumot noto'g'ri" : e === 'notFound' ? 'Topilmadi — sahifani yangilang' : "Saqlab bo'lmadi";

/** Run a Server Action with toast + refresh. */
function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) {
        playSound('err');
        toast.error(errMsg(r.error));
      } else {
        toast.success(ok);
        after?.();
        router.refresh();
      }
    });
  return { pending, run };
}

/* ------------------------------------------------------------------ model */
export type Cohort = 'odd' | 'even';
export type OpsModel = {
  plan: OpsPlan;
  rooms: string[];
  times: string[];
  cap: (room: string) => number;
  maxSeats: number;
};

export function buildModel(data: OpsData): OpsModel {
  const plan = data.plan;
  const ok = data.groups.filter((g) => g.room && g.time && g.schedule_type);
  const order = data.rooms.map((r) => r.code);
  const rooms = [...new Set([...order, ...ok.map((g) => g.room), ...data.holds.map((h) => h.room)])].sort(
    (a, b) => (order.includes(a) ? order.indexOf(a) : 1e3) - (order.includes(b) ? order.indexOf(b) : 1e3) || a.localeCompare(b),
  );
  const times = [...new Set([...ok.map((g) => g.time), ...data.holds.map((h) => h.time)])].sort();
  const cap = (room: string) => data.rooms.find((r) => r.code === room)?.capacity ?? plan.seats;
  const maxSeats = rooms.reduce((a, r) => a + cap(r), 0) * times.length * 2;
  return { plan, rooms, times, cap, maxSeats };
}

/* ---------------------------------------------------------------- modals */
function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    playSound('open');
    const kd = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', kd);
    return () => document.removeEventListener('keydown', kd);
  }, []);
  return (
    <div className="sx-modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sx-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="text-lg font-bold">{title}</h3>
            {sub && <p className="text-sm text-au-muted">{sub}</p>}
          </div>
          <button className="sx-btn sm" aria-label="Yopish" onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}


export type Cell =
  | { kind: 'group'; g: OpsData['groups'][number]; clash: number }
  | { kind: 'hold'; h: OpsData['holds'][number] }
  | { kind: 'free' };
const SOP: Record<string, string> = {
  buffer: "LEAN OPERATSION BUFER: slot dars qoldirganlar bilan ishlash (makeup), Speaking Club va metodik birlashma uchun zaxira.",
  trial: "SINOV DARSI: yangi nomzodlar uchun bepul dars va shartnoma yopish. Sotuv bo'limi jalb qilinadi.",
  group: "Dars oralig'ida 10 daqiqalik shamollatish. Davomat CRM ga qayd etiladi.",
  free: "Bo'sh katak: sinov darsi yoki lean bufer sifatida band qiling yoki guruhga xona/vaqt bering.",
};
export function SlotModal({
  cell,
  room,
  roomInfo,
  time,
  cohort,
  peak,
  cap,
  onClose,
}: {
  cell: Cell;
  room: string;
  roomInfo?: OpsData['rooms'][number];
  time: string;
  cohort: Cohort;
  peak: boolean;
  cap: number;
  onClose: () => void;
}) {
  const { pending, run } = useAct();
  const [enr, setEnr] = useState(cell.kind === 'group' ? cell.g.enrolled ?? 0 : 0);
  const [kind, setKind] = useState<'trial' | 'buffer'>(cell.kind === 'hold' ? cell.h.kind : 'trial');
  const [title, setTitle] = useState(cell.kind === 'hold' ? cell.h.title : '');
  const coh = cohort === 'odd' ? 'Toq kunlar · Du-Chor-Ju' : 'Juft kunlar · Se-Pay-Sha';
  const head = cell.kind === 'group' ? cell.g.name : cell.kind === 'hold' ? (cell.h.kind === 'trial' ? 'Sinov darsi' : 'Lean bufer') : "Bo'sh slot";
  const fields: [string, React.ReactNode][] = [
    ['Auditoriya', `${roomInfo?.title || room} (${room})${roomInfo?.note ? ` · ${roomInfo.note}` : ''}`],
    ['Vaqt', `${time} · ${coh}${peak ? ' (pik)' : ''}`],
  ];
  if (cell.kind === 'group') {
    fields.push(['Guruh', `${cell.g.name}${cell.g.course ? ` · ${cell.g.course}` : ''}`]);
    fields.push(["Sig'im", `${cell.g.enrolled ?? '—'}/${cap} (max ${cap})`]);
    fields.push(["Mas'ul", cell.g.teacher || '—']);
    fields.push(["Bo'sh joy", cell.g.enrolled == null ? '—' : String(Math.max(0, cap - cell.g.enrolled))]);
    if (cell.clash > 1) fields.push(['Ogohlantirish', <span key="c" className="text-au-bad">{cell.clash} guruh bir vaqtda</span>]);
  } else if (cell.kind === 'hold') {
    fields.push(['Tur', cell.h.kind === 'trial' ? 'Sinov darsi' : 'Lean bufer']);
    fields.push(['Izoh', cell.h.title || '—']);
  }
  return (
    <Modal title={head} sub={`${roomInfo?.title || room} · ${time}`} onClose={onClose}>
      <div className="sx-mg2">
        {fields.map(([k, v]) => (
          <div key={k}>
            <small>{k}</small>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="sx-sop">
        <small>Operatsion yo&apos;riqnoma (SOP)</small>
        <p>{SOP[cell.kind === 'hold' ? cell.h.kind : cell.kind]}</p>
      </div>
      <div className="sx-form mt-4">
        {cell.kind === 'group' && (
          <>
            <label>
              O&apos;quvchilar soni
              <input className="sx-inp !w-[110px]" type="number" min={0} max={500} value={enr} onChange={(e) => setEnr(Math.max(0, Math.round(+e.target.value)))} />
            </label>
            <button className="sx-btn primary" disabled={pending} onClick={() => run(() => setGroupEnrollmentAction(cell.g.id, enr), "Sig'im saqlandi", onClose)}>
              Saqlash
            </button>
          </>
        )}
        {cell.kind === 'hold' && (
          <>
            {/* Editable booking (owner, 2026-10-06): change its type / note. */}
            <label>
              Tur
              <select className="sx-inp !w-[150px]" value={kind} onChange={(e) => setKind(e.target.value as 'trial' | 'buffer')}>
                <option value="trial">Sinov darsi</option>
                <option value="buffer">Lean bufer</option>
              </select>
            </label>
            <label className="min-w-[180px] flex-1">
              Izoh
              <input className="sx-inp" maxLength={120} value={title} placeholder="Masalan: Speaking Club" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <button className="sx-btn primary" disabled={pending} onClick={() => run(() => saveSlotHoldAction({ id: cell.h.id, room, time, cohort, kind, title }), 'Saqlandi', onClose)}>
              Saqlash
            </button>
            <button className="sx-btn text-au-bad" disabled={pending} onClick={() => run(() => deleteSlotHoldAction(cell.h.id), "Band qilish bekor qilindi", onClose)}>
              O&apos;chirish
            </button>
          </>
        )}
        {cell.kind === 'free' && (
          <>
            <label>
              Tur
              <select className="sx-inp !w-[150px]" value={kind} onChange={(e) => setKind(e.target.value as 'trial' | 'buffer')}>
                <option value="trial">Sinov darsi</option>
                <option value="buffer">Lean bufer</option>
              </select>
            </label>
            <label className="min-w-[180px] flex-1">
              Izoh
              <input className="sx-inp" maxLength={120} value={title} placeholder="Masalan: Speaking Club" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <button className="sx-btn primary" disabled={pending} onClick={() => run(() => saveSlotHoldAction({ room, time, cohort, kind, title }), 'Slot band qilindi', onClose)}>
              Band qilish
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ room register */
export function RoomRegister({ rooms, known, seats }: { rooms: OpsData['rooms']; known: string[]; seats: number }) {
  const { pending, run } = useAct();
  const rows = [...rooms, ...known.filter((c) => !rooms.some((r) => r.code === c)).map((c) => ({ code: c, title: '', capacity: seats, note: '' }))];
  const [edit, setEdit] = useState<Record<string, OpsData['rooms'][number]>>({});
  const [nw, setNw] = useState({ code: '', title: '', capacity: seats, note: '' });
  const val = (r: OpsData['rooms'][number]) => edit[r.code] ?? r;
  const set = (r: OpsData['rooms'][number], patch: Partial<OpsData['rooms'][number]>) => setEdit({ ...edit, [r.code]: { ...val(r), ...patch } });
  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Xonalar reyestri</h3>
        <small>nomi, sig&apos;imi va yo&apos;nalishi — matritsa va nazariy maksimum shundan hisoblanadi</small>
      </div>
      <div className="sx-tw">
        <table className="sx-tbl">
          <thead>
            <tr>
              <th className="l">Kod (guruhdagi «Xona»)</th>
              <th className="l">Nomi</th>
              <th>Sig&apos;im</th>
              <th className="l">Izoh (m², yo&apos;nalish)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = val(r);
              const saved = rooms.some((x) => x.code === r.code);
              return (
                <tr key={r.code}>
                  <td className="l">
                    <b>{r.code}</b>
                    {!saved && <div className="text-xs text-au-muted">reyestrda yo&apos;q</div>}
                  </td>
                  <td className="l">
                    <input className="sx-inp !h-[30px]" maxLength={80} value={v.title} onChange={(e) => set(r, { title: e.target.value })} />
                  </td>
                  <td>
                    <input className="sx-inp !h-[30px] !w-[80px]" type="number" min={1} max={200} value={v.capacity} onChange={(e) => set(r, { capacity: Math.min(200, Math.max(1, Math.round(+e.target.value))) })} />
                  </td>
                  <td className="l">
                    <input className="sx-inp !h-[30px]" maxLength={200} value={v.note} onChange={(e) => set(r, { note: e.target.value })} />
                  </td>
                  <td>
                    <span className="inline-flex gap-1">
                      <button className="sx-btn sm primary" disabled={pending} onClick={() => run(() => saveRoomAction(v), 'Xona saqlandi')}>
                        Saqlash
                      </button>
                      {saved && (
                        <button
                          className="sx-btn sm text-au-bad"
                          disabled={pending}
                          onClick={async () => (await ask(`«${r.code}» reyestrdan o'chirilsinmi?`)) && run(() => deleteRoomAction(r.code), "Xona o'chirildi")}
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="l">
                <input className="sx-inp !h-[30px]" maxLength={60} placeholder="Yangi kod" value={nw.code} onChange={(e) => setNw({ ...nw, code: e.target.value })} />
              </td>
              <td className="l">
                <input className="sx-inp !h-[30px]" maxLength={80} value={nw.title} onChange={(e) => setNw({ ...nw, title: e.target.value })} />
              </td>
              <td>
                <input className="sx-inp !h-[30px] !w-[80px]" type="number" min={1} max={200} value={nw.capacity} onChange={(e) => setNw({ ...nw, capacity: Math.min(200, Math.max(1, Math.round(+e.target.value))) })} />
              </td>
              <td className="l">
                <input className="sx-inp !h-[30px]" maxLength={200} value={nw.note} onChange={(e) => setNw({ ...nw, note: e.target.value })} />
              </td>
              <td>
                <button
                  className="sx-btn sm primary"
                  disabled={pending || !nw.code.trim()}
                  onClick={() => run(() => saveRoomAction(nw), "Xona qo'shildi", () => setNw({ code: '', title: '', capacity: seats, note: '' }))}
                >
                  Qo&apos;shish
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
