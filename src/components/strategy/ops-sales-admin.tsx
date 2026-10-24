'use client';

import { useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { createLeadAction, restoreLeadAction, saveLeadGroupsAction, saveStagesAction } from '@/lib/actions/sales';
import { toast } from './suite-shell';
import type { OpsData } from './operations-workspace';
import { when } from './ops-students-meta';
import { GROUP_COLORS, GROUP_TONE, NEW_SOURCES, SOURCES, leadErr } from './ops-sales-meta';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sx-modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sx-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sx-h">
          <h3>{title}</h3>
          <span className="sp" />
          <button className="sx-btn sm" onClick={onClose} aria-label="Yopish">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-au-muted">
    {label}
    {children}
  </label>
);

/** Lid qo'shish: ism familiya, telefon, yosh, kurs (+ guruh, manba). Lands in the first stage, on top. */
export function AddLeadModal({ data, onClose, onOpen }: { data: OpsData; onClose: () => void; onOpen: (id: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ name: '', phone: '', age: '', course: '', groupId: '', source: 'insta' as (typeof NEW_SOURCES)[number] });
  const [dup, setDup] = useState<{ id: string; name: string } | null>(null);
  const create = (force: boolean) =>
    start(async () => {
      const r = await createLeadAction({
        name: f.name,
        phone: f.phone,
        age: f.age ? Number(f.age) : null,
        course: f.course,
        groupId: f.groupId || null,
        source: f.source,
        force,
      });
      if (r.dup) return setDup(r.dup);
      if (r.error) return void toast.error(leadErr(r.error));
      toast.success('Lid qo‘shildi — birinchi bosqichda eng tepada');
      router.refresh();
      onClose();
    });
  return (
    <Modal title="Yangi lid" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
        <Field label="Ism familiya *">
          <input id="nl-name" className="sx-inp" maxLength={120} placeholder="Ali Valiyev" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Telefon *">
          <input id="nl-phone" className="sx-inp tabular-nums" maxLength={25} placeholder="+998 90 123 45 67" value={f.phone} onChange={(e) => { setF({ ...f, phone: e.target.value }); setDup(null); }} />
        </Field>
        <Field label="Yoshi">
          <input id="nl-age" className="sx-inp tabular-nums" inputMode="numeric" placeholder="14" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
        </Field>
        <Field label="Qaysi kursda o‘qimoqchi">
          <input id="nl-course" className="sx-inp" list="nl-courses" maxLength={120} placeholder="IELTS" value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })} />
          <datalist id="nl-courses">
            {data.sales.courses.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Guruh">
          <select id="nl-group" className="sx-inp" value={f.groupId} onChange={(e) => setF({ ...f, groupId: e.target.value })}>
            <option value="">— guruhsiz —</option>
            {data.sales.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Manba">
          <select id="nl-src" className="sx-inp" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as typeof f.source })}>
            {NEW_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCES[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {dup && (
        <div className="mt-3 rounded-xl border border-au-bad/50 bg-au-bad-soft px-3 py-2.5 text-sm text-au-ink">
          Bu telefon raqami bilan lid allaqachon bor: <b>{dup.name || 'ismsiz'}</b>.
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="sx-btn sm" onClick={() => onOpen(dup.id)}>
              Mavjud lidni ochish
            </button>
            <button className="sx-btn sm" disabled={pending} onClick={() => create(true)}>
              Baribir yangi qo‘shish
            </button>
          </div>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className="sx-btn" onClick={onClose}>
          Bekor
        </button>
        <button className="sx-btn primary" disabled={pending || !f.name.trim() || f.phone.replace(/\D/g, '').length < 7} onClick={() => create(false)}>
          Qo‘shish
        </button>
      </div>
    </Modal>
  );
}

/** Lid guruhlari: add, rename, recolour, delete. */
export function GroupsModal({ data, onClose }: { data: OpsData; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [list, setList] = useState(data.sales.groups.map((g) => ({ key: g.id, id: g.id as string | null, name: g.name, color: g.color })));
  const set = (key: string, patch: Partial<(typeof list)[number]>) => setList((l) => l.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const save = () =>
    start(async () => {
      const r = await saveLeadGroupsAction(list.map(({ id, name, color }) => ({ id, name, color: color as 'g1' })));
      if (r.error) return void toast.error(leadErr(r.error));
      toast.success('Guruhlar saqlandi');
      router.refresh();
      onClose();
    });
  return (
    <Modal title="Lid guruhlari" onClose={onClose}>
      <p className="mb-3 text-sm text-au-muted">Masalan: «Bolalar 7–12», «IELTS», «Instagram aksiya». O‘chirilgan guruhdagi lidlar guruhsiz qoladi.</p>
      <div className="flex flex-col gap-2">
        {list.map((g) => (
          <div key={g.key} className="flex items-center gap-2">
            <div className="flex gap-1">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  aria-label={`Rang ${c}`}
                  className={cn('size-5 rounded-full border-2', GROUP_TONE[c].dot, g.color === c ? 'border-au-ink' : 'border-transparent')}
                  onClick={() => set(g.key, { color: c })}
                />
              ))}
            </div>
            <input id={`gr-${g.key}`} className="sx-inp flex-1" maxLength={60} value={g.name} onChange={(e) => set(g.key, { name: e.target.value })} />
            <button className="sx-btn sm text-au-bad" aria-label="O‘chirish" onClick={() => setList((l) => l.filter((x) => x.key !== g.key))}>
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {list.length === 0 && <div className="sx-empty">Hali guruh yo‘q</div>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="sx-btn" onClick={() => setList((l) => [...l, { key: crypto.randomUUID(), id: null, name: 'Yangi guruh', color: GROUP_COLORS[l.length % GROUP_COLORS.length] }])}>
          <Plus className="size-4" /> Guruh
        </button>
        <span className="flex-1" />
        <button className="sx-btn primary" disabled={pending || list.some((g) => !g.name.trim())} onClick={save}>
          Saqlash
        </button>
      </div>
    </Modal>
  );
}

/** Bosqichlar: rename, reorder, add, remove (closing stages stay). */
export function StagesModal({ data, onClose }: { data: OpsData; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fixed = data.sales.stages.filter((s) => s.kind === 'joined' || s.kind === 'lost');
  const [list, setList] = useState(data.sales.stages.filter((s) => !fixed.includes(s)).map((s) => ({ key: s.id, id: s.id as string | null, name: s.name })));
  const [fixedNames, setFixedNames] = useState(fixed.map((s) => ({ id: s.id, name: s.name })));
  const swap = (i: number, j: number) => setList((l) => { const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const save = () =>
    start(async () => {
      const r = await saveStagesAction([...list.map(({ id, name }) => ({ id, name })), ...fixedNames]);
      if (r.error) return void toast.error(leadErr(r.error));
      toast.success('Bosqichlar saqlandi');
      router.refresh();
      onClose();
    });
  return (
    <Modal title="Sotuv bosqichlari" onClose={onClose}>
      <p className="mb-3 text-sm text-au-muted">
        «Telegram» ustuni doim birinchi turadi (botdan kelganlar). O‘chirilgan bosqichdagi lidlar birinchi bosqichga o‘tadi. «O‘quvchi bo‘ldi» va «Rad etdi» o‘chirilmaydi.
      </p>
      <div className="flex flex-col gap-2">
        {list.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <input id={`st-${s.key}`} className="sx-inp flex-1" maxLength={60} value={s.name} onChange={(e) => setList((l) => l.map((x) => (x.key === s.key ? { ...x, name: e.target.value } : x)))} />
            <button className="sx-btn sm" aria-label="Yuqoriga" disabled={i === 0} onClick={() => swap(i, i - 1)}>
              <ArrowUp className="size-4" />
            </button>
            <button className="sx-btn sm" aria-label="Pastga" disabled={i === list.length - 1} onClick={() => swap(i, i + 1)}>
              <ArrowDown className="size-4" />
            </button>
            <button className="sx-btn sm text-au-bad" aria-label="O‘chirish" disabled={list.length === 1} onClick={() => setList((l) => l.filter((x) => x.key !== s.key))}>
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {fixedNames.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <input id={`stf-${s.id}`} className="sx-inp flex-1" maxLength={60} value={s.name} onChange={(e) => setFixedNames((l) => l.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} />
            <span className="sx-pl mute">yakuniy</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="sx-btn" onClick={() => setList((l) => [...l, { key: crypto.randomUUID(), id: null, name: 'Yangi bosqich' }])}>
          <Plus className="size-4" /> Bosqich
        </button>
        <span className="flex-1" />
        <button className="sx-btn primary" disabled={pending || [...list, ...fixedNames].some((s) => !s.name.trim())} onClick={save}>
          Saqlash
        </button>
      </div>
    </Modal>
  );
}

/** O'chirilgan lidlar — qaytarish. */
export function ArchiveModal({ data, onClose }: { data: OpsData; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const restore = (id: string) =>
    start(async () => {
      const r = await restoreLeadAction(id);
      if (r.error) return void toast.error(leadErr(r.error));
      toast.success('Lid qaytarildi');
      router.refresh();
    });
  return (
    <Modal title="O‘chirilgan lidlar" onClose={onClose}>
      {data.sales.archived.length === 0 ? (
        <div className="sx-empty">Arxiv bo‘sh</div>
      ) : (
        <ul className="flex flex-col">
          {data.sales.archived.map((a) => (
            <li key={a.id} className="flex items-center gap-2 border-b border-au-line py-2">
              <div className="min-w-0 flex-1">
                <b className="text-sm text-au-ink">{a.name || a.phone}</b>
                <div className="text-xs text-au-faint">
                  {a.phone} · {when(a.at)}
                  {a.by && ` · ${a.by}`}
                </div>
              </div>
              {data.canEdit && (
                <button className="sx-btn sm" disabled={pending} onClick={() => restore(a.id)}>
                  Qaytarish
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
