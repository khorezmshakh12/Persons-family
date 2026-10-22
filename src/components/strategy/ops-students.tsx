'use client';

import { useMemo, useState, useTransition } from 'react';
import { Check, Search, Send } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { daysBetween, nextDueDate } from '@/lib/billing';
import { saveBillingSettingsAction, saveEnrollmentBillingAction } from '@/lib/actions/operations';
import { playSound, toast } from './suite-shell';
import type { OpsData } from './operations-workspace';

type Student = OpsData['students'][number];
type Enr = Student['enrollments'][number];
type Filter = 'all' | 'debt' | 'ok' | 'frozen' | 'notg';
const FILTERS: [Filter, string][] = [
  ['all', 'Hammasi'],
  ['debt', 'Qarzdorlar'],
  ['ok', 'Aktiv'],
  ['frozen', 'Muzlatilgan'],
  ['notg', 'Telegramsiz'],
];
const PAGE = 150;
const som = (v: number) => `${formatUZS(Math.round(v))} so‘m`;
const dmy = (k: string) => `${k.slice(8, 10)}.${k.slice(5, 7)}.${k.slice(0, 4)}`;
const err = (e: string) => (e === 'invalidInput' ? 'Summa va sanani tekshiring' : e === 'forbidden' ? "Ruxsat yo'q" : "Saqlab bo'lmadi");

/**
 * Operation HQ › O'quvchilar (2026-10-23): every CRM student with phone, debt or
 * «Aktiv», monthly fee and the activation date that is also the monthly billing
 * day. /api/cron/crm-billing charges on that day and reminds parents beforehand.
 */
export function OpsStudents({ data }: { data: OpsData }) {
  const today = data.today.day;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const all = data.students;

  const live = all.filter((s) => s.status === 'active');
  const debtors = all.filter((s) => s.balance < 0);
  const debt = debtors.reduce((a, s) => a - s.balance, 0);
  const activeEnr = live.flatMap((s) => s.enrollments.filter((e) => e.status === 'active'));
  const expected = activeEnr.reduce((a, e) => a + e.fee, 0);
  const tg = live.filter((s) => s.tg).length;

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    return all.filter((s) => {
      if (t && !s.name.toLowerCase().includes(t) && !(digits && s.phone.replace(/\D/g, '').includes(digits))) return false;
      if (filter === 'debt') return s.balance < 0;
      if (filter === 'ok') return s.status === 'active' && s.balance >= 0;
      if (filter === 'frozen') return s.status === 'frozen' || s.enrollments.some((e) => e.status === 'frozen');
      if (filter === 'notg') return s.status === 'active' && !s.tg;
      return true;
    });
  }, [all, q, filter]);

  // Next 7 days of charges, nearest first.
  const soon = live
    .flatMap((s) =>
      s.enrollments
        .filter((e) => e.status === 'active' && e.fee > 0)
        .map((e) => ({ s, e, due: nextDueDate(e.activation, today) })),
    )
    .filter((x) => daysBetween(today, x.due) <= 7)
    .sort((a, b) => a.due.localeCompare(b.due));

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="sx-grid">
        <div className="sx-card sx-stat dark s3">
          <div className="l">O‘quvchilar</div>
          <div className="v">{all.length}</div>
          <div className="d">
            {live.length} aktiv · {all.length - live.length} nofaol
          </div>
        </div>
        <div className="sx-card sx-stat s3">
          <div className="l">Qarzdorlar</div>
          <div className={cn('v', debtors.length > 0 && 'text-au-bad')}>{debtors.length}</div>
          <div className="d">{all.length ? Math.round((debtors.length / all.length) * 100) : 0}% o‘quvchi</div>
        </div>
        <div className="sx-card sx-stat s3">
          <div className="l">Jami qarz</div>
          <div className={cn('v', debt > 0 && 'text-au-bad')}>{formatUZS(Math.round(debt))}</div>
          <div className="d">so‘m</div>
        </div>
        <div className="sx-card sx-stat s3">
          <div className="l">Oylik kutilayotgan tushum</div>
          <div className="v">{formatUZS(Math.round(expected))}</div>
          <div className="d">
            Telegram ulangan: {tg}/{live.length} ota-ona
          </div>
        </div>
        <BillingCard data={data} />
        <div className="sx-card s5">
          <div className="sx-h">
            <h3>Keyingi 7 kun</h3>
            <small>{soon.length} ta yechim</small>
          </div>
          {soon.length === 0 ? (
            <div className="sx-empty">7 kun ichida to‘lov kuni yo‘q</div>
          ) : (
            <ul className="flex max-h-[220px] flex-col gap-1 overflow-y-auto">
              {soon.map(({ s, e, due }) => {
                const left = daysBetween(today, due);
                return (
                  <li key={e.id} className="flex items-center gap-2 text-sm">
                    <span className={cn('sx-pl w-[74px] justify-center', left === 0 ? 'warn' : 'mute')}>{left === 0 ? 'Bugun' : `${left} kun`}</span>
                    <span className="min-w-0 flex-1 truncate text-au-ink" title={`${s.name} · ${e.group}`}>
                      {s.name} <span className="text-xs text-au-faint">· {e.group}</span>
                    </span>
                    <span className="tabular-nums text-au-muted">{formatUZS(e.fee)}</span>
                    {!s.tg && <span className="sx-pl mute" title="Ota-ona Telegram botga ulanmagan — eslatma bormaydi">TG yo‘q</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="sx-card">
        <div className="sx-h flex-wrap gap-2">
          <h3>O‘quvchilar ro‘yxati</h3>
          <small>{rows.length} ta</small>
          <span className="sp" />
          <div className="sx-seg">
            {FILTERS.map(([k, n]) => (
              <button key={k} className={cn(filter === k && 'on')} onClick={() => { setFilter(k); setLimit(PAGE); }}>
                {n}
              </button>
            ))}
          </div>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-au-faint" />
            <input
              id="ops-stu-q"
              className="sx-inp !w-[220px] !pl-8"
              placeholder="Ism yoki telefon"
              value={q}
              onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }}
            />
          </label>
        </div>
        {rows.length === 0 ? (
          <div className="sx-empty">{all.length ? 'Hech kim topilmadi' : 'CRM’da o‘quvchi yo‘q'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="sx-tbl min-w-[880px]">
              <thead>
                <tr>
                  <th>Ism familiya</th>
                  <th>Telefon</th>
                  <th>Holat</th>
                  <th>Oylik to‘lov</th>
                  <th>Aktiv bo‘lgan sana</th>
                  <th>Keyingi yechim</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((s) => (
                  <StudentRow key={s.id} s={s} today={today} canEdit={data.canEdit} />
                ))}
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
      </div>
    </div>
  );
}

function Status({ s }: { s: Student }) {
  if (s.balance < 0) return <b className="tabular-nums text-au-bad">−{som(-s.balance)}</b>;
  if (s.status === 'frozen') return <span className="sx-pl mute">Muzlatilgan</span>;
  return (
    <span className="sx-pl ok">
      Aktiv{s.balance > 0 ? ` · +${formatUZS(Math.round(s.balance))}` : ''}
    </span>
  );
}

function StudentRow({ s, today, canEdit }: { s: Student; today: string; canEdit: boolean }) {
  const enr = s.enrollments;
  return (
    <tr>
      <td>
        <b className="text-au-ink">{s.name}</b>
        {s.tg && (
          <span className="ml-1.5 inline-flex align-middle text-au-faint" title="Ota-ona Telegram botga ulangan — eslatma boradi">
            <Send className="size-3.5" />
          </span>
        )}
      </td>
      <td className="whitespace-nowrap tabular-nums text-au-muted">{s.phone || '—'}</td>
      <td className="whitespace-nowrap">
        <Status s={s} />
      </td>
      {enr.length === 0 ? (
        <td colSpan={3} className="text-xs text-au-faint">
          Guruhga biriktirilmagan — CRM’da guruhga qo‘shing
        </td>
      ) : (
        <td colSpan={3} className="!p-0">
          {enr.map((e) => (
            <EnrollmentCells key={`${e.id}:${e.fee}:${e.activation}`} e={e} today={today} canEdit={canEdit} frozen={s.status !== 'active'} />
          ))}
        </td>
      )}
    </tr>
  );
}

/** One enrollment: fee, activation (= billing day) and the next charge, editable in place. */
function EnrollmentCells({ e, today, canEdit, frozen }: { e: Enr; today: string; canEdit: boolean; frozen: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fee, setFee] = useState(String(Math.round(e.fee)));
  const [from, setFrom] = useState(e.activation);
  const dirty = Number(fee) !== Math.round(e.fee) || from !== e.activation;
  const paused = frozen || e.status === 'frozen';
  const next = nextDueDate(from, today);
  const left = daysBetween(today, next);

  const save = () =>
    start(async () => {
      const r = await saveEnrollmentBillingAction({ enrollmentId: e.id, fee: Number(fee) || 0, activation: from });
      if (r.error) {
        playSound('err');
        toast.error(err(r.error));
        return;
      }
      playSound('ok');
      toast.success('Saqlandi — keyingi yechimdan amal qiladi');
      router.refresh();
    });

  return (
    <div className="grid grid-cols-[minmax(150px,1.1fr)_minmax(150px,1fr)_minmax(140px,1fr)] items-center gap-3 border-b border-au-line px-3 py-2 last:border-b-0">
      <div className="min-w-0">
        {canEdit ? (
          <input
            id={`fee-${e.id}`}
            className="sx-inp !w-[130px] tabular-nums"
            inputMode="numeric"
            aria-label={`${e.group} oylik to‘lovi`}
            value={fee}
            onChange={(ev) => setFee(ev.target.value.replace(/\D/g, ''))}
          />
        ) : (
          <b className="tabular-nums text-au-ink">{som(e.fee)}</b>
        )}
        <div className="truncate text-xs text-au-faint" title={e.group}>
          {e.group}
        </div>
      </div>
      <div className="min-w-0">
        {canEdit ? (
          <input id={`from-${e.id}`} type="date" className="sx-inp !w-[150px]" aria-label={`${e.group} aktiv bo‘lgan sana`} value={from} onChange={(ev) => ev.target.value && setFrom(ev.target.value)} />
        ) : (
          <span className="tabular-nums text-au-ink">{dmy(from)}</span>
        )}
        <div className="text-xs text-au-faint">har oy {Number(from.slice(8, 10))}-sanada</div>
      </div>
      <div className="flex items-center gap-2">
        {paused ? (
          <span className="sx-pl mute">To‘xtatilgan</span>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="tabular-nums text-au-ink">{dmy(next)}</div>
            <div className={cn('text-xs', left === 0 ? 'font-semibold text-au-accent' : 'text-au-faint')}>{left === 0 ? 'bugun yechiladi' : `${left} kun qoldi`}</div>
          </div>
        )}
        {canEdit && dirty && (
          <button className="sx-btn sm primary" disabled={pending} onClick={save} aria-label="Saqlash">
            <Check className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function BillingCard({ data }: { data: OpsData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const b = data.billing;
  const [f, setF] = useState(b);
  const dirty = f.enabled !== b.enabled || f.startDate !== b.startDate || f.remindDays !== b.remindDays;
  const save = () =>
    start(async () => {
      const r = await saveBillingSettingsAction(f);
      if (r.error) {
        playSound('err');
        toast.error(err(r.error));
        return;
      }
      playSound('ok');
      toast.success(f.enabled ? 'Avto-yechim yoqildi' : 'Avto-yechim o‘chirildi');
      router.refresh();
    });
  return (
    <div className="sx-card s7">
      <div className="sx-h">
        <h3>Avto-yechim</h3>
        <span className={cn('sx-pl', b.enabled ? 'ok' : 'mute')}>{b.enabled ? 'Yoqilgan' : 'O‘chirilgan'}</span>
      </div>
      <p className="mb-3 text-sm text-au-muted">
        Har kuni 09:00 da to‘lov kuni kelgan o‘quvchidan oylik summa yechiladi (balansga qarz bo‘lib tushadi). To‘lovdan{' '}
        {b.remindDays} kun oldin va to‘lov kuni ota-onaga Telegram’da eslatma boradi. {dmy(b.startDate)} dan oldingi davrlar yechilmaydi.
      </p>
      {data.canEdit && (
        <div className="sx-form">
          <label className="flex-row items-center gap-2">
            <input id="bill-on" type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
            Avtomatik yechish
          </label>
          <label>
            Qaysi sanadan
            <input id="bill-start" type="date" className="sx-inp !w-[150px]" value={f.startDate} onChange={(e) => e.target.value && setF({ ...f, startDate: e.target.value })} />
          </label>
          <label>
            Eslatma, kun oldin
            <select id="bill-remind" className="sx-inp !w-[110px]" value={f.remindDays} onChange={(e) => setF({ ...f, remindDays: Number(e.target.value) })}>
              {[0, 1, 2, 3, 5, 7].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'Faqat o‘sha kuni' : `${n} kun`}
                </option>
              ))}
            </select>
          </label>
          <button className="sx-btn primary" disabled={pending || !dirty} onClick={save}>
            Saqlash
          </button>
        </div>
      )}
    </div>
  );
}
