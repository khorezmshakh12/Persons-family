'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { daysBetween, nextDueDate } from '@/lib/billing';
import type { StudentRow } from '@/lib/ops-students';
import {
  archiveStudentAction,
  deleteStudentAction,
  freezeStudentAction,
  getStudentCardAction,
  logDebtCallAction,
  manualChargeAction,
  previewTemplateAction,
  recordPaymentAction,
  restoreStudentAction,
  sendStudentMessageAction,
  updateStudentInfoAction,
  updateStudentTermsAction,
  type StudentCard,
} from '@/lib/actions/students';
import { addStudentNoteAction, editStudentNoteAction, getStudentNotesAction, type StudentNote } from '@/lib/actions/student-notes';
import { playSound, toast } from './suite-shell';
import { CommentList } from './ops-comments';
import type { OpsData } from './operations-workspace';
import { CALLS, GRADE, METHODS, PAY_METHODS, REASONS, dmy, errText, som, when } from './ops-students-meta';

type Pane = 'pay' | 'msg' | 'info' | 'terms' | 'adj' | 'freeze' | 'out' | 'del' | 'call' | null;
const KIND_UZ: Record<string, string> = { father: 'ota', mother: 'ona', guardian: 'vasiy', student: 'o‘quvchi', other: 'boshqa' };
const digits = (v: string) => v.replace(/\D/g, '');
const grouped = (v: string) => (digits(v) ? formatUZS(Number(digits(v))) : '');

/** O'quvchi kartasi: profile, balance, next payment, every payment and charge with who did it, and all actions. */
export function StudentCardDrawer({ s, data, pane: initial, onClose }: { s: StudentRow; data: OpsData; pane?: string; onClose: () => void }) {
  const router = useRouter();
  const [card, setCard] = useState<StudentCard | null>(null);
  const [failed, setFailed] = useState(false);
  const [pane, setPane] = useState<Pane>((initial as Pane) ?? null);
  const [tick, setTick] = useState(0);
  const [notes, setNotes] = useState<StudentNote[] | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const today = data.today.day;
  const canEdit = data.canEdit;

  // Loads on open and after each change (tick); keyed by student, no router in deps.
  useEffect(() => {
    let live = true;
    getStudentCardAction(s.id).then((r) => {
      if (!live) return;
      if (r.card) setCard(r.card);
      else setFailed(true);
    });
    getStudentNotesAction(s.id).then((r) => {
      if (!live) return;
      setNotes(r.notes ?? []);
      setMeId(r.meId ?? null);
    });
    return () => {
      live = false;
    };
  }, [s.id, tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const done = (msg: string) => {
    playSound('ok');
    toast.success(msg);
    setPane(null);
    setTick((t) => t + 1);
    router.refresh();
  };
  const fail = (e: string) => {
    playSound('err');
    toast.error(errText(e));
  };

  const g = GRADE[s.grade.grade];
  const archived = s.status === 'archived';
  const next = s.start && s.status === 'active' ? nextDueDate(s.start, today) : null;
  const opening = card ? s.balance - card.ledger.reduce((a, e) => a + (e.type === 'pay' ? e.amount : -e.amount), 0) : 0;
  let run = s.balance;
  const ledger = (card?.ledger ?? []).map((e) => {
    const row = { ...e, after: run };
    run -= e.type === 'pay' ? e.amount : -e.amount;
    return row;
  });

  return (
    <>
      <div className="fixed inset-0 z-[59] bg-[var(--au-ring-track)]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={s.name}
        className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[580px] flex-col border-l border-au-line bg-au-card shadow-[var(--au-shadow-pop)]"
      >
        <div className="flex items-start gap-3 border-b border-au-line px-5 pb-3.5 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold text-au-ink">{s.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-au-faint">
              {archived ? (
                <span className="sx-pl mute">Arxivda · {s.leaveReason || 'sababsiz'}</span>
              ) : s.grade.total ? (
                <>
                  <span className={cn('sx-pl', g.tone)}>{g.n}</span>
                  {s.grade.onTime}/{s.grade.total} to‘lov vaqtida · o‘rtacha kechikish {s.grade.avgDelay} kun
                </>
              ) : (
                'Hali to‘lov tarixi yo‘q'
              )}
              {s.risk && <span className="sx-pl bad">Ketish xavfi · oxirgi 3 darsga kelmadi</span>}
            </div>
          </div>
          <button className="sx-btn sm" onClick={onClose} aria-label="Yopish">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-8 pt-4">
          <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
            <Kv k="Balans">
              <span className={cn(s.balance < 0 ? 'text-au-bad' : 'text-au-ok')}>
                {s.balance < 0 ? `−${som(-s.balance)} qarz` : s.balance > 0 ? `+${som(s.balance)} oldindan` : '0 · qarz yo‘q'}
              </span>
            </Kv>
            <Kv k="Keyingi to‘lov" sub={next ? `${daysBetween(today, next) === 0 ? 'bugun' : `${daysBetween(today, next)} kun qoldi`} · oylik ${formatUZS(s.fee)}${s.balance < 0 ? ` + qarz ${formatUZS(-s.balance)}` : ''}` : undefined}>
              {archived ? 'Arxivda' : s.status === 'frozen' ? `Muzlatilgan${s.frozenUntil ? ` · ${dmy(s.frozenUntil)} gacha` : ''}` : next ? `${dmy(next)} · ${som(s.fee + Math.max(0, -s.balance))}` : 'Aktiv sana kiritilmagan'}
            </Kv>
            <Kv k="Oylik to‘lov" sub={[s.feeOwn ? 'qo‘lda kiritilgan' : 'guruh tariflaridan', s.discountPct ? `chegirma ${s.discountPct}%${s.discountReason ? ` (${s.discountReason})` : ''}` : '', s.installments === 2 ? '2 qismda' : ''].filter(Boolean).join(' · ')}>
              {s.fee ? som(s.fee) : '—'}
            </Kv>
            <Kv k="Aktiv bo‘lgan sana" sub={s.start ? `har oy ${Number(s.start.slice(8, 10))}-sanada yechiladi` : undefined}>
              {s.start ? dmy(s.start) : '—'}
            </Kv>
            {(card?.contacts ?? []).map((c, i) => (
              <Kv key={i} k={c.kind === 'student' ? 'Telefon' : `Ota-ona (${KIND_UZ[c.kind] ?? c.kind})`} sub={c.tg ? 'Telegram botga ulangan' : 'Telegram yo‘q'}>
                {[c.name, c.phone].filter(Boolean).join(' · ') || '—'}
              </Kv>
            ))}
            {card?.birthday && <Kv k="Tug‘ilgan kun">{dmy(card.birthday)}</Kv>}
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {archived ? (
                <>
                  <RestoreButton id={s.id} onDone={() => done('Arxivdan qaytarildi')} onFail={fail} />
                  <PaneBtn p="del" cur={pane} set={setPane} danger>
                    🗑 O‘chirish
                  </PaneBtn>
                </>
              ) : (
                <>
                  <PaneBtn p="pay" cur={pane} set={setPane} primary>
                    + To‘lov qabul qilish
                  </PaneBtn>
                  <PaneBtn p="msg" cur={pane} set={setPane}>
                    ✉ Xabar yuborish
                  </PaneBtn>
                  <PaneBtn p="info" cur={pane} set={setPane}>
                    ✎ Tahrirlash
                  </PaneBtn>
                  <PaneBtn p="terms" cur={pane} set={setPane}>
                    ✎ Summa, sana, chegirma
                  </PaneBtn>
                  <PaneBtn p="adj" cur={pane} set={setPane}>
                    − Qo‘lda yechish
                  </PaneBtn>
                  <PaneBtn p="freeze" cur={pane} set={setPane}>
                    ❄ {s.status === 'frozen' ? 'Muzlatishni bekor qilish' : 'Muzlatish'}
                  </PaneBtn>
                  {s.balance < 0 && (
                    <PaneBtn p="call" cur={pane} set={setPane}>
                      ☎ Qo‘ng‘iroq natijasi
                    </PaneBtn>
                  )}
                  <PaneBtn p="out" cur={pane} set={setPane} danger>
                    Chiqarish
                  </PaneBtn>
                  <PaneBtn p="del" cur={pane} set={setPane} danger>
                    🗑 O‘chirish
                  </PaneBtn>
                </>
              )}
            </div>
          )}

          {pane === 'pay' && <PayPane s={s} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'msg' && <MsgPane s={s} data={data} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'info' && card && <InfoPane s={s} card={card} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'terms' && <TermsPane s={s} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'adj' && <AdjPane s={s} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'freeze' && <FreezePane s={s} today={today} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'call' && <CallPane s={s} today={today} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'out' && <OutPane s={s} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'del' && (
            <DeletePane
              s={s}
              onDone={() => {
                playSound('ok');
                toast.success('O‘quvchi o‘chirildi');
                router.refresh();
                onClose();
              }}
              onFail={fail}
              onCancel={() => setPane(null)}
            />
          )}

          <CommentList
            items={notes}
            meId={meId}
            canEdit={canEdit}
            placeholder="Izoh yozing… (masalan: onasi to‘lovni 20-sanagacha kechiktirishni so‘radi)"
            reminderFrom={today}
            onAdd={async (body, remindAt) => {
              const r = await addStudentNoteAction({ studentId: s.id, body, remindAt });
              if (r.error) {
                fail(r.error);
                return false;
              }
              toast.success(remindAt ? `Izoh qo‘shildi — ${dmy(remindAt)} kuni dashboard’da eslatadi` : 'Izoh qo‘shildi');
              setTick((t) => t + 1);
              return true;
            }}
            onEdit={async (id, body, remindAt) => {
              const r = await editStudentNoteAction({ id, body, remindAt });
              if (r.error) {
                toast.error(r.error === 'forbidden' ? 'Faqat o‘zingiz yozgan izohni tahrirlay olasiz' : errText(r.error));
                return false;
              }
              toast.success('Izoh tahrirlandi');
              setTick((t) => t + 1);
              return true;
            }}
          />

          {!card ? (
            <div className="sx-empty">{failed ? 'Kartani yuklab bo‘lmadi' : 'Yuklanmoqda…'}</div>
          ) : (
            <>
              <Sec>To‘lov va yechimlar</Sec>
              {ledger.length === 0 ? (
                <div className="text-sm text-au-faint">Hali yozuv yo‘q</div>
              ) : (
                <ul className="flex flex-col">
                  {ledger.map((e) => (
                    <li key={`${e.type}-${e.id}`} className="grid grid-cols-[14px_1fr_auto] items-start gap-2.5 border-b border-au-line py-2.5">
                      <span className={cn('mt-1.5 size-2.5 rounded-full', e.type === 'pay' ? 'bg-au-ok' : 'bg-au-bad')} />
                      <span className="min-w-0">
                        <b className="text-sm text-au-ink">
                          {e.type === 'pay'
                            ? e.amount < 0
                              ? 'Qaytarildi'
                              : `To‘lov · ${METHODS[e.kind] ?? e.kind}`
                            : e.kind === 'manual'
                              ? 'Qo‘lda yechildi'
                              : 'Oylik yechim'}
                        </b>
                        <span className="block text-xs text-au-faint">
                          {dmy(e.date)} · {e.actor}
                          {e.note ? ` · ${e.note}` : ''}
                        </span>
                      </span>
                      <span className="text-right">
                        <b className={cn('block tabular-nums', e.type === 'pay' && e.amount > 0 ? 'text-au-ok' : 'text-au-bad')}>
                          {e.type === 'pay' && e.amount > 0 ? '+' : '−'}
                          {formatUZS(Math.abs(e.amount))}
                        </b>
                        <span className="text-[11px] tabular-nums text-au-faint">
                          balans {e.after < 0 ? '−' : ''}
                          {formatUZS(Math.abs(e.after))}
                        </span>
                      </span>
                    </li>
                  ))}
                  {Math.round(opening) !== 0 && (
                    <li className="py-2 text-xs text-au-faint">Boshlang‘ich qoldiq (eski tizimdan): {opening < 0 ? '−' : '+'}{som(Math.abs(opening))}</li>
                  )}
                </ul>
              )}

              <Sec>Ota-onaga yuborilgan xabarlar</Sec>
              {card.messages.length === 0 ? (
                <div className="text-sm text-au-faint">Xabar yuborilmagan</div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {card.messages.map((m) => (
                    <li key={m.id} className="rounded-xl border border-au-line px-3 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <b className="text-au-ink">{m.title || 'Xabar'}</b>
                        <span className={cn('sx-pl', m.sent ? 'ok' : 'bad')}>{m.sent ? 'yetkazildi' : 'yetmadi'}</span>
                        <span className="flex-1" />
                        <span className="text-xs text-au-faint">
                          {m.actor} · {when(m.at)}
                        </span>
                      </div>
                      <div className="mt-1 whitespace-pre-line text-xs leading-relaxed text-au-muted">{m.body}</div>
                    </li>
                  ))}
                </ul>
              )}

              {card.calls.length > 0 && (
                <>
                  <Sec>Qo‘ng‘iroqlar</Sec>
                  <ul className="flex flex-col">
                    {card.calls.map((c) => (
                      <li key={c.id} className="border-b border-au-line py-2 text-sm">
                        <b className="text-au-ink">{CALLS[c.result]}</b>
                        {c.promised && <span className="text-au-muted"> · va’da {dmy(c.promised)}</span>}
                        {c.note && <span className="text-au-muted"> · {c.note}</span>}
                        <span className="block text-xs text-au-faint">
                          {c.actor} · {when(c.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <Sec>Amallar tarixi</Sec>
              {card.log.length === 0 ? (
                <div className="text-sm text-au-faint">Bo‘sh</div>
              ) : (
                <ul className="flex flex-col">
                  {card.log.map((l) => (
                    <li key={l.id} className="border-b border-au-line py-2 text-sm text-au-ink">
                      {l.text}
                      <span className="block text-xs text-au-faint">
                        {l.actor} · {when(l.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {card.note && (
                <>
                  <Sec>CRM izohi</Sec>
                  <div className="text-sm text-au-muted">{card.note}</div>
                </>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Kv({ k, sub, children }: { k: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-au-line bg-au-card-2/50 px-3 py-2.5">
      <div className="text-xs font-semibold text-au-faint">{k}</div>
      <div className="mt-0.5 break-words font-bold text-au-ink">{children}</div>
      {sub && <div className="mt-0.5 text-xs text-au-faint">{sub}</div>}
    </div>
  );
}
const Sec = ({ children }: { children: React.ReactNode }) => <div className="-mb-1 mt-1 text-xs font-extrabold uppercase tracking-wider text-au-faint">{children}</div>;

function PaneBtn({ p, cur, set, primary, danger, children }: { p: Pane; cur: Pane; set: (p: Pane) => void; primary?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button className={cn('sx-btn sm', primary && 'primary', danger && 'text-au-bad', cur === p && !primary && 'border-au-accent')} onClick={() => set(cur === p ? null : p)}>
      {children}
    </button>
  );
}

type PaneProps = { s: StudentRow; onDone: (msg: string) => void; onFail: (e: string) => void; onCancel: () => void };

function Panel({ title, danger, children }: { title: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-2.5 rounded-2xl border p-3.5', danger ? 'border-au-bad/50 bg-au-bad-soft' : 'border-au-accent/50 bg-au-accent-soft/60')}>
      <b className="text-au-ink">{title}</b>
      {children}
    </div>
  );
}
const Field = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={cn('flex min-w-0 flex-col gap-1 text-xs font-semibold text-au-muted', className)}>
    {label}
    {children}
  </label>
);
function Actions({ pending, ok, okText, onCancel, danger }: { pending: boolean; ok: () => void; okText: string; onCancel: () => void; danger?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button className={cn('sx-btn', danger ? 'text-au-bad' : 'primary')} disabled={pending} onClick={ok}>
        {okText}
      </button>
      <button className="sx-btn" onClick={onCancel}>
        Bekor
      </button>
    </div>
  );
}

function PayPane({ s, onDone, onFail, onCancel }: PaneProps) {
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(grouped(String(Math.max(-s.balance, s.fee))));
  const [method, setMethod] = useState<(typeof PAY_METHODS)[number]>('cash');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(s.tg);
  const idem = useRef(crypto.randomUUID());
  const ok = () =>
    start(async () => {
      const r = await recordPaymentAction({ studentId: s.id, amount: Number(digits(amount)), method, note, notify, idem: idem.current });
      if (r.error) return onFail(r.error);
      idem.current = crypto.randomUUID();
      onDone(`${som(Number(digits(amount)))} qabul qilindi${notify ? (r.sent ? ' · ota-onaga chek ketdi' : ' · chek yuborilmadi') : ''}`);
    });
  return (
    <Panel title="To‘lov qabul qilish">
      <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
        <Field label="Summa">
          <input id="pay-amt" className="sx-inp tabular-nums" inputMode="numeric" value={amount} onChange={(e) => setAmount(grouped(e.target.value))} />
        </Field>
        <Field label="Usul">
          <select id="pay-m" className="sx-inp" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {PAY_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHODS[m]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Izoh">
        <input id="pay-note" className="sx-inp" maxLength={300} placeholder="Ixtiyoriy" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-au-ink">
        <input id="pay-notify" type="checkbox" checked={notify} disabled={!s.tg} onChange={(e) => setNotify(e.target.checked)} />
        Ota-onaga «To‘lov qabul qilindi» chekini yuborish{!s.tg && ' (Telegram ulanmagan)'}
      </label>
      <Actions pending={pending || !digits(amount)} ok={ok} okText="Qabul qilish" onCancel={onCancel} />
    </Panel>
  );
}

function MsgPane({ s, data, onDone, onFail, onCancel }: PaneProps & { data: OpsData }) {
  const [pending, start] = useTransition();
  const tpls = data.students.templates;
  const [tplId, setTplId] = useState(tpls[0]?.id ?? '');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const fill = (id: string) => {
    const t = tpls.find((x) => x.id === id);
    if (!t) return setText('');
    setLoading(true);
    previewTemplateAction(s.id, t.body).then((r) => {
      setLoading(false);
      setText(r.text ?? t.body);
    });
  };
  const first = useRef(false);
  useEffect(() => {
    if (first.current) return;
    first.current = true;
    if (tplId) fill(tplId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ok = () =>
    start(async () => {
      const t = tpls.find((x) => x.id === tplId);
      const r = await sendStudentMessageAction({ studentId: s.id, templateId: t?.id ?? null, title: t?.name ?? 'Xabar', body: text });
      if (r.error) return onFail(r.error);
      onDone(`Xabar yuborildi (${r.sent}/${r.recipients})`);
    });
  return (
    <Panel title="Ota-onaga xabar yuborish">
      <Field label="Shablon">
        <select
          id="msg-tpl"
          className="sx-inp"
          value={tplId}
          onChange={(e) => {
            setTplId(e.target.value);
            fill(e.target.value);
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
        <textarea id="msg-text" className="sx-inp min-h-[110px] leading-relaxed" maxLength={3000} value={loading ? 'Tayyorlanmoqda…' : text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {!s.tg && <div className="text-xs text-au-bad">Ota-ona Telegram botga ulanmagan — xabar bormaydi. Telefon qiling: {s.parent || s.phone || '—'}</div>}
      <Actions pending={pending || loading || !text.trim() || !s.tg} ok={ok} okText="Telegram’da yuborish" onCancel={onCancel} />
    </Panel>
  );
}

function TermsPane({ s, onDone, onFail, onCancel }: PaneProps) {
  const [pending, start] = useTransition();
  const [own, setOwn] = useState(s.feeOwn);
  const [fee, setFee] = useState(grouped(String(s.feeBase)));
  const [startDate, setStart] = useState(s.start ?? '');
  const [discount, setDiscount] = useState(String(s.discountPct));
  const [reason, setReason] = useState(s.discountReason);
  const [split, setSplit] = useState(s.installments === 2);
  const ok = () =>
    start(async () => {
      const r = await updateStudentTermsAction({
        studentId: s.id,
        fee: own ? Number(digits(fee)) : null,
        start: startDate || null,
        discountPct: Number(discount) || 0,
        discountReason: reason,
        installments: split ? 2 : 1,
      });
      if (r.error) return onFail(r.error);
      onDone('Saqlandi — keyingi yechimdan amal qiladi');
    });
  return (
    <Panel title="Oylik to‘lov, sana, chegirma">
      <label className="flex items-center gap-2 text-sm text-au-ink">
        <input id="t-own" type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} />
        Oylik summani qo‘lda belgilash (aks holda guruh tariflari yig‘indisi)
      </label>
      <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
        <Field label="Oylik to‘lov">
          <input id="t-fee" className="sx-inp tabular-nums" inputMode="numeric" disabled={!own} value={fee} onChange={(e) => setFee(grouped(e.target.value))} />
        </Field>
        <Field label="Aktiv bo‘lgan sana (to‘lov kuni)">
          <input id="t-start" type="date" className="sx-inp" value={startDate} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Chegirma, %">
          <input id="t-disc" className="sx-inp tabular-nums" inputMode="numeric" value={discount} onChange={(e) => setDiscount(digits(e.target.value).slice(0, 3))} />
        </Field>
        <Field label="Chegirma sababi">
          <input id="t-reason" className="sx-inp" maxLength={200} placeholder="Aka-uka, oldindan to‘lov…" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-au-ink">
        <input id="t-split" type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
        Bo‘lib to‘lash: yarmi to‘lov kuni, yarmi 15 kundan keyin
      </label>
      <div className="text-xs text-au-muted">
        Har oy yechiladi: <b className="text-au-ink">{som(Math.round(((own ? Number(digits(fee)) : s.feeBase) * (100 - Math.min(100, Number(discount) || 0))) / 100))}</b>. Yozilgan qarz
        o‘zgarmaydi.
      </div>
      <Actions pending={pending || Number(discount) > 100} ok={ok} okText="Saqlash" onCancel={onCancel} />
    </Panel>
  );
}

function AdjPane({ s, onDone, onFail, onCancel }: PaneProps) {
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Kitob / material');
  const [other, setOther] = useState('');
  const ok = () =>
    start(async () => {
      const r = await manualChargeAction({ studentId: s.id, amount: Number(digits(amount)), reason: reason === 'Boshqa' ? other || 'Boshqa' : reason });
      if (r.error) return onFail(r.error);
      onDone(`${som(Number(digits(amount)))} yechildi`);
    });
  return (
    <Panel title="Qo‘lda yechish (minus)">
      <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
        <Field label="Summa">
          <input id="adj-amt" className="sx-inp tabular-nums" inputMode="numeric" placeholder="masalan 100,000" value={amount} onChange={(e) => setAmount(grouped(e.target.value))} />
        </Field>
        <Field label="Sabab">
          <select id="adj-r" className="sx-inp" value={reason} onChange={(e) => setReason(e.target.value)}>
            {['Kitob / material', 'Imtihon to‘lovi', 'Xato to‘lovni tuzatish', 'Boshqa'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
      </div>
      {reason === 'Boshqa' && (
        <Field label="Izoh">
          <input id="adj-o" className="sx-inp" maxLength={200} value={other} onChange={(e) => setOther(e.target.value)} />
        </Field>
      )}
      <Actions pending={pending || !digits(amount)} ok={ok} okText="Yechish" onCancel={onCancel} />
    </Panel>
  );
}

function FreezePane({ s, today, onDone, onFail, onCancel }: PaneProps & { today: string }) {
  const [pending, start] = useTransition();
  const [until, setUntil] = useState('');
  const frozen = s.status === 'frozen';
  const ok = () =>
    start(async () => {
      const r = await freezeStudentAction({ studentId: s.id, until: frozen ? null : until });
      if (r.error) return onFail(r.error);
      onDone(frozen ? 'Muzlatish bekor qilindi' : `${dmy(until)} gacha muzlatildi`);
    });
  return (
    <Panel title={frozen ? 'Muzlatishni bekor qilish' : 'Muzlatish'}>
      {frozen ? (
        <div className="text-sm text-au-muted">O‘quvchi bugundan qayta faol bo‘ladi va to‘lov kunida yechim davom etadi.</div>
      ) : (
        <>
          <div className="text-sm text-au-muted">Kasallik, safar yoki ta’til: shu sanagacha oylik yechilmaydi, keyin o‘zi faollashadi.</div>
          <Field label="Qaysi sanagacha">
            <input id="fr-until" type="date" className="sx-inp !w-[170px]" min={today} value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        </>
      )}
      <Actions pending={pending || (!frozen && !until)} ok={ok} okText={frozen ? 'Faollashtirish' : 'Muzlatish'} onCancel={onCancel} />
    </Panel>
  );
}

function CallPane({ s, today, onDone, onFail, onCancel }: PaneProps & { today: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<'promised' | 'no_answer' | 'refused' | 'other'>('promised');
  const [promised, setPromised] = useState('');
  const [note, setNote] = useState('');
  const ok = () =>
    start(async () => {
      const r = await logDebtCallAction({ studentId: s.id, result, promisedDate: result === 'promised' && promised ? promised : null, note });
      if (r.error) return onFail(r.error);
      onDone('Qo‘ng‘iroq natijasi yozildi');
    });
  return (
    <Panel title={`Qo‘ng‘iroq: ${s.parent || s.phone || '—'}`}>
      <div className="text-sm text-au-muted">
        Qarz: <b className="text-au-bad">{som(-s.balance)}</b> · {s.grade.openDays} kundan beri
      </div>
      <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
        <Field label="Natija">
          <select id="call-r" className="sx-inp" value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
            {Object.entries(CALLS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {result === 'promised' && (
          <Field label="Qachon to‘laydi">
            <input id="call-d" type="date" className="sx-inp" min={today} value={promised} onChange={(e) => setPromised(e.target.value)} />
          </Field>
        )}
      </div>
      <Field label="Izoh">
        <input id="call-n" className="sx-inp" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Actions pending={pending} ok={ok} okText="Saqlash" onCancel={onCancel} />
    </Panel>
  );
}

function OutPane({ s, onDone, onFail, onCancel }: PaneProps) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const ok = () =>
    start(async () => {
      if (!reason) return onFail('invalidInput');
      const r = await archiveStudentAction({ studentId: s.id, reason, note });
      if (r.error) return onFail(r.error);
      onDone('Arxivga o‘tkazildi');
    });
  return (
    <Panel title="O‘quvchini chiqarish" danger>
      <div className="text-sm text-au-muted">O‘quvchi arxivga o‘tadi, avto-yechim to‘xtaydi. Arxivdan istalgan payt qaytarish mumkin. Sabab statistikaga yoziladi.</div>
      <Field label="Sabab (majburiy)">
        <select id="out-r" className="sx-inp" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">— tanlang —</option>
          {REASONS.map((r) => (
            <option key={r.n}>{r.n}</option>
          ))}
        </select>
      </Field>
      <Field label="Izoh">
        <input id="out-n" className="sx-inp" maxLength={500} placeholder="Masalan: 3 haftadan beri darsga kelmayapti" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Actions pending={pending || !reason} ok={ok} okText="Chiqarish va arxivlash" onCancel={onCancel} danger />
    </Panel>
  );
}

function InfoPane({ s, card, onDone, onFail, onCancel }: { s: StudentRow; card: StudentCard; onDone: (m: string) => void; onFail: (e: string) => void; onCancel: () => void }) {
  const [pending, start] = useTransition();
  const own = card.contacts.find((c) => c.kind === 'student');
  const par = card.contacts.find((c) => c.kind !== 'student');
  const [name, setName] = useState(s.name);
  const [phone, setPhone] = useState(own?.phone ?? '');
  const [parentName, setParentName] = useState(par?.name ?? '');
  const [parentPhone, setParentPhone] = useState(par?.phone ?? '');
  const ok = () =>
    start(async () => {
      const r = await updateStudentInfoAction({ studentId: s.id, name, phone, parentName, parentPhone });
      if (r.error) return onFail(r.error);
      onDone('Saqlandi');
    });
  return (
    <Panel title="O‘quvchini tahrirlash">
      <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
        <Field label="Ism familiya">
          <input id="info-name" className="sx-inp" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Telefon">
          <input id="info-phone" className="sx-inp" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Ota-ona ismi">
          <input id="info-pname" className="sx-inp" maxLength={120} value={parentName} onChange={(e) => setParentName(e.target.value)} />
        </Field>
        <Field label="Ota-ona telefoni">
          <input id="info-pphone" className="sx-inp" inputMode="tel" maxLength={30} value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
        </Field>
      </div>
      <div className="text-xs text-au-faint">Oylik summa va aktiv sana — «Summa, sana, chegirma» bo‘limida. Telegram ulanishi saqlanib qoladi.</div>
      <Actions pending={pending || name.trim().length < 2} ok={ok} okText="Saqlash" onCancel={onCancel} />
    </Panel>
  );
}

function DeletePane({ s, onDone, onFail, onCancel }: { s: StudentRow; onDone: () => void; onFail: (e: string) => void; onCancel: () => void }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState('');
  const ok = () =>
    start(async () => {
      const r = await deleteStudentAction(s.id);
      if (r.error) return onFail(r.error);
      onDone();
    });
  return (
    <Panel title="O‘quvchini o‘chirish" danger>
      <div className="text-sm text-au-muted">
        O‘quvchi, uning kontaktlari, abonementlari, yechimlari va izohlari butunlay o‘chiriladi — qaytarib bo‘lmaydi. To‘lovi bor o‘quvchini o‘chirib bo‘lmaydi (kassa
        hisobotlari buziladi) — uni «Chiqarish» bilan arxivlang.
      </div>
      <Field label="Tasdiqlash uchun ismini yozing">
        <input id="del-confirm" className="sx-inp" autoComplete="off" placeholder={s.name} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Actions pending={pending || confirm.trim() !== s.name.trim()} ok={ok} okText="Butunlay o‘chirish" onCancel={onCancel} danger />
    </Panel>
  );
}

function RestoreButton({ id, onDone, onFail }: { id: string; onDone: () => void; onFail: (e: string) => void }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="sx-btn primary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await restoreStudentAction(id);
          if (r.error) onFail(r.error);
          else onDone();
        })
      }
    >
      Arxivdan qaytarish
    </button>
  );
}
