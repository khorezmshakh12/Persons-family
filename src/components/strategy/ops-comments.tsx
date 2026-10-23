'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { dmy, when } from './ops-students-meta';

const Sec = ({ children }: { children: React.ReactNode }) => <div className="-mb-1 mt-1 text-xs font-extrabold uppercase tracking-wider text-au-faint">{children}</div>;
/**
 * Comments with author and edit stamp; only the author edits their own.
 * On the student card, `reminderFrom` adds a «remind me on»
 * date (the note returns on the author's dashboard that day).
 */
export function CommentList({
  items,
  meId,
  canEdit,
  onAdd,
  onEdit,
  placeholder,
  reminderFrom,
}: {
  items: { id: string; body: string; by: string; byId: string | null; at: string; editedAt: string | null; editedBy: string; remindAt?: string | null; remindDone?: boolean }[] | null;
  meId: string | null;
  canEdit: boolean;
  onAdd: (body: string, remindAt: string | null) => Promise<boolean>;
  onEdit: (id: string, body: string, remindAt: string | null) => Promise<boolean>;
  placeholder: string;
  /** Earliest reminder date (today); omit to hide reminders. */
  reminderFrom?: string;
}) {
  const [text, setText] = useState('');
  const [remind, setRemind] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string; remindAt: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Sec>Izohlar</Sec>
      {canEdit && (
        <>
          <textarea id="cm-new" className="sx-inp min-h-[70px] leading-relaxed" maxLength={2000} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            {reminderFrom && (
              <label className="flex items-center gap-1.5 text-xs font-semibold text-au-muted">
                ⏰ Eslatma sanasi
                <input id="cm-remind" type="date" className="sx-inp !w-[150px]" min={reminderFrom} value={remind} onChange={(e) => setRemind(e.target.value)} />
              </label>
            )}
            <button
              className="sx-btn sm primary"
              disabled={pending || !text.trim()}
              onClick={() =>
                start(async () => {
                  if (await onAdd(text.trim(), remind || null)) {
                    setText('');
                    setRemind('');
                  }
                })
              }
            >
              {remind ? 'Izoh va eslatma qo‘shish' : 'Izoh qo‘shish'}
            </button>
          </div>
          {reminderFrom && remind && <div className="text-xs text-au-faint">Shu kuni dashboard’ingizda chiqadi; «O‘qidim» bosmaguningizcha turadi.</div>}
        </>
      )}
      {items === null ? (
        <div className="text-sm text-au-faint">Yuklanmoqda…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-au-faint">Hali izoh yo‘q</div>
      ) : (
        items.map((c) => (
          <div key={c.id} className="rounded-xl border border-au-line bg-au-card-2/50 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-au-faint">
              <b className="text-au-ink">{c.by || '—'}</b>
              <span>{when(c.at)}</span>
              {c.editedAt && <span>· tahrirlandi {when(c.editedAt)}{c.editedBy && c.editedBy !== c.by ? ` (${c.editedBy})` : ''}</span>}
              {c.remindAt && (
                <span className={cn('sx-pl', c.remindDone ? 'mute' : reminderFrom && c.remindAt <= reminderFrom ? 'warn' : 'info')}>
                  ⏰ {dmy(c.remindAt)}
                  {c.remindDone ? ' · o‘qildi' : ''}
                </span>
              )}
              <span className="flex-1" />
              {canEdit && meId && c.byId === meId && editing?.id !== c.id && (
                <button className="sx-btn sm" onClick={() => setEditing({ id: c.id, body: c.body, remindAt: c.remindAt ?? '' })}>
                  Tahrirlash
                </button>
              )}
            </div>
            {editing?.id === c.id ? (
              <div className="mt-2 flex flex-col gap-2">
                <textarea id={`cm-${c.id}`} className="sx-inp min-h-[70px] leading-relaxed" maxLength={2000} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
                {reminderFrom && (
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-au-muted">
                    ⏰ Eslatma sanasi
                    <input id={`cm-r-${c.id}`} type="date" className="sx-inp !w-[150px]" value={editing.remindAt} onChange={(e) => setEditing({ ...editing, remindAt: e.target.value })} />
                    {editing.remindAt && (
                      <button type="button" className="sx-btn sm" onClick={() => setEditing({ ...editing, remindAt: '' })}>
                        Olib tashlash
                      </button>
                    )}
                  </label>
                )}
                <div className="flex gap-2">
                  <button className="sx-btn sm primary" disabled={pending || !editing.body.trim()} onClick={() => start(async () => { if (await onEdit(c.id, editing.body.trim(), editing.remindAt || null)) setEditing(null); })}>
                    Saqlash
                  </button>
                  <button className="sx-btn sm" onClick={() => setEditing(null)}>
                    Bekor
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-au-ink">{c.body}</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}

