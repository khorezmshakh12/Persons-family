'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { MoneyInput } from '@/components/ui/money-input';
import { daysBetween, nextDueDate } from '@/lib/billing';
import { addDaysToKey } from '@/lib/time';
import type { StudentRow } from '@/lib/ops-students';
import {
  archiveStudentAction,
  cancelChargeAction,
  deleteStudentAction,
  fixStudentBalanceAction,
  freezeStudentAction,
  getOpenChargeAction,
  getStudentCardAction,
  logDebtCallAction,
  manualChargeAction,
  pauseBillingAction,
  previewTemplateAction,
  recordPaymentAction,
  restoreStudentAction,
  sendStudentMessageAction,
  shiftPayDateAction,
  updateStudentInfoAction,
  updateStudentTermsAction,
  type StudentCard,
} from '@/lib/actions/students';
import { addStudentNoteAction, editStudentNoteAction, getStudentNotesAction, type StudentNote } from '@/lib/actions/student-notes';
import { playSound, toast } from './suite-shell';
import { CommentList } from './ops-comments';
import { PaymentEditor } from './ops-payments';
import type { OpsData } from './operations-workspace';
import { useTranslations } from 'next-intl';
import { PAY_METHODS, dmy, som, useOpsMeta, when } from './ops-students-meta';

type Pane = 'pay' | 'msg' | 'info' | 'terms' | 'adj' | 'fix' | 'shift' | 'freeze' | 'out' | 'del' | 'call' | null;
const PARENT_LABEL: Record<string, string> = { father: 'pFather', mother: 'pMother', guardian: 'pGuardian', other: 'pOther' };
const digits = (v: string) => v.replace(/\D/g, '');
/** Stored reason text (Uzbek) → its label key under ops.card.rs. */
const RS: Record<string, string> = {
  'Kitob / material': 'book',
  'Imtihon to‘lovi': 'exam',
  'Xato to‘lovni tuzatish': 'fixPay',
  Boshqa: 'other',
  'Xato yechilgan': 'wrong',
  'Ikki marta yechilgan': 'twice',
  'O‘quvchi shu oy o‘qimadi': 'noStudy',
  'Oyning bir qismi o‘qidi': 'partMonth',
  'Summa noto‘g‘ri edi': 'wrongSum',
  'SchoolUp importidagi xato minus': 'import',
  'Ikki marta yechilgan oylik': 'twiceFee',
  'Ortiqcha qo‘lda yechilgan': 'extraManual',
  'Darsga kelmayapti, keyin qaytadi': 'absent',
  'Kasal / safarda': 'ill',
  'To‘lov kelishuvi (CEO ruxsati)': 'deal',
  'Darsga kelmadi': 'missed',
  'Kasal edi': 'sick',
  'Safarda edi': 'away',
  'Guruh hali boshlanmadi': 'notStarted',
};
function useRs() {
  const t = useTranslations('ops.card.rs');
  return (v: string) => (RS[v] ? t(RS[v]) : v);
}
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
  const [editPay, setEditPay] = useState<string | null>(null);
  const [cancelCh, setCancelCh] = useState<string | null>(null);
  const today = data.today.day;
  const canEdit = data.canEdit;
  const t = useTranslations('ops.card');
  const to = useTranslations('ops');
  const { CALLS, GRADE, METHODS, errText, reasonLabel } = useOpsMeta();

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
  const signed = (e: StudentCard['ledger'][number]) => (e.type === 'charge' ? (e.cancelled ? 0 : -e.amount) : e.amount);
  // 60+ days old: the CEO only (operations.chargeCancelOld).
  const canCancelCharge = (e: StudentCard['ledger'][number]) =>
    canEdit && e.type === 'charge' && !e.cancelled && (data.canCancelOldCharge || e.date >= addDaysToKey(today, -60));
  const opening = card ? s.balance - card.ledger.reduce((a, e) => a + signed(e), 0) : 0;
  let run = s.balance;
  const ledger = (card?.ledger ?? []).map((e) => {
    const row = { ...e, after: run };
    run -= signed(e);
    return row;
  });
  const fixBtn = data.canFixBalance && s.balance < 0 && (
    <PaneBtn p="fix" cur={pane} set={setPane}>
      {t('fixBalance')}
    </PaneBtn>
  );

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
                <span className="sx-pl mute">{t('archivedReason', { r: s.leaveReason ? reasonLabel(s.leaveReason) : t('noReason') })}</span>
              ) : s.grade.total ? (
                <>
                  <span className={cn('sx-pl', g.tone)}>{g.n}</span>
                  {t('gradeLine', { a: s.grade.onTime, b: s.grade.total, d: s.grade.avgDelay })}
                </>
              ) : (
                t('noHistory')
              )}
              {s.risk && <span className="sx-pl bad">{t('risk')}</span>}
            </div>
          </div>
          <button className="sx-btn sm" onClick={onClose} aria-label={to('c.close')}>
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-8 pt-4">
          <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
            <Kv k={t('balance')}>
              <span className={cn(s.balance < 0 ? 'text-au-bad' : 'text-au-ok')}>
                {s.balance < 0 ? t('debt', { sum: som(-s.balance) }) : s.balance > 0 ? t('prepaid', { sum: som(s.balance) }) : t('noDebt')}
              </span>
            </Kv>
            <Kv k={t('nextPay')} sub={next ? `${t('nextSub', { when: daysBetween(today, next) === 0 ? t('today') : t('daysLeft', { n: daysBetween(today, next) }), fee: formatUZS(s.fee) })}${s.balance < 0 ? t('plusDebt', { sum: formatUZS(-s.balance) }) : ''}` : undefined}>
              {archived ? t('archived') : s.status === 'frozen' ? `${t('frozen')}${s.frozenUntil ? t('until', { d: dmy(s.frozenUntil) }) : ''}` : next ? `${dmy(next)} · ${som(s.fee + Math.max(0, -s.balance))}` : t('noStart')}
            </Kv>
            <Kv k={t('fee')} sub={[s.feeOwn ? t('feeOwn') : t('feeGroups'), s.discountPct ? `${t('discount', { n: s.discountPct })}${s.discountReason ? ` (${s.discountReason})` : ''}` : '', s.installments === 2 ? t('twoParts') : ''].filter(Boolean).join(' · ')}>
              {s.fee ? som(s.fee) : '—'}
            </Kv>
            <Kv k={t('start')} sub={s.start ? t('startSub', { d: Number(s.start.slice(8, 10)) }) : undefined}>
              {s.start ? dmy(s.start) : '—'}
            </Kv>
            {card && (
              <Kv k={t('phone')} sub={card.contacts.find((c) => c.kind === 'student')?.tg ? t('botLinked') : undefined}>
                {card.contacts.find((c) => c.kind === 'student')?.phone || '—'}
              </Kv>
            )}
            {card && <Kv k="Telegram username">{card.tgUsername ? `@${card.tgUsername}` : '—'}</Kv>}
            {card &&
              (['father', 'mother', 'guardian', 'other'] as const).flatMap((kind) =>
                card.contacts
                  .filter((c) => c.kind === kind)
                  .map((c, i) => (
                    <Kv key={`${kind}-${i}`} k={t(PARENT_LABEL[kind])} sub={c.tg ? t('botLinkedRem') : t('botNo')}>
                      {[c.name, c.phone].filter(Boolean).join(' · ') || '—'}
                    </Kv>
                  )),
              )}
            {card?.birthday && <Kv k={t('birthday')}>{dmy(card.birthday)}</Kv>}
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {archived ? (
                <>
                  <RestoreButton id={s.id} onDone={() => done(t('restored'))} onFail={fail} />
                  {fixBtn}
                  <PaneBtn p="del" cur={pane} set={setPane} danger>
                    {t('del')}
                  </PaneBtn>
                </>
              ) : (
                <>
                  <PaneBtn p="pay" cur={pane} set={setPane} primary>
                    {t('takePay')}
                  </PaneBtn>
                  <PaneBtn p="msg" cur={pane} set={setPane}>
                    {t('sendMsg')}
                  </PaneBtn>
                  <PaneBtn p="info" cur={pane} set={setPane}>
                    {t('edit')}
                  </PaneBtn>
                  <PaneBtn p="terms" cur={pane} set={setPane}>
                    {t('terms')}
                  </PaneBtn>
                  {data.money && s.status === 'active' && (
                    <PaneBtn p="shift" cur={pane} set={setPane}>
                      {t('shift')}
                    </PaneBtn>
                  )}
                  <PaneBtn p="adj" cur={pane} set={setPane}>
                    {t('adj')}
                  </PaneBtn>
                  {fixBtn}
                  <PaneBtn p="freeze" cur={pane} set={setPane}>
                    ❄ {s.status === 'frozen' ? t('unfreeze') : t('freeze')}
                  </PaneBtn>
                  {s.balance < 0 && (
                    <PaneBtn p="call" cur={pane} set={setPane}>
                      {t('callRes')}
                    </PaneBtn>
                  )}
                  <PaneBtn p="out" cur={pane} set={setPane} danger>
                    {t('out')}
                  </PaneBtn>
                  <PaneBtn p="del" cur={pane} set={setPane} danger>
                    {t('del')}
                  </PaneBtn>
                </>
              )}
            </div>
          )}

          {card && <Dates d={card.dates} />}

          {pane === 'pay' && <PayPane s={s} today={today} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'msg' && <MsgPane s={s} data={data} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'info' && card && <InfoPane s={s} card={card} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'terms' && <TermsPane s={s} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'adj' && <AdjPane s={s} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'fix' && <FixPane s={s} today={today} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'shift' && <ShiftPane s={s} today={today} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'freeze' && <FreezePane s={s} today={today} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'call' && <CallPane s={s} today={today} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'out' && <OutPane s={s} onDone={done} onFail={fail} onCancel={() => setPane(null)} />}
          {pane === 'del' && (
            <DeletePane
              s={s}
              onDone={() => {
                playSound('ok');
                toast.success(t('deleted'));
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
            placeholder={t('notePh')}
            reminderFrom={today}
            onAdd={async (body, remindAt) => {
              const r = await addStudentNoteAction({ studentId: s.id, body, remindAt });
              if (r.error) {
                fail(r.error);
                return false;
              }
              toast.success(remindAt ? t('noteAddedRem', { d: dmy(remindAt) }) : t('noteAdded'));
              setTick((t) => t + 1);
              return true;
            }}
            onEdit={async (id, body, remindAt) => {
              const r = await editStudentNoteAction({ id, body, remindAt });
              if (r.error) {
                toast.error(r.error === 'forbidden' ? t('ownNoteOnly') : errText(r.error));
                return false;
              }
              toast.success(t('noteEdited'));
              setTick((t) => t + 1);
              return true;
            }}
          />

          {!card ? (
            <div className="sx-empty">{failed ? t('loadFailed') : to('c.loading')}</div>
          ) : (
            <>
              <Sec>{t('ledger')}</Sec>
              {!data.money ? (
                <div className="text-sm text-au-faint">{t('ledgerHidden')}</div>
              ) : ledger.length === 0 ? (
                <div className="text-sm text-au-faint">{t('noEntries')}</div>
              ) : (
                <ul className="flex flex-col">
                  {ledger.map((e) => (
                    <li key={`${e.type}-${e.id}`} className="grid grid-cols-[14px_1fr_auto] items-start gap-2.5 border-b border-au-line py-2.5">
                      <span className={cn('mt-1.5 size-2.5 rounded-full', e.type === 'pay' ? 'bg-au-ok' : e.type === 'fix' ? 'bg-au-info' : 'bg-au-bad')} />
                      <span className="min-w-0">
                        <b className="text-sm text-au-ink">
                          {e.type === 'fix'
                            ? t('fixed')
                            : e.type === 'pay'
                            ? e.amount < 0
                              ? t('refunded')
                              : t('payOf', { m: METHODS[e.kind] ?? e.kind })
                            : e.kind === 'manual'
                              ? t('manualCharge')
                              : t('monthlyCharge')}
                        </b>
                        <span className="block text-xs text-au-faint">
                          {dmy(e.date)} · {e.actor}
                          {e.note ? ` · ${e.note}` : ''}
                        </span>
                        {e.type === 'fix' && <span className="block text-xs text-au-info">{t('notPayment')}</span>}
                        {e.cancelled && <span className="block text-xs font-semibold text-au-bad">{t('cancelled')}</span>}
                        {e.edit && <span className="block text-xs text-au-info">✎ {e.edit}</span>}
                        {canEdit && e.type === 'pay' && e.amount > 0 && !e.cancelled && !e.isCancel && (
                          <button className="mt-1 text-xs font-semibold text-au-accent-text hover:underline" onClick={() => setEditPay(editPay === e.id ? null : e.id)}>
                            {editPay === e.id ? to('c.close') : to('c.edit')}
                          </button>
                        )}
                        {canCancelCharge(e) && (
                          <button className="mt-1 text-xs font-semibold text-au-bad hover:underline" onClick={() => setCancelCh(cancelCh === e.id ? null : e.id)}>
                            {cancelCh === e.id ? to('c.close') : t('cancelCharge')}
                          </button>
                        )}
                        {cancelCh === e.id && (
                          <span className="mt-2 block">
                            <ChargeCancel charge={e} onDone={(m) => { setCancelCh(null); done(m); }} onFail={fail} onCancel={() => setCancelCh(null)} />
                          </span>
                        )}
                        {editPay === e.id && (
                          <span className="mt-2 block">
                            <PaymentEditor payment={{ id: e.id, amount: e.amount, method: e.kind, date: e.date }} today={today} onDone={(m) => { setEditPay(null); done(m); }} onFail={fail} onCancel={() => setEditPay(null)} />
                          </span>
                        )}
                      </span>
                      <span className="text-right">
                        <b className={cn('block tabular-nums', e.type === 'fix' ? 'text-au-info' : e.type === 'pay' && e.amount > 0 ? 'text-au-ok' : 'text-au-bad', e.type === 'charge' && e.cancelled && 'text-au-faint line-through')}>
                          {signed(e) > 0 ? '+' : '−'}
                          {formatUZS(Math.abs(e.amount))}
                        </b>
                        <span className="text-[11px] tabular-nums text-au-faint">
                          {t('balanceAfter')} {e.after < 0 ? '−' : ''}
                          {formatUZS(Math.abs(e.after))}
                        </span>
                      </span>
                    </li>
                  ))}
                  {Math.round(opening) !== 0 && (
                    <li className="py-2 text-xs text-au-faint">
                      {t('opening')} {opening < 0 ? '−' : '+'}
                      {som(Math.abs(opening))}
                      {opening < 0 && (
                        <span className="mt-1.5 block rounded-lg bg-au-info/10 px-2.5 py-1.5 text-au-info">
                          {t('openingNote')}
                          {data.canFixBalance && s.balance < 0 && !archived ? (
                            <>
                              {' '}{t('ifWrong')}{' '}
                              <button className="font-semibold underline" onClick={() => setPane('fix')}>
                                {t('fixBalanceLink')}
                              </button>
                            </>
                          ) : null}
                        </span>
                      )}
                    </li>
                  )}
                </ul>
              )}

              <Sec>{t('msgs')}</Sec>
              {card.messages.length === 0 ? (
                <div className="text-sm text-au-faint">{t('noMsgs')}</div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {card.messages.map((m) => (
                    <li key={m.id} className="rounded-xl border border-au-line px-3 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <b className="text-au-ink">{m.title || t('msg')}</b>
                        <span className={cn('sx-pl', m.sent ? 'ok' : 'bad')}>{m.sent ? t('delivered') : t('notDelivered')}</span>
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
                  <Sec>{t('calls')}</Sec>
                  <ul className="flex flex-col">
                    {card.calls.map((c) => (
                      <li key={c.id} className="border-b border-au-line py-2 text-sm">
                        <b className="text-au-ink">{CALLS[c.result]}</b>
                        {c.promised && <span className="text-au-muted">{t('promised', { d: dmy(c.promised) })}</span>}
                        {c.note && <span className="text-au-muted"> · {c.note}</span>}
                        <span className="block text-xs text-au-faint">
                          {c.actor} · {when(c.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <Sec>{t('history')}</Sec>
              {card.log.length === 0 ? (
                <div className="text-sm text-au-faint">{t('empty')}</div>
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
                  <Sec>{t('crmNote')}</Sec>
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

/** Lid → o‘quvchi → guruh → faol, oldest first. */
function Dates({ d }: { d: StudentCard['dates'] }) {
  const tr = useTranslations('ops.card');
  const items = [
    d.lead && { at: d.lead.at.slice(0, 10), t: tr('dLead'), sub: d.lead.source },
    { at: d.created.at.slice(0, 10), t: tr('dCreated'), sub: d.created.by },
    ...d.groups.map((g) => ({ at: g.since, t: tr('dGroup'), sub: `${g.name}${g.status === 'active' ? '' : ` · ${g.status === 'frozen' ? tr('gFrozen') : tr('gLeft')}`}` })),
    d.active ? { at: d.active.at, t: tr('dActive'), sub: d.active.how } : { at: '', t: tr('dNotActive'), sub: tr('dWaitPay') },
  ].filter((x): x is { at: string; t: string; sub: string } => !!x);
  items.sort((a, b) => (a.at || '9999').localeCompare(b.at || '9999'));
  return (
    <div className="flex flex-col gap-2">
      <Sec>{tr('dates')}</Sec>
      <ol className="ml-1.5 border-l-2 border-au-line">
        {items.map((x, i) => (
          <li key={i} className="relative pb-2.5 pl-4 last:pb-0">
            <span className={cn('absolute -left-[7px] top-1 size-3 rounded-full border-2 bg-au-card', x.at ? 'border-au-accent' : 'border-au-faint')} />
            <b className="block text-sm text-au-ink">{x.t}</b>
            <span className="text-xs text-au-faint">
              {x.at ? dmy(x.at) : '—'}
              {x.sub ? ` · ${x.sub}` : ''}
            </span>
          </li>
        ))}
      </ol>
    </div>
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
  const t = useTranslations('ops.card');
  return (
    <div className="flex flex-wrap gap-2">
      <button className={cn('sx-btn', danger ? 'text-au-bad' : 'primary')} disabled={pending} onClick={ok}>
        {okText}
      </button>
      <button className="sx-btn" onClick={onCancel}>
        {t('cancelShort')}
      </button>
    </div>
  );
}

function PayPane({ s, today, onDone, onFail, onCancel }: PaneProps & { today: string }) {
  const [pending, start] = useTransition();
  const t = useTranslations('ops.card');
  const to = useTranslations('ops');
  const { METHODS } = useOpsMeta();
  const [amount, setAmount] = useState(grouped(String(Math.max(-s.balance, s.fee))));
  const [method, setMethod] = useState<(typeof PAY_METHODS)[number]>('cash');
  const [paidAt, setPaidAt] = useState(today);
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(s.tg);
  const idem = useRef(crypto.randomUUID());
  const ok = () =>
    start(async () => {
      const r = await recordPaymentAction({ studentId: s.id, amount: Number(digits(amount)), method, paidAt, note, notify, idem: idem.current });
      if (r.error) return onFail(r.error);
      idem.current = crypto.randomUUID();
      onDone(`${t('paidToast', { sum: som(Number(digits(amount))) })}${notify ? (r.sent ? t('receiptSent') : t('receiptNot')) : ''}`);
    });
  return (
    <Panel title={t('payTitle')}>
      <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
        <Field label={to('c.amount')}>
          <MoneyInput id="pay-amt" className="sx-inp tabular-nums" value={digits(amount) ? Number(digits(amount)) : null} onValue={(v) => setAmount(v == null ? '' : grouped(String(v)))} />
        </Field>
        <Field label={to('c.method')}>
          <select id="pay-m" className="sx-inp" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {PAY_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHODS[m]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={to('c.date')}>
        <input id="pay-date" type="date" className="sx-inp !w-[170px]" min={addDaysToKey(today, -60)} max={today} value={paidAt} onChange={(e) => setPaidAt(e.target.value || today)} />
      </Field>
      <Field label={to('c.note')}>
        <input id="pay-note" className="sx-inp" maxLength={300} placeholder={t('optional')} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-au-ink">
        <input id="pay-notify" type="checkbox" checked={notify} disabled={!s.tg} onChange={(e) => setNotify(e.target.checked)} />
        {t('sendReceipt')}{!s.tg && t('tgNotLinked')}
      </label>
      <Actions pending={pending || !digits(amount)} ok={ok} okText={t('accept')} onCancel={onCancel} />
    </Panel>
  );
}

function MsgPane({ s, data, onDone, onFail, onCancel }: PaneProps & { data: OpsData }) {
  const [pending, start] = useTransition();
  const tr = useTranslations('ops.card');
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
      const r = await sendStudentMessageAction({ studentId: s.id, templateId: t?.id ?? null, title: t?.name ?? tr('msg'), body: text });
      if (r.error) return onFail(r.error);
      onDone(tr('msgSent', { a: r.sent ?? 0, b: r.recipients ?? 0 }));
    });
  return (
    <Panel title={tr('msgTitle')}>
      <Field label={tr('template')}>
        <select
          id="msg-tpl"
          className="sx-inp"
          value={tplId}
          onChange={(e) => {
            setTplId(e.target.value);
            fill(e.target.value);
          }}
        >
          <option value="">{tr('noTemplate')}</option>
          {tpls.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={tr('text')}>
        <textarea id="msg-text" className="sx-inp min-h-[110px] leading-relaxed" maxLength={3000} value={loading ? tr('preparing') : text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {!s.tg && <div className="text-xs text-au-bad">{tr('noTgCall', { p: s.parent || s.phone || '—' })}</div>}
      <Actions pending={pending || loading || !text.trim() || !s.tg} ok={ok} okText={tr('sendTg')} onCancel={onCancel} />
    </Panel>
  );
}

function TermsPane({ s, onDone, onFail, onCancel }: PaneProps) {
  const [pending, start] = useTransition();
  const t = useTranslations('ops.card');
  const to = useTranslations('ops');
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
      onDone(t('savedNext'));
    });
  return (
    <Panel title={t('termsTitle')}>
      <label className="flex items-center gap-2 text-sm text-au-ink">
        <input id="t-own" type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} />
        {t('ownFee')}
      </label>
      <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
        <Field label={t('fee')}>
          <MoneyInput id="t-fee" className="sx-inp tabular-nums" disabled={!own} value={digits(fee) ? Number(digits(fee)) : null} onValue={(v) => setFee(v == null ? '' : grouped(String(v)))} />
        </Field>
        <Field label={t('activeDate')}>
          <input id="t-start" type="date" className="sx-inp" value={startDate} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={t('discountPct')}>
          <input id="t-disc" className="sx-inp tabular-nums" inputMode="numeric" value={discount} onChange={(e) => setDiscount(digits(e.target.value).slice(0, 3))} />
        </Field>
        <Field label={t('discountWhy')}>
          <input id="t-reason" className="sx-inp" maxLength={200} placeholder={t('discountPh')} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-au-ink">
        <input id="t-split" type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
        {t('split')}
      </label>
      <div className="text-xs text-au-muted">
        {t('monthlyCharged')} <b className="text-au-ink">{som(Math.round(((own ? Number(digits(fee)) : s.feeBase) * (100 - Math.min(100, Number(discount) || 0))) / 100))}</b>. {t('termsNote')}
      </div>
      <Actions pending={pending || Number(discount) > 100} ok={ok} okText={to('c.save')} onCancel={onCancel} />
    </Panel>
  );
}

function AdjPane({ s, onDone, onFail, onCancel }: PaneProps) {
  const [pending, start] = useTransition();
  const t = useTranslations('ops.card');
  const to = useTranslations('ops');
  const rs = useRs();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Kitob / material');
  const [other, setOther] = useState('');
  const ok = () =>
    start(async () => {
      const r = await manualChargeAction({ studentId: s.id, amount: Number(digits(amount)), reason: reason === 'Boshqa' ? other || 'Boshqa' : reason });
      if (r.error) return onFail(r.error);
      onDone(t('charged', { sum: som(Number(digits(amount))) }));
    });
  return (
    <Panel title={t('adjTitle')}>
      <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
        <Field label={to('c.amount')}>
          <MoneyInput id="adj-amt" className="sx-inp tabular-nums" placeholder={t('adjPh')} value={digits(amount) ? Number(digits(amount)) : null} onValue={(v) => setAmount(v == null ? '' : grouped(String(v)))} />
        </Field>
        <Field label={t('reason')}>
          <select id="adj-r" className="sx-inp" value={reason} onChange={(e) => setReason(e.target.value)}>
            {['Kitob / material', 'Imtihon to‘lovi', 'Xato to‘lovni tuzatish', 'Boshqa'].map((r) => (
              <option key={r} value={r}>{rs(r)}</option>
            ))}
          </select>
        </Field>
      </div>
      {reason === 'Boshqa' && (
        <Field label={to('c.note')}>
          <input id="adj-o" className="sx-inp" maxLength={200} value={other} onChange={(e) => setOther(e.target.value)} />
        </Field>
      )}
      <Actions pending={pending || !digits(amount)} ok={ok} okText={t('doCharge')} onCancel={onCancel} />
    </Panel>
  );
}

/** «Yechimni bekor qilish»: the charge stays in the history marked cancelled, its sum goes back to the balance. Qisman: only part of it. */
function ChargeCancel({ charge, onDone, onFail, onCancel }: { charge: StudentCard['ledger'][number]; onDone: (m: string) => void; onFail: (e: string) => void; onCancel: () => void }) {
  const [pending, start] = useTransition();
  const to = useTranslations('ops');
  const t = useTranslations('ops.card');
  const rs = useRs();
  const [part, setPart] = useState(false);
  const [amount, setAmount] = useState(grouped(String(Math.round(charge.amount / 2))));
  const [reason, setReason] = useState('Xato yechilgan');
  const [note, setNote] = useState('');
  const n = part ? Math.min(Number(digits(amount)), charge.amount) : charge.amount;
  const why = [reason, note.trim()].filter(Boolean).join(': ');
  const ok = () =>
    start(async () => {
      const r = await cancelChargeAction({ chargeId: charge.id, reason: why, amount: part ? n : undefined });
      if (r.error) return onFail(r.error);
      onDone(part ? t('ccPart', { sum: som(n) }) : t('ccFull', { sum: som(charge.amount) }));
    });
  return (
    <Panel title={t('ccTitle', { date: dmy(charge.date), sum: som(charge.amount) })} danger>
      <p className="text-xs text-au-muted">{t('ccNote')}</p>
      <div className="sx-seg self-start">
        <button className={cn(!part && 'on')} onClick={() => setPart(false)}>
          {t('full')}
        </button>
        <button className={cn(part && 'on')} onClick={() => setPart(true)}>
          {t('partial')}
        </button>
      </div>
      {part && (
        <Field label={t('howMuch', { max: formatUZS(charge.amount - 1) })}>
          <MoneyInput id="cc-amt" className="sx-inp tabular-nums" value={digits(amount) ? Number(digits(amount)) : null} onValue={(v) => setAmount(v == null ? '' : grouped(String(v)))} />
        </Field>
      )}
      <Field label={t('reason')}>
        <select id="cc-r" className="sx-inp" value={reason} onChange={(e) => setReason(e.target.value)}>
          {['Xato yechilgan', 'Ikki marta yechilgan', 'O‘quvchi shu oy o‘qimadi', 'Oyning bir qismi o‘qidi', 'Summa noto‘g‘ri edi', 'Boshqa'].map((r) => (
            <option key={r} value={r}>{rs(r)}</option>
          ))}
        </select>
      </Field>
      <Field label={t('noteReq')}>
        <input id="cc-o" className="sx-inp" maxLength={250} placeholder={t('ccPh')} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="text-xs text-au-muted">
        {t('backToBal', { sum: som(n) })}{part && n < charge.amount ? t('remains', { sum: som(charge.amount - n) }) : ''}
      </div>
      <Actions pending={pending || note.trim().length < 3 || n <= 0 || (part && n >= charge.amount)} ok={ok} okText={to('c.cancel')} onCancel={onCancel} danger />
    </Panel>
  );
}

/** This period's monthly charge, offered back when archiving or freezing. */
function useOpenCharge(studentId: string) {
  const [charge, setCharge] = useState<{ id: string; amount: number; date: string } | null>(null);
  const [take, setTake] = useState(false);
  const t = useTranslations('ops.card');
  useEffect(() => {
    let live = true;
    getOpenChargeAction(studentId).then((r) => live && setCharge(r.charge ?? null));
    return () => {
      live = false;
    };
  }, [studentId]);
  const box = charge && (
    <label className="flex items-start gap-2 text-sm text-au-ink">
      <input id="oc-take" type="checkbox" className="mt-1" checked={take} onChange={(e) => setTake(e.target.checked)} />
      <span>
        {t('ocCancel', { date: dmy(charge.date), sum: som(charge.amount) })}
        <span className="block text-xs text-au-muted">{t('ocHint')}</span>
      </span>
    </label>
  );
  return { box, cancelChargeId: take && charge ? charge.id : null };
}

/** Balansni tuzatish: takes a wrong minus off — never past 0, reason required. */
function FixPane({ s, today, onDone, onFail, onCancel }: PaneProps & { today: string }) {
  const [pending, start] = useTransition();
  const max = Math.round(-s.balance);
  const t = useTranslations('ops.card');
  const to = useTranslations('ops');
  const rs = useRs();
  const [mode, setMode] = useState<'zero' | 'keep'>('zero');
  const [manual, setManual] = useState(false);
  const [until, setUntil] = useState('');
  const [amount, setAmount] = useState(grouped(String(max)));
  const [reason, setReason] = useState('SchoolUp importidagi xato minus');
  const [other, setOther] = useState('');
  const n = Number(digits(amount));
  const why = reason === 'Boshqa' ? other.trim() : reason;
  const frozen = s.status !== 'active';
  const ok = () =>
    start(async () => {
      if (mode === 'zero') {
        const r = await fixStudentBalanceAction({ studentId: s.id, amount: n, reason: why });
        if (r.error) return onFail(r.error);
        return onDone(t('fixedToast', { sum: som(n) }));
      }
      const r = await pauseBillingAction({ studentId: s.id, until: manual ? null : until, reason: why });
      if (r.error) return onFail(r.error);
      onDone(manual ? t('keepManual') : t('keepUntil', { d: dmy(until) }));
    });
  const reasons =
    mode === 'zero'
      ? ['SchoolUp importidagi xato minus', 'Ikki marta yechilgan oylik', 'Ortiqcha qo‘lda yechilgan', 'Boshqa']
      : ['Darsga kelmayapti, keyin qaytadi', 'Kasal / safarda', 'To‘lov kelishuvi (CEO ruxsati)', 'Boshqa'];
  return (
    <Panel title={t('fixTitle')}>
      <p className="text-xs text-au-muted">{t('fixNote')}</p>
      <label className="flex items-start gap-2 text-sm text-au-ink">
        <input id="fx-zero" type="radio" name="fx-mode" className="mt-1" checked={mode === 'zero'} onChange={() => { setMode('zero'); setReason('SchoolUp importidagi xato minus'); }} />
        <span>
          <b>{t('closeMinus')}</b>
          <span className="block text-xs text-au-muted">{t('closeMinusHint')}</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-au-ink">
        <input id="fx-keep" type="radio" name="fx-mode" className="mt-1" disabled={frozen} checked={mode === 'keep'} onChange={() => { setMode('keep'); setReason('Darsga kelmayapti, keyin qaytadi'); }} />
        <span>
          <b>{t('keepMinus')}</b>
          <span className="block text-xs text-au-muted">{frozen ? t('keepFrozen') : t('keepHint')}</span>
        </span>
      </label>
      {mode === 'zero' ? (
        <Field label={t('amountMax', { max: formatUZS(max) })}>
          <MoneyInput id="fix-amt" className="sx-inp tabular-nums" value={digits(amount) ? Number(digits(amount)) : null} onValue={(v) => setAmount(v == null ? '' : grouped(String(v)))} />
        </Field>
      ) : (
        <div className="flex flex-col gap-2 pl-6">
          <label className="flex items-start gap-2 text-sm text-au-ink">
            <input id="fk-date" type="radio" name="fx-keep" className="mt-1" checked={!manual} onChange={() => setManual(false)} />
            <span>
              {t('untilDate')}
              <span className="block text-xs text-au-muted">{t('untilDateHint')}</span>
            </span>
          </label>
          {!manual && <input id="fk-until" type="date" className="sx-inp !w-[170px]" min={addDaysToKey(today, 1)} value={until} onChange={(e) => setUntil(e.target.value)} />}
          <label className="flex items-start gap-2 text-sm text-au-ink">
            <input id="fk-manual" type="radio" name="fx-keep" className="mt-1" checked={manual} onChange={() => setManual(true)} />
            <span>
              {t('untilManual')}
              <span className="block text-xs text-au-muted">{t('untilManualHint')}</span>
            </span>
          </label>
        </div>
      )}
      <Field label={t('reason')}>
        <select id="fix-r" className="sx-inp" value={reason} onChange={(e) => setReason(e.target.value)}>
          {reasons.map((r) => (
            <option key={r} value={r}>{rs(r)}</option>
          ))}
        </select>
      </Field>
      {reason === 'Boshqa' && (
        <Field label={t('noteReq')}>
          <input id="fix-o" className="sx-inp" maxLength={200} value={other} onChange={(e) => setOther(e.target.value)} />
        </Field>
      )}
      <div className="text-xs text-au-muted">
        {mode === 'zero'
          ? t('balTo', { max: formatUZS(max), to: n >= max ? '0' : `−${formatUZS(max - n)}` })
          : manual
            ? t('balKeepManual', { max: formatUZS(max) })
            : until
              ? t('balKeepUntil', { max: formatUZS(max), d: dmy(until), day: Number(until.slice(8)) })
              : t('pickDate')}
      </div>
      <Actions
        pending={pending || why.length < 3 || (mode === 'zero' ? n <= 0 || n > max : !manual && !until)}
        ok={ok}
        okText={to('c.save')}
        onCancel={onCancel}
      />
    </Panel>
  );
}

/** To'lov sanasini surish: a student who missed lessons pays later; the new day stays the pay day. */
function ShiftPane({ s, today, onDone, onFail, onCancel }: PaneProps & { today: string }) {
  const [pending, start] = useTransition();
  const t = useTranslations('ops.card');
  const rs = useRs();
  const next = s.start ? nextDueDate(s.start, today) : null;
  const base = next && next > today ? next : addDaysToKey(today, 1);
  const [days, setDays] = useState<number | null>(7);
  const [date, setDate] = useState(addDaysToKey(base, 7));
  const [reason, setReason] = useState('Darsga kelmadi');
  const [other, setOther] = useState('');
  const open = useOpenCharge(s.id);
  const why = reason === 'Boshqa' ? other.trim() : reason;
  // Before the old next charge only together with taking this period's charge back.
  const minDate = open.cancelChargeId || !next || next <= today ? addDaysToKey(today, 1) : next;
  const pick = (d: number) => {
    setDays(d);
    setDate(addDaysToKey(base, d));
  };
  const ok = () =>
    start(async () => {
      const r = await shiftPayDateAction({ studentId: s.id, date, reason: why, cancelChargeId: open.cancelChargeId });
      if (r.error) return onFail(r.error);
      onDone(`${t('shifted', { d: dmy(date) })}${open.cancelChargeId ? t('shiftedCancel') : ''}`);
    });
  return (
    <Panel title={t('shiftTitle')}>
      <div className="text-xs text-au-muted">
        {t('curNext')} <b className="text-au-ink">{next ? dmy(next) : '—'}</b>. {t('curNextHint')}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[3, 7, 14, 30].map((d) => (
          <button key={d} className={cn('sx-btn !px-2.5 !py-1 text-xs', days === d && 'primary')} onClick={() => pick(d)}>
            +{d === 30 ? t('plus1m') : t('plusDays', { n: d })}
          </button>
        ))}
      </div>
      <Field label={t('newDate')}>
        <input
          id="sh-date"
          type="date"
          className="sx-inp !w-[170px]"
          min={minDate}
          value={date}
          onChange={(e) => {
            setDays(null);
            setDate(e.target.value);
          }}
        />
      </Field>
      <Field label={t('reason')}>
        <select id="sh-r" className="sx-inp" value={reason} onChange={(e) => setReason(e.target.value)}>
          {['Darsga kelmadi', 'Kasal edi', 'Safarda edi', 'Guruh hali boshlanmadi', 'Boshqa'].map((r) => (
            <option key={r} value={r}>{rs(r)}</option>
          ))}
        </select>
      </Field>
      {reason === 'Boshqa' && (
        <Field label={t('noteReq')}>
          <input id="sh-o" className="sx-inp" maxLength={200} value={other} onChange={(e) => setOther(e.target.value)} />
        </Field>
      )}
      {open.box}
      <div className="text-xs text-au-muted">
        {date ? (
          <>
            {t('nextCharge')} <b className="text-au-ink">{next ? dmy(next) : '—'}</b> → <b className="text-au-ink">{dmy(date)}</b>
            {t('everyMonth', { d: Number(date.slice(8)) })}
            {s.installments === 2 && t('splitShift')}
          </>
        ) : (
          t('pickDate')
        )}
      </div>
      {date && date < minDate && <div className="text-xs font-semibold text-au-bad">{t('inPeriod', { d: dmy(minDate) })}</div>}
      <Actions pending={pending || !date || date < minDate || why.length < 3} ok={ok} okText={t('doShift')} onCancel={onCancel} />
    </Panel>
  );
}

function FreezePane({ s, today, onDone, onFail, onCancel }: PaneProps & { today: string }) {
  const [pending, start] = useTransition();
  const [until, setUntil] = useState('');
  const frozen = s.status === 'frozen';
  const open = useOpenCharge(s.id);
  const t = useTranslations('ops.card');
  const ok = () =>
    start(async () => {
      const r = await freezeStudentAction({ studentId: s.id, until: frozen ? null : until, cancelChargeId: frozen ? null : open.cancelChargeId });
      if (r.error) return onFail(r.error);
      onDone(frozen ? t('unfrozen') : `${t('frozenUntil', { d: dmy(until) })}${open.cancelChargeId ? t('frozenCancel') : ''}`);
    });
  return (
    <Panel title={frozen ? t('unfreeze') : t('freeze')}>
      {frozen ? (
        <div className="text-sm text-au-muted">
          {s.restartOnActivate
            ? t('unfreezeRestart', { d: dmy(today) })
            : t('unfreezeKeep')}
        </div>
      ) : (
        <>
          <div className="text-sm text-au-muted">{t('freezeHint')}</div>
          <Field label={t('untilWhen')}>
            <input id="fr-until" type="date" className="sx-inp !w-[170px]" min={today} value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
          {open.box}
        </>
      )}
      <Actions pending={pending || (!frozen && !until)} ok={ok} okText={frozen ? t('activate') : t('freeze')} onCancel={onCancel} />
    </Panel>
  );
}

function CallPane({ s, today, onDone, onFail, onCancel }: PaneProps & { today: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<'promised' | 'no_answer' | 'refused' | 'other'>('promised');
  const t = useTranslations('ops.card');
  const to = useTranslations('ops');
  const { CALLS } = useOpsMeta();
  const [promised, setPromised] = useState('');
  const [note, setNote] = useState('');
  const ok = () =>
    start(async () => {
      const r = await logDebtCallAction({ studentId: s.id, result, promisedDate: result === 'promised' && promised ? promised : null, note });
      if (r.error) return onFail(r.error);
      onDone(t('callSaved'));
    });
  return (
    <Panel title={t('callTitle', { p: s.parent || s.phone || '—' })}>
      <div className="text-sm text-au-muted">
        {t('debtFor')} <b className="text-au-bad">{som(-s.balance)}</b> · {t('sinceDays', { n: s.grade.openDays })}
      </div>
      <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
        <Field label={t('result')}>
          <select id="call-r" className="sx-inp" value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
            {Object.entries(CALLS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {result === 'promised' && (
          <Field label={t('whenPay')}>
            <input id="call-d" type="date" className="sx-inp" min={today} value={promised} onChange={(e) => setPromised(e.target.value)} />
          </Field>
        )}
      </div>
      <Field label={to('c.note')}>
        <input id="call-n" className="sx-inp" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Actions pending={pending} ok={ok} okText={to('c.save')} onCancel={onCancel} />
    </Panel>
  );
}

function OutPane({ s, onDone, onFail, onCancel }: PaneProps) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const open = useOpenCharge(s.id);
  const t = useTranslations('ops.card');
  const to = useTranslations('ops');
  const { REASONS } = useOpsMeta();
  const ok = () =>
    start(async () => {
      if (!reason) return onFail('invalidInput');
      const r = await archiveStudentAction({ studentId: s.id, reason, note, cancelChargeId: open.cancelChargeId });
      if (r.error) return onFail(r.error);
      onDone(open.cancelChargeId ? t('archivedCancel') : t('archivedToast'));
    });
  return (
    <Panel title={t('outTitle')} danger>
      <div className="text-sm text-au-muted">{t('outNote')}</div>
      <Field label={to('c.reasonRequired')}>
        <select id="out-r" className="sx-inp" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">{t('pick')}</option>
          {REASONS.map((r) => (
            <option key={r.v} value={r.v}>{r.n}</option>
          ))}
        </select>
      </Field>
      <Field label={to('c.note')}>
        <input id="out-n" className="sx-inp" maxLength={500} placeholder={t('outPh')} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {open.box}
      <Actions pending={pending || !reason} ok={ok} okText={t('outBtn')} onCancel={onCancel} danger />
    </Panel>
  );
}

type Person = { name: string; phone: string };

function InfoPane({ s, card, onDone, onFail, onCancel }: { s: StudentRow; card: StudentCard; onDone: (m: string) => void; onFail: (e: string) => void; onCancel: () => void }) {
  const [pending, start] = useTransition();
  const own = card.contacts.find((c) => c.kind === 'student');
  const t = useTranslations('ops.card');
  const to = useTranslations('ops');
  const slot = (kind: string): Person => {
    const c = card.contacts.find((x) => x.kind === kind);
    return { name: c?.name ?? '', phone: c?.phone ?? '' };
  };
  const [name, setName] = useState(s.name);
  const [phone, setPhone] = useState(own?.phone ?? '');
  const [tg, setTg] = useState(own?.tgUsername ? `@${own.tgUsername}` : '');
  const [father, setFather] = useState(slot('father'));
  const [mother, setMother] = useState(slot('mother'));
  const [guardian, setGuardian] = useState(slot('guardian'));
  const tgOk = /^@?[A-Za-z0-9_]{3,32}$/.test(tg.trim()) || !tg.trim();
  // An imported «ota-ona» number can be moved into the father's or mother's slot.
  const move = (to: 'father' | 'mother') => {
    (to === 'father' ? setFather : setMother)((p) => ({ name: p.name || guardian.name, phone: p.phone || guardian.phone }));
    setGuardian({ name: '', phone: '' });
  };
  const ok = () =>
    start(async () => {
      const r = await updateStudentInfoAction({ studentId: s.id, name, phone, tgUsername: tg, father, mother, guardian });
      if (r.error) return onFail(r.error);
      onDone(t('saved'));
    });
  const row = (label: string, id: string, v: Person, set: (p: Person) => void) => (
    <>
      <Field label={t('ofName', { label })}>
        <input id={`info-${id}-n`} className="sx-inp" maxLength={120} value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} />
      </Field>
      <Field label={t('ofPhone', { label })}>
        <input id={`info-${id}-p`} className="sx-inp" inputMode="tel" maxLength={30} value={v.phone} onChange={(e) => set({ ...v, phone: e.target.value })} />
      </Field>
    </>
  );
  return (
    <Panel title={t('infoTitle')}>
      <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
        <Field label={to('c.name')}>
          <input id="info-name" className="sx-inp" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={to('c.phone')}>
          <input id="info-phone" className="sx-inp" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Telegram username" className="col-span-2 max-[480px]:col-span-1">
          <input id="info-tg" className={cn('sx-inp', !tgOk && 'border-au-bad')} maxLength={40} placeholder="@username" value={tg} onChange={(e) => setTg(e.target.value)} />
        </Field>
        {row(t('lFather'), 'father', father, setFather)}
        {row(t('lMother'), 'mother', mother, setMother)}
        {row(t('lGuardian'), 'guardian', guardian, setGuardian)}
      </div>
      {(guardian.name || guardian.phone) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-au-muted">
          {t('whose')}
          <button type="button" className="sx-btn sm" onClick={() => move('father')}>
            {t('fathers')}
          </button>
          <button type="button" className="sx-btn sm" onClick={() => move('mother')}>
            {t('mothers')}
          </button>
        </div>
      )}
      <div className="text-xs text-au-faint">{t('infoNote')}</div>
      <Actions pending={pending || name.trim().length < 2 || !tgOk} ok={ok} okText={to('c.save')} onCancel={onCancel} />
    </Panel>
  );
}

function DeletePane({ s, onDone, onFail, onCancel }: { s: StudentRow; onDone: () => void; onFail: (e: string) => void; onCancel: () => void }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState('');
  const t = useTranslations('ops.card');
  const ok = () =>
    start(async () => {
      const r = await deleteStudentAction(s.id);
      if (r.error) return onFail(r.error);
      onDone();
    });
  return (
    <Panel title={t('delTitle')} danger>
      <div className="text-sm text-au-muted">{t('delNote')}</div>
      <Field label={t('typeName')}>
        <input id="del-confirm" className="sx-inp" autoComplete="off" placeholder={s.name} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Actions pending={pending || confirm.trim() !== s.name.trim()} ok={ok} okText={t('delForever')} onCancel={onCancel} danger />
    </Panel>
  );
}

function RestoreButton({ id, onDone, onFail }: { id: string; onDone: () => void; onFail: (e: string) => void }) {
  const [pending, start] = useTransition();
  const t = useTranslations('ops.card');
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
      {t('restore')}
    </button>
  );
}
