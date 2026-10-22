'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { nextDueDate } from '@/lib/billing';
import type { OpsData } from './operations-workspace';
import { ago, som } from './ops-students-meta';
import { isWaiting } from './ops-sales-meta';

/**
 * Operation HQ › Bugun (2026-10-22): today's work without groups — leads
 * waiting for a first call, follow-ups due, trial lessons, students whose
 * payment day is today, and long debts to chase.
 */
export function TodayWork({ data, onTab, onLead }: { data: OpsData; onTab: (t: string) => void; onLead: (id: string) => void }) {
  const [now] = useState(() => Date.now());
  const day = data.today.day;
  const open = data.sales.leads.filter((l) => !l.studentId && !l.lostReason);
  const waiting = open.filter((l) => isWaiting(l, now));
  const follow = open.filter((l) => l.nextAt && l.nextAt <= day).sort((a, b) => (a.nextAt ?? '').localeCompare(b.nextAt ?? ''));
  const trials = open.filter((l) => l.trialDate === day).sort((a, b) => a.trialTime.localeCompare(b.trialTime));
  const live = data.students.rows.filter((s) => s.status === 'active');
  const dueToday = live.filter((s) => s.fee > 0 && s.start && nextDueDate(s.start, day) === day);
  const longDebt = live.filter((s) => s.balance < 0 && s.grade.openDays >= data.students.settings.callAfterDays).sort((a, b) => a.balance - b.balance);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="sx-grid">
        <Stat dark label="Javob kutayotgan lidlar" v={waiting.length} d="15 daqiqadan ko‘p bog‘lanilmagan" bad={waiting.length > 0} />
        <Stat label="Bugungi qo‘ng‘iroqlar" v={follow.length} d="keyingi qadam sanasi bugun yoki o‘tgan" />
        <Stat label="Bugungi sinov darslari" v={trials.length} d="lidlar" />
        <Stat label="Bugun to‘lov kuni" v={dueToday.length} d={som(dueToday.reduce((a, s) => a + s.fee, 0))} />
      </div>
      <div className="sx-grid">
        <Panel title="Javob kutmoqda" sub="birinchi qo‘ng‘iroq — 15 daqiqa ichida" empty="Hamma lid bilan bog‘lanilgan" cls="s6">
          {waiting.map((l) => (
            <Row key={l.id} onClick={() => onLead(l.id)} title={l.name || l.phone} sub={`${l.phone} · ${l.course || 'kurs yo‘q'}${l.owner ? ` · ${l.owner}` : ''}`}>
              <span className="sx-pl bad">{ago(l.createdAt, now)}</span>
            </Row>
          ))}
        </Panel>
        <Panel title="Bugungi qo‘ng‘iroqlar va vazifalar" sub="lidlarning keyingi qadami" empty="Bugunga reja yo‘q" cls="s6">
          {follow.map((l) => (
            <Row key={l.id} onClick={() => onLead(l.id)} title={l.name || l.phone} sub={`${l.nextAction || 'Bog‘lanish'} · ${l.phone}`}>
              <span className={cn('sx-pl', l.nextAt! < day ? 'bad' : 'warn')}>{l.nextAt! < day ? 'muddati o‘tgan' : 'bugun'}</span>
            </Row>
          ))}
        </Panel>
        <Panel title="Bugungi sinov darslari" sub="kelgach bosqichni yangilang" empty="Bugun sinov darsi yo‘q" cls="s4">
          {trials.map((l) => (
            <Row key={l.id} onClick={() => onLead(l.id)} title={l.name || l.phone} sub={`${l.course || 'kurs yo‘q'} · ${l.phone}`}>
              <span className="sx-pl info">{l.trialTime || 'vaqt yo‘q'}</span>
            </Row>
          ))}
        </Panel>
        <Panel title="Bugun to‘lov kuni" sub="avto-yechim 09:00 da" empty="Bugun to‘lov kuni kelgan o‘quvchi yo‘q" cls="s4">
          {dueToday.map((s) => (
            <Row key={s.id} onClick={() => onTab('stu')} title={s.name} sub={`${s.phone || s.parent || '—'}${s.tg ? '' : ' · Telegram yo‘q'}`}>
              <b className="tabular-nums text-sm text-au-ink">{formatUZS(s.fee + Math.max(0, -s.balance))}</b>
            </Row>
          ))}
        </Panel>
        <Panel title="Uzoq qarzdorlar" sub={`${data.students.settings.callAfterDays} kundan ortiq`} empty="Uzoq qarzdor yo‘q" cls="s4">
          {longDebt.slice(0, 10).map((s) => (
            <Row key={s.id} onClick={() => onTab('stu')} title={s.name} sub={`${s.grade.openDays} kun · ${s.parent || s.phone || '—'}`}>
              <b className="tabular-nums text-sm text-au-bad">−{formatUZS(-s.balance)}</b>
            </Row>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, v, d, dark, bad }: { label: string; v: number; d: string; dark?: boolean; bad?: boolean }) {
  return (
    <div className={cn('sx-card sx-stat s3', dark && 'dark')}>
      <div className="l">{label}</div>
      <div className={cn('v', bad && !dark && 'text-au-bad')}>{v}</div>
      <div className="d">{d}</div>
    </div>
  );
}

function Panel({ title, sub, empty, cls, children }: { title: string; sub: string; empty: string; cls: string; children: React.ReactNode[] }) {
  return (
    <div className={cn('sx-card', cls)}>
      <div className="sx-h">
        <h3>{title}</h3>
        <small>{sub}</small>
      </div>
      {children.length === 0 ? <div className="sx-empty">{empty}</div> : <ul className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">{children}</ul>}
    </div>
  );
}

function Row({ title, sub, onClick, children }: { title: string; sub: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button className="flex w-full items-center gap-2 rounded-xl border border-au-line px-3 py-2 text-left hover:border-au-faint" onClick={onClick}>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-sm text-au-ink">{title}</b>
          <span className="block truncate text-xs text-au-faint">{sub}</span>
        </span>
        {children}
      </button>
    </li>
  );
}
