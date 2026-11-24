'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { fillTemplate } from '@/lib/billing';
import { markPaidElsewhereAction, saveBillingSettingsAction, saveTemplatesAction } from '@/lib/actions/students';
import { formatUZS } from '@/lib/format-currency';
import { MoneyInput } from '@/components/ui/money-input';
import type { StudentRow } from '@/lib/ops-students';
import { playSound, toast } from './suite-shell';
import type { OpsData } from './operations-workspace';
import { useTranslations } from 'next-intl';
import { VARS, dmy, useOpsMeta } from './ops-students-meta';
import { LogItem } from './ops-students';

const LEAD_SAMPLE = { ism: 'Aziza', kurs: 'IELTS', sinov_sana: '25.11.2026', sinov_vaqt: '16:00' };
const LEAD_VARS = ['{ism}', '{kurs}', '{sinov_sana}', '{sinov_vaqt}'];
const LEAD_TRIGGERS: Record<string, string> = { before: 'leadBefore', none: 'manualOnly' };
const SAMPLE = {
  ism: 'Aziza Karimova',
  ota_ona: 'Nilufar',
  summa: '650,000 so‘m',
  sana: '25.11.2026',
  qarz: '650,000 so‘m',
  tolandi: '650,000 so‘m',
  havola: 'https://…',
};

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const to = useTranslations('ops');
  return (
    <div className="sx-modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'sx-modal !w-[min(760px,100%)]' : 'sx-modal'} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sx-h">
          <h3>{title}</h3>
          <span className="sp" />
          <button className="sx-btn sm" onClick={onClose} aria-label={to('c.close')}>
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type Draft = { key: string; id: string | null; name: string; body: string; trigger: 'before' | 'due' | 'paid' | 'none' };

/** Xabar shablonlari (o'quvchi yoki lid): add, edit, delete; variables are filled per person when sent. */
export function TemplatesModal({ data, onClose, audience = 'student' }: { data: OpsData; onClose: () => void; audience?: 'student' | 'lead' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const lead = audience === 'lead';
  const ta = useTranslations('ops.adm');
  const to = useTranslations('ops');
  const { TRIGGERS, errText } = useOpsMeta();
  const triggers = lead ? Object.fromEntries(Object.entries(LEAD_TRIGGERS).map(([k, v]) => [k, ta(v)])) : TRIGGERS;
  const vars = lead ? LEAD_VARS : VARS;
  const sample: Record<string, string> = lead ? LEAD_SAMPLE : SAMPLE;
  const [list, setList] = useState<Draft[]>((lead ? data.sales.templates : data.students.templates).map((t) => ({ ...t, key: t.id })));
  const set = (key: string, patch: Partial<Draft>) => setList((l) => l.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const insert = (key: string, v: string) => {
    const el = document.getElementById(`tpl-${key}`) as HTMLTextAreaElement | null;
    const t = list.find((x) => x.key === key);
    if (!t) return;
    const at = el?.selectionStart ?? t.body.length;
    set(key, { body: t.body.slice(0, at) + v + t.body.slice(el?.selectionEnd ?? at) });
    el?.focus();
  };
  const save = () =>
    start(async () => {
      const r = await saveTemplatesAction({ audience, list: list.map(({ id, name, body, trigger }) => ({ id, name, body, trigger })) });
      if (r.error) {
        playSound('err');
        toast.error(errText(r.error));
        return;
      }
      playSound('ok');
      toast.success(ta('tplSaved'));
      router.refresh();
      onClose();
    });
  const canEdit = data.canEdit;
  return (
    <Modal title={lead ? ta('tplLead') : ta('tplParent')} onClose={onClose} wide>
      <p className="mb-3 text-sm leading-relaxed text-au-muted">
        {lead ? (
          <>{ta('tplLeadNote')}</>
        ) : (
          <>{ta('tplParentNote', { n: data.students.settings.remindDays })}</>
        )}
      </p>
      <div className="flex flex-col gap-3">
        {list.map((t) => (
          <div key={t.key} className="flex flex-col gap-2 rounded-xl border border-au-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                id={`tpl-n-${t.key}`}
                className="sx-inp !w-[240px] font-bold"
                aria-label={ta('tplName')}
                maxLength={120}
                disabled={!canEdit}
                value={t.name}
                onChange={(e) => set(t.key, { name: e.target.value })}
              />
              <select
                id={`tpl-t-${t.key}`}
                className="sx-inp !w-auto"
                aria-label={ta('whenSent')}
                disabled={!canEdit}
                value={t.trigger}
                onChange={(e) => set(t.key, { trigger: e.target.value as Draft['trigger'] })}
              >
                {Object.entries(triggers).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <span className="flex-1" />
              {canEdit && (
                <button className="sx-btn sm text-au-bad" onClick={() => setList((l) => l.filter((x) => x.key !== t.key))}>
                  <Trash2 className="size-4" /> {to('c.delete')}
                </button>
              )}
            </div>
            <textarea
              id={`tpl-${t.key}`}
              className="sx-inp min-h-[90px] leading-relaxed"
              aria-label={ta('text')}
              maxLength={3000}
              disabled={!canEdit}
              value={t.body}
              onChange={(e) => set(t.key, { body: e.target.value })}
            />
            {canEdit && (
              <div className="flex flex-wrap gap-1.5">
                {vars.map((v) => (
                  <button key={v} type="button" className="rounded-md border border-dashed border-au-faint px-2 py-0.5 font-mono text-xs text-au-muted hover:text-au-ink" onClick={() => insert(t.key, v)}>
                    {v}
                  </button>
                ))}
              </div>
            )}
            <div className="whitespace-pre-line rounded-[14px_14px_14px_4px] bg-au-accent-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-au-ink">
              {fillTemplate(t.body, sample)}
            </div>
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="sx-btn"
            onClick={() =>
              setList((l) => [...l, { key: crypto.randomUUID(), id: null, name: ta('newTpl'), body: lead ? 'Assalomu alaykum, {ism}! ' : 'Assalomu alaykum, {ota_ona}! {ism} bo‘yicha ', trigger: 'none' }])
            }
          >
            <Plus className="size-4" /> {ta('newTpl')}
          </button>
          <span className="flex-1" />
          <button className="sx-btn primary" disabled={pending || list.some((t) => !t.name.trim() || !t.body.trim())} onClick={save}>
            {to('c.save')}
          </button>
        </div>
      )}
    </Modal>
  );
}

/** Avto-yechim sozlamasi. */
const PAID_SOURCES = ['Boshqa CRM', 'Naqd, eski daftar', 'Boshqa'];
const SRC_KEY: Record<string, string> = { 'Boshqa CRM': 'crm', 'Naqd, eski daftar': 'book', Boshqa: 'other' };

/** Qo'lda faol: one or many students who paid in another CRM. No payment is recorded here. */
export function PaidElsewhereModal({ students, onClose, onDone }: { students: StudentRow[]; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fee, setFee] = useState('');
  const [source, setSource] = useState(PAID_SOURCES[0]);
  const ta = useTranslations('ops.adm');
  const to = useTranslations('ops');
  const { errText } = useOpsMeta();
  const [note, setNote] = useState('');
  const one = students.length === 1;
  const noFee = students.filter((s) => s.fee <= 0).length;
  const save = () =>
    start(async () => {
      const amount = Number(fee.replace(/\D/g, '')) || null;
      const r = await markPaidElsewhereAction({ studentIds: students.map((s) => s.id), source, note, fee: amount });
      if (r.error) {
        playSound('err');
        toast.error(errText(r.error));
        return;
      }
      playSound('ok');
      toast.success(one ? ta('madeActive', { name: students[0].name }) : ta('nMadeActive', { n: r.done ?? students.length }));
      router.refresh();
      onDone();
    });
  return (
    <Modal title={one ? ta('activateOne', { name: students[0].name }) : ta('activateMany', { n: students.length })} onClose={onClose}>
      <p className="mb-3 text-sm leading-relaxed text-au-muted">
        {ta('peNote')}
      </p>
      <div className="flex flex-col gap-3">
        {!one && (
          <ul className="flex max-h-[150px] flex-col gap-1 overflow-auto rounded-xl border border-au-line px-3 py-2 text-sm">
            {students.map((s) => (
              <li key={s.id}>
                <span className="text-au-ink">{s.name}</span>{' '}
                <span className="text-au-faint">· {s.fee > 0 ? `${formatUZS(s.fee)} so‘m` : ta('noFee')}</span>
              </li>
            ))}
          </ul>
        )}
        {noFee > 0 && (
          <>
            {!one && (
              <div className="rounded-xl bg-au-accent-soft px-3 py-2 text-xs text-au-accent-text">
                {ta('noFeeMany', { n: noFee })}
              </div>
            )}
            <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
              {one ? ta('feeReq') : ta('feeForMissing')}
              <MoneyInput id="pe-fee" className="sx-inp" placeholder={ta('feePh')} value={fee ? Number(fee.replace(/\D/g, '')) : null} onValue={(v) => setFee(v == null ? '' : String(v))} />
            </label>
          </>
        )}
        <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
          {ta('wherePaid')}
          <select id="pe-src" className="sx-inp" value={source} onChange={(e) => setSource(e.target.value)}>
            {PAID_SOURCES.map((x) => (
              <option key={x} value={x}>{ta(`src.${SRC_KEY[x]}`)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
          {ta('noteOpt')}
          <input id="pe-note" className="sx-inp" maxLength={300} placeholder={ta('peNotePh')} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="sx-btn" onClick={onClose}>
          {to('c.cancel')}
        </button>
        <button className="sx-btn primary" disabled={pending || (noFee > 0 && !Number(fee.replace(/\D/g, '')))} onClick={save}>
          {ta('makeActive')}
        </button>
      </div>
    </Modal>
  );
}

export function BillingSettingsModal({ data, onClose }: { data: OpsData; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState(data.students.settings);
  const ta = useTranslations('ops.adm');
  const to = useTranslations('ops');
  const { errText } = useOpsMeta();
  const save = () =>
    start(async () => {
      const r = await saveBillingSettingsAction(f);
      if (r.error) {
        playSound('err');
        toast.error(errText(r.error));
        return;
      }
      playSound('ok');
      toast.success(f.enabled ? ta('autoOn') : ta('autoOff'));
      router.refresh();
      onClose();
    });
  const dis = !data.canEdit;
  return (
    <Modal title={ta('autoTitle')} onClose={onClose}>
      <p className="mb-3 text-sm leading-relaxed text-au-muted">
        {ta('autoNote', { d: dmy(f.startDate) })}
      </p>
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-au-ink">
          <input id="bs-on" type="checkbox" disabled={dis} checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
          {ta('autoEnabled')}
        </label>
        <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
          <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
            {ta('fromDate')}
            <input id="bs-start" type="date" className="sx-inp" disabled={dis} value={f.startDate} onChange={(e) => e.target.value && setF({ ...f, startDate: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
            {ta('remindBefore')}
            <select id="bs-remind" className="sx-inp" disabled={dis} value={f.remindDays} onChange={(e) => setF({ ...f, remindDays: Number(e.target.value) })}>
              {[0, 1, 2, 3, 4, 5, 7].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? ta('onlyPayDay') : ta('nDaysBefore', { n })}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
            {ta('callAfter')}
            <input id="bs-call" className="sx-inp" inputMode="numeric" disabled={dis} value={f.callAfterDays} onChange={(e) => setF({ ...f, callAfterDays: Math.min(60, Number(e.target.value.replace(/\D/g, '')) || 1) })} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
            {ta('payLink')}
            <input id="bs-link" className="sx-inp" disabled={dis} maxLength={300} placeholder="https://…" value={f.payLink} onChange={(e) => setF({ ...f, payLink: e.target.value })} />
          </label>
        </div>
      </div>
      {!dis && (
        <div className="mt-4 flex justify-end">
          <button className="sx-btn primary" disabled={pending} onClick={save}>
            {to('c.save')}
          </button>
        </div>
      )}
    </Modal>
  );
}

export function LogModal({ data, onClose, onOpen }: { data: OpsData; onClose: () => void; onOpen: (id: string) => void }) {
  const ta = useTranslations('ops.adm');
  return (
    <Modal title={ta('allActions')} onClose={onClose} wide>
      {data.students.log.length === 0 ? (
        <div className="sx-empty">{ta('noActions')}</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.students.log.map((l) => (
            <LogItem key={l.id} l={l} onOpen={l.studentId ? () => onOpen(l.studentId!) : undefined} />
          ))}
        </ul>
      )}
    </Modal>
  );
}
