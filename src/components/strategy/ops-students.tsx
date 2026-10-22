'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Mail, Phone, Search, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { daysBetween, nextDueDate } from '@/lib/billing';
import type { StudentRow } from '@/lib/ops-students';
import { playSound } from './suite-shell';
import type { OpsData } from './operations-workspace';
import { CALLS, GRADE, METHODS, dmy, fixFor, som, when } from './ops-students-meta';
import { StudentCardDrawer } from './ops-student-card';
import { BillingSettingsModal, LogModal, TemplatesModal } from './ops-student-admin';

type Filter = 'active' | 'debt' | 'frozen' | 'risk' | 'notg' | 'archive';
const FILTERS: [Filter, string][] = [
  ['active', 'Faol'],
  ['debt', 'Qarzdorlar'],
  ['frozen', 'Muzlatilgan'],
  ['risk', 'Ketish xavfi'],
  ['notg', 'Telegramsiz'],
  ['archive', 'Arxiv'],
];
type GradeF = 'all' | 'ok' | 'late' | 'hard';
const GRADES: [GradeF, string][] = [
  ['all', 'Barcha baho'],
  ['ok', 'Vaqtida'],
  ['late', 'Kechikadi'],
  ['hard', 'Qiyin'],
];
const PAGE = 100;
const LOG_ICON: Record<string, [string, string]> = {
  pay: ['+', 'bg-au-ok-soft text-au-ok'],
  charge: ['−', 'bg-au-bad-soft text-au-bad'],
  msg: ['✉', 'bg-au-accent-soft text-au-accent'],
  archive: ['⌫', 'bg-au-card-2 text-au-muted'],
  restore: ['↺', 'bg-au-info-soft text-au-info'],
  freeze: ['❄', 'bg-au-info-soft text-au-info'],
  call: ['☎', 'bg-au-accent-soft text-au-accent'],
  edit: ['✎', 'bg-au-card-2 text-au-muted'],
  settings: ['⚙', 'bg-au-card-2 text-au-muted'],
};

const isLive = (s: StudentRow) => s.status !== 'archived';

/**
 * Operation HQ › O'quvchilar (2026-10-23): every CRM student — phone, debt (red)
 * or «Aktiv», payment grade, monthly fee and the activation date that is the
 * monthly billing day. A row opens the student's card (payments, charges, who
 * did what). Recent actions on top, statistics and exit reasons below.
 */
export function OpsStudents({ data }: { data: OpsData }) {
  const d = data.students;
  const today = data.today.day;
  const [filter, setFilter] = useState<Filter>('active');
  const [grade, setGrade] = useState<GradeF>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<{ id: string; pane?: string } | null>(null);
  const [modal, setModal] = useState<'tpl' | 'settings' | 'log' | null>(null);

  const live = d.rows.filter(isLive);
  const billed = live.filter((s) => s.status === 'active' && s.fee > 0);
  const debtors = live.filter((s) => s.balance < 0);
  const debt = debtors.reduce((a, s) => a - s.balance, 0);
  const month = d.stats.month;
  const leftThisMonth = d.rows.filter((s) => s.archivedAt?.startsWith(month)).length;
  const expected = billed.reduce((a, s) => a + s.fee, 0);
  const paidCount = billed.filter((s) => s.paidThisMonth).length;

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    return d.rows.filter((s) => {
      if (t && !s.name.toLowerCase().includes(t) && !(digits.length >= 3 && s.phone.replace(/\D/g, '').includes(digits))) return false;
      if (filter === 'archive') return !isLive(s);
      if (!isLive(s)) return false;
      if (grade !== 'all' && s.grade.grade !== grade) return false;
      if (filter === 'debt') return s.balance < 0;
      if (filter === 'frozen') return s.status === 'frozen';
      if (filter === 'risk') return s.risk;
      if (filter === 'notg') return !s.tg;
      return true;
    });
  }, [d.rows, q, filter, grade]);

  const callList = live
    .filter((s) => s.balance < 0 && s.grade.openDays >= d.settings.callAfterDays)
    .sort((a, b) => a.balance - b.balance);

  const exportCsv = () => {
    const head = ['Ism familiya', 'Telefon', 'Ota-ona', 'Holat', 'Balans', 'Oylik to‘lov', 'Chegirma %', 'Aktiv bo‘lgan sana', 'Keyingi to‘lov', 'Baho'];
    const lines = rows.map((s) => [
      s.name,
      s.phone,
      s.parent,
      s.status === 'archived' ? `Arxiv: ${s.leaveReason}` : s.balance < 0 ? 'Qarzdor' : s.status === 'frozen' ? 'Muzlatilgan' : 'Aktiv',
      String(Math.round(s.balance)),
      String(s.fee),
      String(s.discountPct),
      s.start ?? '',
      s.start && s.status === 'active' ? nextDueDate(s.start, today) : '',
      GRADE[s.grade.grade].n,
    ]);
    const csv = [head, ...lines].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    a.download = `oquvchilar-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openCard = (id: string, pane?: string) => {
    playSound('open');
    setOpen({ id, pane });
  };
  const current = open ? d.rows.find((s) => s.id === open.id) : undefined;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Oxirgi amallar */}
      <div className="sx-card">
        <div className="sx-h">
          <h3>Oxirgi amallar</h3>
          <small>kim, qachon, nima qildi</small>
          <span className="sp" />
          <button className="sx-btn sm" onClick={() => setModal('log')}>
            Hammasi
          </button>
        </div>
        {d.log.length === 0 ? (
          <div className="sx-empty">Hali amal yo‘q — to‘lov, yechim va xabarlar shu yerda ko‘rinadi</div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {d.log.slice(0, 6).map((l) => (
              <LogItem key={l.id} l={l} onOpen={l.studentId ? () => openCard(l.studentId!) : undefined} />
            ))}
          </ul>
        )}
      </div>

      <div className="sx-grid">
        <div className="sx-card sx-stat dark s3">
          <div className="l">Faol o‘quvchilar</div>
          <div className="v">{live.length}</div>
          <div className="d">
            {live.filter((s) => s.status === 'frozen').length} muzlatilgan · {d.rows.length - live.length} arxivda
          </div>
        </div>
        <div className="sx-card sx-stat s3">
          <div className="l">Bu oy to‘lagan</div>
          <div className="v">
            {paidCount} <span className="text-base text-au-faint">/ {billed.length}</span>
          </div>
          <div className="d">
            {som(d.stats.collected)} tushdi · reja {formatUZS(expected)}
          </div>
        </div>
        <div className="sx-card sx-stat s3">
          <div className="l">Qarzdorlar</div>
          <div className={cn('v', debtors.length > 0 && 'text-au-bad')}>{debtors.length}</div>
          <div className="d">jami {som(debt)}</div>
        </div>
        <div className="sx-card sx-stat s3">
          <div className="l">Bu oy chiqib ketgan</div>
          <div className="v">{leftThisMonth}</div>
          <div className="d">{live.filter((s) => s.risk).length} ta ketish xavfida</div>
        </div>
      </div>

      {/* Ro'yxat */}
      <div className="sx-card">
        <div className="sx-h flex-wrap gap-2">
          <h3>O‘quvchilar</h3>
          <small>{rows.length} ta</small>
          <span className="sp" />
          <button className="sx-btn sm" onClick={exportCsv} title="Ko‘rinib turgan ro‘yxatni Excel’da ochiladigan faylga yuklab olish">
            <Download className="size-4" /> Excel
          </button>
          <button className="sx-btn sm" onClick={() => setModal('tpl')}>
            <Mail className="size-4" /> Xabar shablonlari
          </button>
          <button className="sx-btn sm" onClick={() => setModal('settings')}>
            <Settings2 className="size-4" /> Avto-yechim{' '}
            <span className={cn('sx-pl', d.settings.enabled ? 'ok' : 'mute')}>{d.settings.enabled ? 'yoqilgan' : 'o‘chiq'}</span>
          </button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="sx-seg">
            {FILTERS.map(([k, n]) => (
              <button key={k} className={cn(filter === k && 'on')} onClick={() => { setFilter(k); setLimit(PAGE); }}>
                {n}
              </button>
            ))}
          </div>
          {filter !== 'archive' && (
            <div className="sx-seg">
              {GRADES.map(([k, n]) => (
                <button key={k} className={cn(grade === k && 'on')} onClick={() => { setGrade(k); setLimit(PAGE); }}>
                  {n}
                </button>
              ))}
            </div>
          )}
          <span className="flex-1" />
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-au-faint" />
            <input id="ops-stu-q" className="sx-inp !w-[230px] !pl-8" placeholder="Ism yoki telefon" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
          </label>
        </div>
        {rows.length === 0 ? (
          <div className="sx-empty">{d.rows.length ? 'Hech kim topilmadi' : 'CRM’da o‘quvchi yo‘q'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="sx-tbl min-w-[980px]">
              <thead>
                {filter === 'archive' ? (
                  <tr>
                    <th>Ism familiya</th>
                    <th>Telefon</th>
                    <th>Chiqarilgan</th>
                    <th>Sabab</th>
                    <th>Kim chiqardi</th>
                    <th className="text-right">Qolgan qarz</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Ism familiya</th>
                    <th>Telefon</th>
                    <th>Holat</th>
                    <th>To‘lov bahosi</th>
                    <th className="text-right">Oylik to‘lov</th>
                    <th>Aktiv bo‘lgan sana</th>
                    <th>Keyingi to‘lov</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.slice(0, limit).map((s) =>
                  filter === 'archive' ? (
                    <tr key={s.id} className="cursor-pointer hover:bg-au-card-2" tabIndex={0} onClick={() => openCard(s.id)} onKeyDown={(e) => e.key === 'Enter' && openCard(s.id)}>
                      <td><b className="text-au-ink">{s.name}</b></td>
                      <td className="whitespace-nowrap tabular-nums text-au-muted">{s.phone || '—'}</td>
                      <td className="tabular-nums">{s.archivedAt ? dmy(s.archivedAt) : '—'}</td>
                      <td>
                        <span className="sx-pl mute">{s.leaveReason || 'Sababsiz'}</span>
                        {s.leaveNote && <div className="mt-1 text-xs text-au-faint">{s.leaveNote}</div>}
                      </td>
                      <td className="text-xs text-au-muted">{s.archivedBy || '—'}</td>
                      <td className="text-right">{s.balance < 0 ? <b className="tabular-nums text-au-bad">{formatUZS(-s.balance)}</b> : '—'}</td>
                    </tr>
                  ) : (
                    <Row key={s.id} s={s} today={today} onOpen={() => openCard(s.id)} />
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > limit && (
          <div className="mt-3 flex justify-center">
            <button className="sx-btn" onClick={() => setLimit(limit + PAGE)}>
              Yana {Math.min(PAGE, rows.length - limit)} ta ko‘rsatish
            </button>
          </div>
        )}
        <div className="mt-2 text-xs text-au-faint">Qatorni bosing — o‘quvchi kartasi: barcha to‘lov va yechimlar, xabarlar, kim nima qilgani.</div>
      </div>

      {/* Qarzdorga qo'ng'iroq */}
      <div className="sx-card">
        <div className="sx-h">
          <h3>Qo‘ng‘iroq qilish kerak</h3>
          <small>qarzi {d.settings.callAfterDays} kundan oshganlar · {callList.length} ta</small>
        </div>
        {callList.length === 0 ? (
          <div className="sx-empty">Uzoq muddatli qarzdor yo‘q</div>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {callList.slice(0, 12).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-au-line px-3 py-2">
                <div className="min-w-0 flex-1">
                  <b className="text-au-ink">{s.name}</b> <span className="tabular-nums text-sm font-bold text-au-bad">−{formatUZS(-s.balance)}</span>
                  <div className="text-xs text-au-faint">
                    {s.grade.openDays} kundan beri · {s.parent || s.phone || 'telefon yo‘q'}
                    {s.lastCall && ` · oxirgi: ${CALLS[s.lastCall.result]} ${when(s.lastCall.at).slice(0, 10)}${s.lastCall.promised ? ` (va’da ${dmy(s.lastCall.promised)})` : ''}`}
                  </div>
                </div>
                <button className="sx-btn sm" onClick={() => openCard(s.id, 'call')}>
                  <Phone className="size-4" /> Natija
                </button>
              </li>
            ))}
          </ul>
        )}
        {callList.length > 12 && <div className="mt-2 text-xs text-au-faint">Yana {callList.length - 12} ta — «Qarzdorlar» filtrida.</div>}
      </div>

      <Stats data={data} />

      {current && open && (
        <StudentCardDrawer key={current.id} s={current} data={data} pane={open.pane} onClose={() => setOpen(null)} />
      )}
      {modal === 'tpl' && <TemplatesModal data={data} onClose={() => setModal(null)} />}
      {modal === 'settings' && <BillingSettingsModal data={data} onClose={() => setModal(null)} />}
      {modal === 'log' && <LogModal data={data} onClose={() => setModal(null)} onOpen={(id) => { setModal(null); openCard(id); }} />}
    </div>
  );
}

export function LogItem({ l, onOpen }: { l: OpsData['students']['log'][number]; onOpen?: () => void }) {
  const [ic, tone] = LOG_ICON[l.kind] ?? LOG_ICON.edit;
  return (
    <li
      className={cn('flex min-w-0 items-start gap-2.5 rounded-xl border border-au-line bg-au-card-2/50 px-3 py-2', onOpen && 'cursor-pointer hover:border-au-faint')}
      onClick={onOpen}
    >
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg text-sm font-extrabold', tone)}>{ic}</span>
      <span className="min-w-0 text-[13px] leading-snug text-au-ink">
        {l.text}
        <span className="block text-xs text-au-faint">
          {l.actor} · {when(l.at)}
        </span>
      </span>
    </li>
  );
}

function Row({ s, today, onOpen }: { s: StudentRow; today: string; onOpen: () => void }) {
  const g = GRADE[s.grade.grade];
  const next = s.start && s.status === 'active' ? nextDueDate(s.start, today) : null;
  const left = next ? daysBetween(today, next) : 0;
  return (
    <tr className="cursor-pointer hover:bg-au-card-2" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <td>
        <b className="text-au-ink">{s.name}</b>
        <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
          {s.risk && (
            <span className="sx-pl bad" title="Oxirgi 3 darsga kelmadi">
              <AlertTriangle className="size-3" /> xavf
            </span>
          )}
          {!s.tg && <span className="sx-pl mute" title="Ota-ona Telegram botga ulanmagan — eslatma bormaydi">TG yo‘q</span>}
        </span>
      </td>
      <td className="whitespace-nowrap tabular-nums text-au-muted">{s.phone || '—'}</td>
      <td className="whitespace-nowrap">
        {s.balance < 0 ? (
          <b className="tabular-nums text-au-bad">−{som(-s.balance)}</b>
        ) : s.status === 'frozen' ? (
          <span className="sx-pl info">Muzlatilgan</span>
        ) : (
          <span className="sx-pl ok">Aktiv{s.balance > 0 ? ` · +${formatUZS(s.balance)}` : ''}</span>
        )}
      </td>
      <td>
        {s.grade.total === 0 ? (
          <span className="text-xs text-au-faint">Hali to‘lov yo‘q</span>
        ) : (
          <>
            <span className={cn('sx-pl', g.tone)}>{g.n}</span>
            <div className="mt-1 text-xs text-au-faint">
              {s.grade.onTime}/{s.grade.total} vaqtida · o‘rtacha {s.grade.avgDelay} kun
            </div>
          </>
        )}
      </td>
      <td className="text-right">
        <b className="tabular-nums text-au-ink">{s.fee ? formatUZS(s.fee) : '—'}</b>
        {(s.discountPct > 0 || s.installments === 2) && (
          <div className="text-xs text-au-faint">
            {s.discountPct > 0 && `−${s.discountPct}%`}
            {s.discountPct > 0 && s.installments === 2 && ' · '}
            {s.installments === 2 && '2 qism'}
          </div>
        )}
      </td>
      <td className="tabular-nums">
        {s.start ? (
          <>
            {dmy(s.start)}
            <div className="text-xs text-au-faint">har oy {Number(s.start.slice(8, 10))}-sanada</div>
          </>
        ) : (
          <span className="text-xs text-au-faint">Kiritilmagan</span>
        )}
      </td>
      <td>
        {s.status === 'frozen' ? (
          <span className="text-xs text-au-muted">{s.frozenUntil ? `${dmy(s.frozenUntil)} gacha to‘xtatilgan` : 'To‘xtatilgan'}</span>
        ) : next ? (
          <>
            <span className="tabular-nums text-au-ink">{dmy(next)}</span>
            <div className={cn('text-xs', left <= 3 ? 'font-semibold text-au-accent' : 'text-au-faint')}>
              {left === 0 ? 'bugun' : `${left} kun qoldi`} · {formatUZS(s.fee + Math.max(0, -s.balance))}
            </div>
          </>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

function Bars({ items, tone }: { items: { k: string; v: number; label: string; hot?: boolean }[]; tone: string }) {
  const max = Math.max(1, ...items.map((i) => i.v));
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((i) => (
        <div key={i.k} className="grid grid-cols-[minmax(110px,170px)_1fr_auto] items-center gap-2.5 text-[13px]">
          <span className="truncate text-au-ink" title={i.k}>
            {i.k}
          </span>
          <span className="sx-hb">
            <i className={i.hot ? 'bg-au-bad' : tone} style={{ width: `${(i.v / max) * 100}%` }} />
          </span>
          <span className="tabular-nums text-au-muted">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

function Stats({ data }: { data: OpsData }) {
  const d = data.students;
  const live = d.rows.filter(isLive);
  const billed = live.filter((s) => s.status === 'active' && s.fee > 0);
  const expected = billed.reduce((a, s) => a + s.fee, 0);
  const paid = billed.filter((s) => s.paidThisMonth).length;
  const pct = expected ? Math.min(100, Math.round((d.stats.collected / expected) * 100)) : 0;
  const graded = live.filter((s) => s.grade.total > 0);
  const cnt = { ok: 0, late: 0, hard: 0 };
  for (const s of graded) cnt[s.grade.grade]++;
  const tot = graded.length || 1;
  const aging = [
    { k: '1–7 kun', v: 0 },
    { k: '8–30 kun', v: 0 },
    { k: '30+ kun', v: 0 },
  ];
  for (const s of live) if (s.balance < 0) aging[s.grade.openDays <= 7 ? 0 : s.grade.openDays <= 30 ? 1 : 2].v += -s.balance;
  const todayK = d.stats.kassa.filter((k) => k.today);
  const todayTotal = todayK.reduce((a, k) => a + k.amount, 0);
  const reasons = d.stats.reasons;
  const repeated = reasons.filter((r) => r.n >= 2);

  return (
    <div className="sx-grid">
      <div className="sx-card s12 !pb-2">
        <div className="sx-h !mb-0">
          <h3>Statistika</h3>
          <small>{dmy(`${d.stats.month}-01`).slice(3)} oyi</small>
        </div>
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Bu oy to‘lov</h3>
        </div>
        <div className="text-[26px] font-bold tabular-nums text-au-ink">
          {paid} / {billed.length}
        </div>
        <div className="text-xs text-au-faint">o‘quvchi to‘ladi · {billed.length - paid} tasi hali to‘lamagan</div>
        <div className="sx-hb mt-4">
          <i className="bg-au-ok" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 text-xs text-au-muted">
          {som(d.stats.collected)} tushdi · reja {som(expected)} · {pct}%
        </div>
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>To‘lov bahosi</h3>
          <small>{graded.length} o‘quvchi</small>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-au-card-2">
          <i className="bg-au-ok" style={{ width: `${(cnt.ok / tot) * 100}%` }} />
          <i className="bg-au-accent" style={{ width: `${(cnt.late / tot) * 100}%` }} />
          <i className="bg-au-bad" style={{ width: `${(cnt.hard / tot) * 100}%` }} />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-3 text-xs text-au-muted">
          <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-au-ok" />Vaqtida {cnt.ok}</span>
          <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-au-accent" />Kechikadi {cnt.late}</span>
          <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-au-bad" />Qiyin {cnt.hard}</span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-au-faint">
          Baho oxirgi 4 to‘lovdan: o‘rtacha 3 kungacha kechiksa — vaqtida; 4–14 kun — kechikadi; 14 kundan ko‘p yoki 2 oylik qarz — qiyin.
        </p>
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Qarz necha kundan beri</h3>
        </div>
        <Bars tone="bg-au-bad" items={aging.map((a) => ({ k: a.k, v: a.v, label: formatUZS(a.v) }))} />
        <div className="sx-h !mb-2 mt-4">
          <h3 className="!text-sm">To‘lov usuli</h3>
        </div>
        {d.stats.methods.length ? (
          <Bars tone="bg-au-accent" items={d.stats.methods.map((m) => ({ k: METHODS[m.method] ?? m.method, v: m.amount, label: formatUZS(m.amount) }))} />
        ) : (
          <div className="text-xs text-au-faint">Bu oy to‘lov yo‘q</div>
        )}
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Kunlik kassa</h3>
          <small>bugun · {som(todayTotal)}</small>
        </div>
        {todayK.length === 0 ? (
          <div className="sx-empty">Bugun to‘lov qabul qilinmagan</div>
        ) : (
          <table className="sx-tbl">
            <tbody>
              {todayK.map((k) => (
                <tr key={`${k.actor}-${k.method}`}>
                  <td className="text-au-ink">{k.actor}</td>
                  <td className="text-au-muted">{METHODS[k.method] ?? k.method} · {k.count} ta</td>
                  <td className="text-right font-bold tabular-nums">{formatUZS(k.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Chiqib ketish sabablari</h3>
          <small>oxirgi 90 kun · {reasons.reduce((a, r) => a + r.n, 0)} ta</small>
        </div>
        {reasons.length ? (
          <Bars tone="bg-au-faint" items={reasons.map((r) => ({ k: r.reason, v: r.n, label: `${r.n} ta`, hot: r.n >= 3 }))} />
        ) : (
          <div className="sx-empty">Hali hech kim chiqarilmagan</div>
        )}
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Yechim kerak</h3>
          <small>bir xil sabab 2 va undan ko‘p marta</small>
        </div>
        {repeated.length === 0 ? (
          <div className="sx-empty">Takrorlanayotgan sabab yo‘q</div>
        ) : (
          <div className="flex flex-col gap-2">
            {repeated.map((r) => (
              <div key={r.reason} className={cn('rounded-xl border px-3 py-2.5', r.n >= 3 ? 'border-au-bad/50 bg-au-bad-soft' : 'border-au-line bg-au-card-2/50')}>
                <div className="flex items-center gap-2">
                  <b className="text-sm text-au-ink">{r.reason}</b>
                  <span className={cn('sx-pl', r.n >= 3 ? 'bad' : 'warn')}>{r.n} marta</span>
                </div>
                <div className="mt-1 text-[13px] leading-snug text-au-muted">{fixFor(r.reason)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
