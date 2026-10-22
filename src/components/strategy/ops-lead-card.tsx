'use client';

import { useEffect, useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { fillTemplate } from '@/lib/billing';
import type { SalesLead } from '@/lib/ops-sales';
import {
  addLeadCommentAction,
  archiveLeadAction,
  convertLeadAction,
  editLeadCommentAction,
  getLeadCardAction,
  moveLeadAction,
  sendLeadMessageAction,
  updateLeadAction,
  type LeadCard,
} from '@/lib/actions/sales';
import { ask, playSound, toast } from './suite-shell';
import type { OpsData } from './operations-workspace';
import { ago, dmy, when } from './ops-students-meta';
import { LOST_FIX, TELEGRAM_COL, columnOf, firstOpenStage, leadErr, sourceName } from './ops-sales-meta';

type Pane = 'msg' | 'convert' | null;
const digits = (v: string) => v.replace(/\D/g, '');

/** Lid kartasi: edit, stage, comments (author + edits), Telegram message, convert to a student, archive. */
export function LeadDrawer({ l, data, onClose }: { l: SalesLead; data: OpsData; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [card, setCard] = useState<LeadCard | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [pane, setPane] = useState<Pane>(null);
  const d = data.sales;
  const canEdit = data.canEdit;
  const first = firstOpenStage(d);

  const [f, setF] = useState({
    name: l.name,
    phone: l.phone,
    age: l.age == null ? '' : String(l.age),
    course: l.course,
    groupId: l.groupId ?? '',
    ownerId: l.ownerId ?? '',
    nextAction: l.nextAction,
    nextAt: l.nextAt ?? '',
    trialDate: l.trialDate ?? '',
    trialTime: l.trialTime,
  });
  const [col, setCol] = useState(columnOf(l, first));
  const [lostReason, setLostReason] = useState('');

  useEffect(() => {
    let live = true;
    getLeadCardAction(l.id).then((r) => {
      if (!live) return;
      if (r.card) {
        setCard(r.card);
        setMeId(r.meId ?? null);
      }
    });
    return () => {
      live = false;
    };
  }, [l.id, tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const done = (msg: string) => {
    toast.success(msg);
    setTick((t) => t + 1);
    router.refresh();
  };

  const stageKind = (id: string) => d.stages.find((s) => s.id === id)?.kind ?? 'telegram';
  const save = () =>
    start(async () => {
      const r = await updateLeadAction({
        id: l.id,
        name: f.name,
        phone: f.phone,
        age: f.age ? Number(f.age) : null,
        course: f.course,
        groupId: f.groupId || null,
        ownerId: f.ownerId || null,
        nextAction: f.nextAction,
        nextAt: f.nextAt || null,
        trialDate: f.trialDate || null,
        trialTime: f.trialTime || null,
      });
      if (r.error) return void toast.error(leadErr(r.error));
      if (col !== columnOf(l, first)) {
        if (stageKind(col) === 'joined' && !l.studentId) {
          setPane('convert');
          return void toast.message('Ma’lumotlar saqlandi. O‘quvchiga aylantirish uchun summa va sanani kiriting');
        }
        const m = await moveLeadAction({ id: l.id, sectionId: col === TELEGRAM_COL ? null : col, lostReason });
        if (m.error) return void toast.error(leadErr(m.error));
      }
      done('Saqlandi');
    });

  const archive = async () => {
    if (!(await ask(`«${l.name || l.phone}» o‘chirilsinmi? Lid arxivga tushadi, keyin qaytarsa bo‘ladi.`, { ok: 'O‘chirish', danger: true }))) return;
    start(async () => {
      const r = await archiveLeadAction(l.id);
      if (r.error) return void toast.error(leadErr(r.error));
      toast.success('Lid arxivga o‘tkazildi');
      router.refresh();
      onClose();
    });
  };

  const stageOptions = [
    ...(l.source === 'telegram' ? [{ id: TELEGRAM_COL, name: 'Telegram' }] : []),
    ...d.stages.map((s) => ({ id: s.id, name: s.name })),
  ];

  return (
    <>
      <div className="fixed inset-0 z-[59] bg-[var(--au-ring-track)]" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={l.name} className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[560px] flex-col border-l border-au-line bg-au-card shadow-[var(--au-shadow-pop)]">
        <div className="flex items-start gap-3 border-b border-au-line px-5 pb-3.5 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold text-au-ink">{l.name || l.phone}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-au-faint">
              {l.source === 'telegram' ? <span className="sx-pl info">Telegram</span> : <span className="sx-pl mute">{sourceName(l.source)}</span>}
              {l.tg && l.source !== 'telegram' && <span className="sx-pl info">Telegram ulangan</span>}
              {l.tgUser && <span>@{l.tgUser}</span>}
              <span>· {ago(l.createdAt)}</span>
              {l.owner && <span>· mas’ul: {l.owner}</span>}
              {l.studentId && <span className="sx-pl ok">O‘quvchi bo‘ldi</span>}
            </div>
          </div>
          <button className="sx-btn sm" onClick={onClose} aria-label="Yopish">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-8 pt-4">
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {l.tg ? (
                <button className={cn('sx-btn sm text-au-info', pane === 'msg' && 'border-au-accent')} onClick={() => setPane(pane === 'msg' ? null : 'msg')}>
                  ✈ Telegram xabar
                </button>
              ) : (
                <span className="sx-pl mute" title="Lid botda /start bosib telefon raqamini yuborsa, avtomatik ulanadi">
                  Telegram yo‘q — botga start bossa ulanadi
                </span>
              )}
              {!l.studentId && (
                <button className={cn('sx-btn sm', pane === 'convert' && 'border-au-accent')} onClick={() => setPane(pane === 'convert' ? null : 'convert')}>
                  → O‘quvchi qilish
                </button>
              )}
              <span className="flex-1" />
              <button className="sx-btn sm text-au-bad" disabled={pending} onClick={archive}>
                O‘chirish
              </button>
            </div>
          )}

          {pane === 'msg' && <MessagePane l={l} data={data} onDone={(m) => { setPane(null); done(m); }} onCancel={() => setPane(null)} />}
          {pane === 'convert' && <ConvertPane l={l} data={data} onDone={(m) => { setPane(null); done(m); }} onCancel={() => setPane(null)} />}

          <Sec>Ma’lumotlar</Sec>
          <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
            <Field label="Ism familiya">
              <input id="ld-name" className="sx-inp" maxLength={120} disabled={!canEdit} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Telefon">
              <input id="ld-phone" className="sx-inp tabular-nums" maxLength={25} disabled={!canEdit} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </Field>
            <Field label="Yoshi">
              <input id="ld-age" className="sx-inp tabular-nums" inputMode="numeric" disabled={!canEdit} value={f.age} onChange={(e) => setF({ ...f, age: digits(e.target.value).slice(0, 2) })} />
            </Field>
            <Field label="Kurs">
              <input id="ld-course" className="sx-inp" list="ld-courses" maxLength={120} disabled={!canEdit} value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })} />
              <datalist id="ld-courses">
                {d.courses.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Guruh">
              <select id="ld-group" className="sx-inp" disabled={!canEdit} value={f.groupId} onChange={(e) => setF({ ...f, groupId: e.target.value })}>
                <option value="">— guruhsiz —</option>
                {d.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bosqich">
              <select id="ld-stage" className="sx-inp" disabled={!canEdit} value={col} onChange={(e) => setCol(e.target.value)}>
                {stageOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            {stageKind(col) === 'lost' && col !== columnOf(l, first) && (
              <Field label="Rad etish sababi (majburiy)" className="col-span-full">
                <select id="ld-lost" className="sx-inp" value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
                  <option value="">— tanlang —</option>
                  {Object.keys(LOST_FIX).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Mas’ul xodim">
              <select id="ld-owner" className="sx-inp" disabled={!canEdit} value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
                <option value="">— belgilanmagan —</option>
                {d.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Keyingi qadam sanasi">
              <input id="ld-next-at" type="date" className="sx-inp" disabled={!canEdit} value={f.nextAt} onChange={(e) => setF({ ...f, nextAt: e.target.value })} />
            </Field>
            <Field label="Keyingi qadam" className="col-span-full">
              <input id="ld-next" className="sx-inp" maxLength={200} placeholder="Masalan: onasiga qo‘ng‘iroq qilish, narxni aytish" disabled={!canEdit} value={f.nextAction} onChange={(e) => setF({ ...f, nextAction: e.target.value })} />
            </Field>
            <Field label="Sinov darsi sanasi">
              <input id="ld-trial-d" type="date" className="sx-inp" disabled={!canEdit} value={f.trialDate} onChange={(e) => setF({ ...f, trialDate: e.target.value })} />
            </Field>
            <Field label="Sinov darsi vaqti">
              <input id="ld-trial-t" type="time" className="sx-inp" disabled={!canEdit} value={f.trialTime} onChange={(e) => setF({ ...f, trialTime: e.target.value })} />
            </Field>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <button className="sx-btn primary" disabled={pending || !f.name.trim() || !f.phone.trim() || (stageKind(col) === 'lost' && col !== columnOf(l, first) && !lostReason)} onClick={save}>
                Saqlash
              </button>
              {f.trialDate && l.tg && <span className="text-xs text-au-faint">Sinovdan 1 kun oldin lidga Telegram eslatma boradi.</span>}
            </div>
          )}

          <Comments leadId={l.id} card={card} meId={meId} canEdit={canEdit} onChange={() => setTick((t) => t + 1)} />

          {card && card.messages.length > 0 && (
            <>
              <Sec>Telegram xabarlar</Sec>
              <ul className="flex flex-col gap-2">
                {card.messages.map((m) => (
                  <li key={m.id} className="rounded-xl border border-au-line px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-au-faint">
                      <span className={cn('sx-pl', m.status === 'sent' ? 'ok' : 'bad')}>{m.status === 'sent' ? 'yetkazildi' : 'yetmadi'}</span>
                      <span>
                        {m.by} · {when(m.at)}
                      </span>
                    </div>
                    <div className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-au-muted">{m.body}</div>
                  </li>
                ))}
              </ul>
            </>
          )}

          <Sec>Tarix</Sec>
          {!card ? (
            <div className="text-sm text-au-faint">Yuklanmoqda…</div>
          ) : card.log.length === 0 ? (
            <div className="text-sm text-au-faint">Hali yozuv yo‘q</div>
          ) : (
            <ul className="flex flex-col">
              {card.log.map((h) => (
                <li key={h.id} className="border-b border-au-line py-2 text-sm text-au-ink">
                  {h.text}
                  <span className="block text-xs text-au-faint">
                    {h.by} · {when(h.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}

const Sec = ({ children }: { children: React.ReactNode }) => <div className="-mb-1 mt-1 text-xs font-extrabold uppercase tracking-wider text-au-faint">{children}</div>;
const Field = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={cn('flex min-w-0 flex-col gap-1 text-xs font-semibold text-au-muted', className)}>
    {label}
    {children}
  </label>
);

/** Comments with author and edit stamp; only the author edits their own. Shared with the student card. */
export function CommentList({
  items,
  meId,
  canEdit,
  onAdd,
  onEdit,
  placeholder,
}: {
  items: { id: string; body: string; by: string; byId: string | null; at: string; editedAt: string | null; editedBy: string }[] | null;
  meId: string | null;
  canEdit: boolean;
  onAdd: (body: string) => Promise<boolean>;
  onEdit: (id: string, body: string) => Promise<boolean>;
  placeholder: string;
}) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Sec>Izohlar</Sec>
      {canEdit && (
        <>
          <textarea id="cm-new" className="sx-inp min-h-[70px] leading-relaxed" maxLength={2000} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
          <div>
            <button className="sx-btn sm primary" disabled={pending || !text.trim()} onClick={() => start(async () => { if (await onAdd(text.trim())) setText(''); })}>
              Izoh qo‘shish
            </button>
          </div>
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
              <span className="flex-1" />
              {canEdit && meId && c.byId === meId && editing?.id !== c.id && (
                <button className="sx-btn sm" onClick={() => setEditing({ id: c.id, body: c.body })}>
                  Tahrirlash
                </button>
              )}
            </div>
            {editing?.id === c.id ? (
              <div className="mt-2 flex flex-col gap-2">
                <textarea id={`cm-${c.id}`} className="sx-inp min-h-[70px] leading-relaxed" maxLength={2000} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
                <div className="flex gap-2">
                  <button className="sx-btn sm primary" disabled={pending || !editing.body.trim()} onClick={() => start(async () => { if (await onEdit(c.id, editing.body.trim())) setEditing(null); })}>
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

function Comments({ leadId, card, meId, canEdit, onChange }: { leadId: string; card: LeadCard | null; meId: string | null; canEdit: boolean; onChange: () => void }) {
  const router = useRouter();
  return (
    <CommentList
      items={card ? card.comments : null}
      meId={meId}
      canEdit={canEdit}
      placeholder="Izoh yozing… (masalan: onasi kechqurun qo‘ng‘iroq qilishni so‘radi)"
      onAdd={async (body) => {
        const r = await addLeadCommentAction({ leadId, body });
        if (r.error) {
          toast.error(leadErr(r.error));
          return false;
        }
        toast.success('Izoh qo‘shildi');
        onChange();
        router.refresh();
        return true;
      }}
      onEdit={async (id, body) => {
        const r = await editLeadCommentAction({ id, body });
        if (r.error) {
          toast.error(r.error === 'forbidden' ? 'Faqat o‘zingiz yozgan izohni tahrirlay olasiz' : leadErr(r.error));
          return false;
        }
        toast.success('Izoh tahrirlandi');
        onChange();
        return true;
      }}
    />
  );
}

function MessagePane({ l, data, onDone, onCancel }: { l: SalesLead; data: OpsData; onDone: (m: string) => void; onCancel: () => void }) {
  const [pending, start] = useTransition();
  const tpls = data.sales.templates;
  const vars = {
    ism: l.name.split(' ')[0] || l.name,
    kurs: l.course || 'tanlangan',
    sinov_sana: l.trialDate ? dmy(l.trialDate) : '—',
    sinov_vaqt: l.trialTime || '—',
  };
  const [tplId, setTplId] = useState(tpls[0]?.id ?? '');
  const [text, setText] = useState(tpls[0] ? fillTemplate(tpls[0].body, vars) : '');
  const send = () =>
    start(async () => {
      const r = await sendLeadMessageAction({ leadId: l.id, body: text });
      if (r.error) {
        playSound('err');
        return void toast.error(leadErr(r.error));
      }
      onDone('Telegram xabar yuborildi');
    });
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-au-accent/50 bg-au-accent-soft/60 p-3.5">
      <b className="text-au-ink">Telegram xabar</b>
      <Field label="Shablon">
        <select
          id="lm-tpl"
          className="sx-inp"
          value={tplId}
          onChange={(e) => {
            setTplId(e.target.value);
            const t = tpls.find((x) => x.id === e.target.value);
            setText(t ? fillTemplate(t.body, vars) : '');
          }}
        >
          <option value="">— shablonsiz —</option>
          {tpls.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Matn (o‘zgartirish mumkin)">
        <textarea id="lm-text" className="sx-inp min-h-[110px] leading-relaxed" maxLength={3000} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <button className="sx-btn primary" disabled={pending || !text.trim()} onClick={send}>
          Yuborish
        </button>
        <button className="sx-btn" onClick={onCancel}>
          Bekor
        </button>
      </div>
    </div>
  );
}

function ConvertPane({ l, data, onDone, onCancel }: { l: SalesLead; data: OpsData; onDone: (m: string) => void; onCancel: () => void }) {
  const [pending, start] = useTransition();
  const [fee, setFee] = useState('');
  const [startDate, setStart] = useState(data.today.day);
  const go = () =>
    start(async () => {
      const r = await convertLeadAction({ id: l.id, fee: Number(digits(fee)) || 0, start: startDate });
      if (r.error) return void toast.error(leadErr(r.error));
      onDone(`${l.name} o‘quvchi bo‘ldi — «O‘quvchilar» ro‘yxatida`);
    });
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-au-ok/50 bg-au-ok-soft/60 p-3.5">
      <b className="text-au-ink">O‘quvchi qilish</b>
      <div className="text-sm text-au-muted">CRM’da o‘quvchi ochiladi (telefon va Telegram bilan), «O‘quvchilar»ga tushadi va har oy shu sanada to‘lov yechiladi.</div>
      <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
        <Field label="Oylik to‘lov">
          <input id="cv-fee" className="sx-inp tabular-nums" inputMode="numeric" placeholder="masalan 600,000" value={fee} onChange={(e) => setFee(digits(e.target.value) ? formatUZS(Number(digits(e.target.value))) : '')} />
        </Field>
        <Field label="Aktiv bo‘lgan sana (to‘lov kuni)">
          <input id="cv-start" type="date" className="sx-inp" value={startDate} onChange={(e) => setStart(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <button className="sx-btn primary" disabled={pending || !digits(fee) || !startDate} onClick={go}>
          O‘quvchi qilish
        </button>
        <button className="sx-btn" onClick={onCancel}>
          Bekor
        </button>
      </div>
    </div>
  );
}
