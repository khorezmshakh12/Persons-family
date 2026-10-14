'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  AlarmClock,
  CalendarCheck,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Clock,
  FileDown,
  FolderOpen,
  Hourglass,
  Laptop,
  Search,
  Sparkles,
  SquarePen,
  Trash2,
  UserCheck,
  UserRoundCog,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { Department } from '@/lib/permissions';
import {
  LATE_AFTER,
  STATUS_LABEL,
  WORK_END,
  WORK_START,
  formatUzbekDay,
  workedHours,
  type AttendanceRecord,
  type AttendanceStatus,
} from '@/lib/attendance';
import { clearAttendanceAction, markAllPresentAction, saveAttendanceAction } from '@/lib/actions/attendance';

export type AttendanceRow = AttendanceRecord & {
  id: string;
  name: string;
  roleLabel: string;
  dept: Department;
};

type Filter = 'all' | 'office' | 'late' | 'remote' | 'absent';

const DEPT_LABEL: Record<Department, string> = {
  top: 'Rahbariyat',
  acad: 'Akademik',
  com: 'Tijorat',
  ops: 'Operatsiya',
  fin: 'Moliya',
  hr: 'HR va Boshqaruv',
};

const AVATAR_COLORS = [
  'from-indigo-500 to-violet-600',
  'from-emerald-500 to-teal-600',
  'from-sky-500 to-blue-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-purple-500 to-fuchsia-600',
];

const STATUS_STYLE: Record<AttendanceStatus, { bg: string; dot: string }> = {
  office: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  late: { bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  remote: { bg: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' },
  left: { bg: 'bg-slate-100 text-slate-700 border-slate-300', dot: 'bg-slate-500' },
  absent: { bg: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
};

const STATUS_OPTION: Record<AttendanceStatus, string> = {
  office: '🟢 Ofisda (Kelgan)',
  late: '🟡 Kechikdi',
  remote: '🔵 Masofadan (Onlayn)',
  left: '⚪ Ishdan ketgan',
  absent: '🔴 Kelmadi (Yo‘q)',
};

const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tashkent',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Current Tashkent time as HH:MM. */
function nowHm(): string {
  return clockFmt.format(new Date()).slice(0, 5);
}

function shiftDay(day: string, offset: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.substring(0, 2) || 'XD').toUpperCase();
}

function avatarColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function matchesFilter(status: AttendanceStatus, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'remote') return status === 'remote' || status === 'left';
  return status === f;
}

const CARD = 'rounded-2xl border border-au-line bg-au-card shadow-sm';
const TIME_INPUT =
  'rounded-lg border border-au-line bg-au-card-2 px-2.5 py-1.5 text-xs font-medium text-au-ink transition hover:bg-au-card focus:bg-au-card focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm';
const FIELD =
  'w-full rounded-xl border border-au-line bg-au-card px-3.5 py-2.5 text-sm text-au-ink focus:ring-2 focus:ring-indigo-500 focus:outline-none';

export function AttendanceView({ day, today, initialRows }: { day: string; today: string; initialRows: AttendanceRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<Filter>('all');
  const [dept, setDept] = useState<'all' | Department>('all');
  const [query, setQuery] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [clock, setClock] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const tick = () => setClock(clockFmt.format(new Date()));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  function goTo(next: string) {
    if (!next || next === day) return;
    router.push(next === today ? '/attendance' : `/attendance?day=${next}`);
  }

  /** Optimistic local update + save; rolls back on error. */
  function commit(id: string, patch: Partial<AttendanceRecord>, message: string, kind: 'success' | 'info' = 'success') {
    const before = rows.find((r) => r.id === id);
    if (!before) return;
    const next = { ...before, ...patch };
    setRows((rs) => rs.map((r) => (r.id === id ? next : r)));
    startTransition(async () => {
      const res = await saveAttendanceAction({
        profileId: id,
        day,
        checkIn: next.checkIn,
        checkOut: next.checkOut,
        status: next.status,
        note: next.note,
      });
      if (res.error) {
        setRows((rs) => rs.map((r) => (r.id === id ? before : r)));
        toast.error('Saqlab bo‘lmadi — qayta urinib ko‘ring');
      } else if (kind === 'info') toast.info(message);
      else toast.success(message);
    });
  }

  function updateTime(r: AttendanceRow, field: 'checkIn' | 'checkOut', value: string) {
    const patch: Partial<AttendanceRecord> = { [field]: value };
    // A check-in after 09:05 is late; any check-in lifts "Kelmadi" to "Ofisda".
    if (field === 'checkIn' && value) {
      if (value > LATE_AFTER) patch.status = 'late';
      else if (r.status === 'absent') patch.status = 'office';
    }
    commit(r.id, patch, `${r.name}ning ${field === 'checkIn' ? 'kelish' : 'ketish'} vaqti (${value || 'bo‘sh'}) saqlandi`);
  }

  function quickNow(r: AttendanceRow, field: 'checkIn' | 'checkOut') {
    const t = nowHm();
    if (field === 'checkIn') {
      commit(r.id, { checkIn: t, status: t > LATE_AFTER ? 'late' : 'office' }, `${r.name} soat ${t} da ishga keldi deb belgilandi`);
    } else {
      commit(r.id, { checkOut: t, status: 'left' }, `${r.name} soat ${t} da ishdan ketdi deb belgilandi`, 'info');
    }
  }

  function updateStatus(r: AttendanceRow, status: AttendanceStatus) {
    const patch: Partial<AttendanceRecord> = { status };
    if (status === 'absent') {
      patch.checkIn = '';
      patch.checkOut = '';
    } else if ((status === 'office' || status === 'late') && !r.checkIn) {
      patch.checkIn = status === 'late' ? '09:15' : WORK_START;
    }
    commit(r.id, patch, `${r.name} statusi "${STATUS_LABEL[status]}" ga o‘zgartirildi`);
  }

  function updateNote(r: AttendanceRow, note: string) {
    if (note.trim() === r.note) return;
    commit(r.id, { note: note.trim() }, `${r.name} uchun izoh yangilandi`, 'info');
  }

  function markAll() {
    const before = rows;
    setRows((rs) => rs.map((r) => (r.status === 'absent' ? { ...r, status: 'office', checkIn: WORK_START } : r)));
    startTransition(async () => {
      const res = await markAllPresentAction(day);
      if (res.error) {
        setRows(before);
        toast.error('Saqlab bo‘lmadi — qayta urinib ko‘ring');
      } else toast.success('Barcha xodimlar "Ofisda" deb belgilandi');
    });
  }

  function confirmDelete() {
    const target = rows.find((r) => r.id === deleteId);
    setDeleteId(null);
    if (!target) return;
    const before = target;
    setRows((rs) => rs.map((r) => (r.id === target.id ? { ...r, checkIn: '', checkOut: '', status: 'absent', note: '' } : r)));
    startTransition(async () => {
      const res = await clearAttendanceAction(target.id, day);
      if (res.error) {
        setRows((rs) => rs.map((r) => (r.id === target.id ? before : r)));
        toast.error('O‘chirib bo‘lmadi — qayta urinib ko‘ring');
      } else toast.error(`${target.name} davomat yozuvi o‘chirildi`);
    });
  }

  function exportCsv() {
    if (!rows.length) {
      toast.error('Eksport qilish uchun ma‘lumot yo‘q');
      return;
    }
    const q = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    const headers = ['ID', 'F.I.Sh', 'Bo‘lim', 'Lavozim', 'Sana', 'Kelgan vaqti', 'Ketgan vaqti', 'Status', 'Izoh'];
    const lines = rows.map((r) =>
      [r.id, q(r.name), q(DEPT_LABEL[r.dept]), q(r.roleLabel), day, r.checkIn || '-', r.checkOut || '-', STATUS_LABEL[r.status], q(r.note)].join(','),
    );
    const blob = new Blob(['﻿' + [headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `davomat_${day}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Davomat jadvali (davomat_${day}.csv) yuklab olindi!`);
  }

  function resetFilters() {
    setQuery('');
    setDept('all');
    setFilter('all');
  }

  const stats = useMemo(() => {
    const total = rows.length;
    const office = rows.filter((r) => r.status === 'office').length;
    const late = rows.filter((r) => r.status === 'late').length;
    const remote = rows.filter((r) => r.status === 'remote' || r.status === 'left').length;
    const absent = rows.filter((r) => r.status === 'absent').length;
    const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
    return {
      total,
      office,
      late,
      remote,
      absent,
      rate: Math.round(pct(office + late + remote)),
      officePct: Math.round(pct(office)),
      w: { office: pct(office), late: pct(late), remote: pct(remote), absent: pct(absent) },
    };
  }, [rows]);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      matchesFilter(r.status, filter) &&
      (dept === 'all' || r.dept === dept) &&
      (!q ||
        r.name.toLowerCase().includes(q) ||
        r.roleLabel.toLowerCase().includes(q) ||
        DEPT_LABEL[r.dept].toLowerCase().includes(q) ||
        r.note.toLowerCase().includes(q)),
  );

  const tabCount: Record<Filter, number> = {
    all: stats.total,
    office: stats.office,
    late: stats.late,
    remote: stats.remote,
    absent: stats.absent,
  };
  const TABS: [Filter, string][] = [
    ['all', 'Barchasi'],
    ['office', 'Ofisda'],
    ['late', 'Kechikkanlar'],
    ['remote', 'Masofadan / Ketgan'],
    ['absent', 'Kelmaganlar'],
  ];

  const editing = rows.find((r) => r.id === editId) ?? null;
  const deleting = rows.find((r) => r.id === deleteId) ?? null;

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-3 pt-1 pb-8 text-au-ink sm:px-6 lg:px-8">
      {/* 1. Sarlavha, jonli soat, sana tanlash, amallar */}
      <div className={cn(CARD, 'flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between')}>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-linear-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20">
            <Clock className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Xodimlar Davomati</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                Jonli tizim
              </span>
            </div>
            <p className="text-xs text-au-muted sm:text-sm">
              Xodimlarning kelish-ketish vaqtlarini istalgan paytda kiritish, tahrirlash va nazorat qilish
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <div className="hidden items-center gap-2 rounded-xl border border-au-line bg-au-card-2 px-3.5 py-2 text-sm font-medium xl:flex">
            <Clock className="size-4 text-indigo-600" />
            <span className="font-mono font-semibold" suppressHydrationWarning>
              {clock ?? '--:--:--'}
            </span>
          </div>

          <div className="flex items-center rounded-xl border border-au-line bg-au-card-2 p-1">
            <button
              type="button"
              onClick={() => goTo(shiftDay(day, -1))}
              title="Oldingi kun"
              className="flex size-8 items-center justify-center rounded-lg text-au-muted transition hover:bg-au-card hover:text-indigo-600 hover:shadow-sm"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <input
              type="date"
              value={day}
              onChange={(e) => goTo(e.target.value)}
              className="cursor-pointer border-0 bg-transparent px-2.5 py-1 text-sm font-semibold focus:outline-none"
            />
            <button
              type="button"
              onClick={() => goTo(shiftDay(day, 1))}
              title="Keyingi kun"
              className="flex size-8 items-center justify-center rounded-lg text-au-muted transition hover:bg-au-card hover:text-indigo-600 hover:shadow-sm"
            >
              <ChevronRight className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => goTo(today)}
              className="ml-1 rounded-lg border border-au-line bg-au-card px-2.5 py-1 text-xs font-semibold text-indigo-600 shadow-sm transition hover:bg-indigo-50"
            >
              Bugun
            </button>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            title="Excel / CSV formatda yuklab olish"
            className="flex items-center gap-2 rounded-xl border border-au-line bg-au-card px-3.5 py-2.5 text-sm font-medium shadow-sm transition hover:bg-au-card-2"
          >
            <FileDown className="size-4 text-au-muted" />
            <span className="hidden sm:inline">Eksport</span>
          </button>
        </div>
      </div>

      {/* 2. Statistika kartalari */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          onClick={() => setFilter('all')}
          hover="hover:border-indigo-300"
          label="Jami Ro‘yxatda"
          value={stats.total}
          valueClass=""
          icon={<Users className="size-5" />}
          iconClass="bg-indigo-50 text-indigo-600"
          foot="Shu sanadagi xodimlar"
          right={<span className="font-medium text-indigo-600">Barchasi &rarr;</span>}
        />
        <StatCard
          onClick={() => setFilter('office')}
          hover="hover:border-emerald-300"
          label="Ofisda / Faol"
          value={stats.office}
          valueClass="text-emerald-600"
          icon={<UserCheck className="size-5" />}
          iconClass="bg-emerald-50 text-emerald-600"
          foot="O‘z vaqtida kelgan"
          right={<span className="font-semibold text-emerald-600">{stats.officePct}%</span>}
        />
        <StatCard
          onClick={() => setFilter('late')}
          hover="hover:border-amber-300"
          label="Kechikkanlar"
          value={stats.late}
          valueClass="text-amber-500"
          icon={<AlarmClock className="size-5" />}
          iconClass="bg-amber-50 text-amber-500"
          foot={`${LATE_AFTER} dan keyin kelgan`}
          right={<span className="font-medium text-amber-600">Ko‘rish &rarr;</span>}
        />
        <StatCard
          onClick={() => setFilter('remote')}
          hover="hover:border-sky-300"
          label="Masofadan / Ketgan"
          value={stats.remote}
          valueClass="text-sky-600"
          icon={<Laptop className="size-5" />}
          iconClass="bg-sky-50 text-sky-600"
          foot="Onlayn yoki ishni tugatgan"
          right={<span className="font-medium text-sky-600">Ko‘rish &rarr;</span>}
        />
        <StatCard
          onClick={() => setFilter('absent')}
          hover="hover:border-rose-300"
          label="Kelmaganlar"
          value={stats.absent}
          valueClass="text-rose-600"
          icon={<UserX className="size-5" />}
          iconClass="bg-rose-50 text-rose-600"
          foot="Sababli / Sababsiz yo‘q"
          right={<span className="font-medium text-rose-600">Ko‘rish &rarr;</span>}
        />
      </div>

      {/* Umumiy davomat ko‘rsatkichi */}
      <div className={cn(CARD, 'flex flex-col justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center')}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Kunlik faollik ko‘rsatkichi:</span>
          <span className="rounded-lg bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">{stats.rate}% ishtirok</span>
        </div>
        <div className="flex h-2.5 w-full max-w-xl flex-1 overflow-hidden rounded-full bg-au-card-2">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${stats.w.office}%` }} title="Ofisda" />
          <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${stats.w.late}%` }} title="Kechikdi" />
          <div className="h-full bg-sky-500 transition-all duration-500" style={{ width: `${stats.w.remote}%` }} title="Masofadan / Ketgan" />
          <div className="h-full bg-rose-400 transition-all duration-500" style={{ width: `${stats.w.absent}%` }} title="Kelmadi" />
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={markAll}
            className="flex items-center gap-1 font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
          >
            <CheckCheck className="size-3.5" /> Barchani &quot;Ofisda&quot; qilish
          </button>
        </div>
      </div>

      {/* 3. Filtrlar, qidiruv va jadval */}
      <div className={cn(CARD, 'overflow-hidden')}>
        <div className="flex flex-col gap-4 border-b border-au-line bg-au-card-2/40 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {TABS.map(([key, label]) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    'rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition sm:text-sm',
                    active ? 'bg-indigo-600 text-white shadow-sm' : 'text-au-muted hover:bg-au-card-2',
                  )}
                >
                  {label}{' '}
                  <span
                    className={cn(
                      'ml-1 rounded-md px-1.5 py-0.5 text-[11px]',
                      active ? 'bg-indigo-700 text-white' : 'bg-au-card-2 text-au-ink',
                    )}
                  >
                    {tabCount[key]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center">
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value as 'all' | Department)}
              className="rounded-xl border border-au-line bg-au-card px-3.5 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="all">Barcha bo‘limlar</option>
              {(Object.keys(DEPT_LABEL) as Department[]).map((d) => (
                <option key={d} value={d}>
                  {DEPT_LABEL[d]}
                </option>
              ))}
            </select>
            <div className="relative flex-1 sm:w-64">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ism, lavozim yoki izoh..."
                className="w-full rounded-xl border border-au-line bg-au-card py-2 pr-8 pl-9 text-sm placeholder:text-au-faint focus:border-transparent focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <Search className="absolute top-2.5 left-3.5 size-4 text-au-faint" />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="absolute top-2 right-2.5 text-au-faint hover:text-au-ink">
                  <CircleX className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100/80 bg-indigo-50/50 px-5 py-2.5 text-xs text-indigo-900">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-indigo-600" />
            <span>
              <strong>Tezkor boshqaruv:</strong> Vaqt katakchalarini yoki statusni to‘g‘ridan-to‘g‘ri jadvalning o‘zida
              o‘zgartirishingiz mumkin — o‘zgarishlar avtomatik saqlanadi!
            </span>
          </div>
          <span className="flex items-center gap-1 font-semibold text-indigo-700">
            <CalendarCheck className="size-3.5" /> {formatUzbekDay(day)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-au-line bg-au-card-2/80 text-[11px] font-bold tracking-wider text-au-muted uppercase">
                <th className="px-5 py-3.5">Xodim</th>
                <th className="px-4 py-3.5">Bo‘lim / Lavozim</th>
                <th className="px-4 py-3.5">Kelgan vaqti (Kirish)</th>
                <th className="px-4 py-3.5">Ketgan vaqti (Chiqish)</th>
                <th className="px-4 py-3.5">Ishlagan soati</th>
                <th className="px-4 py-3.5">Status (Holati)</th>
                <th className="px-4 py-3.5">Izoh</th>
                <th className="px-5 py-3.5 text-right">Boshqarish</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-au-line text-sm">
              {filtered.map((r) => {
                const st = STATUS_STYLE[r.status];
                return (
                  <tr key={r.id} className="group transition hover:bg-au-card-2/60">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-xs font-bold text-white',
                            avatarColor(r.id),
                          )}
                        >
                          {initials(r.name)}
                        </div>
                        <div>
                          <div className="leading-tight font-semibold">{r.name}</div>
                          <div className="mt-0.5 text-[11px] text-au-faint">ID: #{r.id.slice(-4).toUpperCase()}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs font-medium sm:text-sm">{r.roleLabel}</div>
                      <div className="text-xs text-au-faint">{DEPT_LABEL[r.dept]}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          key={`in-${r.checkIn}`}
                          type="time"
                          defaultValue={r.checkIn}
                          onBlur={(e) => e.target.value !== r.checkIn && updateTime(r, 'checkIn', e.target.value)}
                          className={TIME_INPUT}
                        />
                        <button
                          type="button"
                          onClick={() => quickNow(r, 'checkIn')}
                          title="Hozirgi vaqtda keldi deb belgilash"
                          className="rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                        >
                          Keldi
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          key={`out-${r.checkOut}`}
                          type="time"
                          defaultValue={r.checkOut}
                          onBlur={(e) => e.target.value !== r.checkOut && updateTime(r, 'checkOut', e.target.value)}
                          className={TIME_INPUT}
                        />
                        <button
                          type="button"
                          onClick={() => quickNow(r, 'checkOut')}
                          title="Hozirgi vaqtda ketdi deb belgilash"
                          className="rounded-lg bg-au-card-2 px-2 py-1.5 text-xs font-semibold transition hover:bg-au-line"
                        >
                          Ketdi
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-au-card-2 px-2.5 py-1 text-xs font-semibold whitespace-nowrap">
                        <Hourglass className="size-3 text-au-faint" />
                        {workedHours(r.checkIn, r.checkOut)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="relative inline-block">
                        <select
                          value={r.status}
                          onChange={(e) => updateStatus(r, e.target.value as AttendanceStatus)}
                          className={cn(
                            'cursor-pointer appearance-none rounded-full border py-1.5 pr-7 pl-6 text-xs font-semibold transition focus:ring-2 focus:ring-indigo-500 focus:outline-none',
                            st.bg,
                          )}
                        >
                          {(Object.keys(STATUS_LABEL) as AttendanceStatus[]).map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                        <span className={cn('pointer-events-none absolute top-1/2 left-2.5 size-2 -translate-y-1/2 rounded-full', st.dot)} />
                        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3 -translate-y-1/2 opacity-60" />
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <input
                        key={`note-${r.note}`}
                        type="text"
                        defaultValue={r.note}
                        placeholder="Izoh yozish..."
                        onBlur={(e) => updateNote(r, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className="w-full min-w-[140px] rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-xs text-au-muted transition hover:border-au-line hover:bg-au-card-2 focus:border-indigo-400 focus:bg-au-card focus:text-au-ink focus:outline-none"
                      />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditId(r.id)}
                          title="To‘liq tahrirlash"
                          className="flex size-8 items-center justify-center rounded-lg text-au-muted transition hover:bg-indigo-50 hover:text-indigo-600"
                        >
                          <SquarePen className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(r.id)}
                          title="O‘chirish"
                          className="flex size-8 items-center justify-center rounded-lg text-au-muted transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="px-4 py-16 text-center">
            <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-2xl bg-au-card-2 text-au-faint">
              <FolderOpen className="size-7" />
            </div>
            <h3 className="text-base font-bold">Ma‘lumot topilmadi</h3>
            <p className="mx-auto mt-1 max-w-md text-xs text-au-muted sm:text-sm">
              Ushbu qidiruv yoki filtr bo‘yicha xodimlar mavjud emas. Filtrlarni tozalashingiz mumkin.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-xl border border-au-line px-4 py-2 text-xs font-semibold transition hover:bg-au-card-2"
              >
                Filtrlarni tozalash
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col items-center justify-between gap-2 border-t border-au-line bg-au-card-2/70 px-5 py-3.5 text-xs text-au-muted sm:flex-row">
          <div>
            Jami {rows.length} ta xodimdan {filtered.length} tasi ko‘rsatilmoqda
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" /> Ish boshlanishi: <strong>{WORK_START}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-indigo-500" /> Ish tugashi: <strong>{WORK_END}</strong>
            </span>
          </div>
        </div>
      </div>

      {editing && (
        <EditModal
          key={editing.id}
          row={editing}
          onClose={() => setEditId(null)}
          onSave={(rec) => {
            setEditId(null);
            commit(editing.id, rec, `${editing.name} ma‘lumotlari muvaffaqiyatli yangilandi!`);
          }}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setDeleteId(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-au-line bg-au-card p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <Trash2 className="size-6" />
            </div>
            <h3 className="text-lg font-bold">Yozuvni o‘chirasizmi?</h3>
            <p className="mt-1.5 text-xs text-au-muted sm:text-sm">
              Siz rostdan ham <strong className="text-au-ink">{deleting.name}</strong>ning shu kungi davomat yozuvini o‘chirmoqchimisiz?
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="flex-1 rounded-xl border border-au-line px-4 py-2.5 text-sm font-semibold transition hover:bg-au-card-2"
              >
                Yo‘q, qolsin
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-500/20 transition hover:bg-rose-700"
              >
                Ha, o‘chirilsin
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function StatCard({
  onClick,
  hover,
  label,
  value,
  valueClass,
  icon,
  iconClass,
  foot,
  right,
}: {
  onClick: () => void;
  hover: string;
  label: string;
  value: number;
  valueClass: string;
  icon: React.ReactNode;
  iconClass: string;
  foot: string;
  right: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={cn(CARD, 'group cursor-pointer p-5 text-left transition', hover)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider text-au-faint uppercase">{label}</p>
          <h3 className={cn('mt-1 text-2xl font-bold sm:text-3xl', valueClass)}>{value}</h3>
        </div>
        <div className={cn('flex size-12 items-center justify-center rounded-2xl transition group-hover:scale-110', iconClass)}>{icon}</div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-au-muted">
        <span>{foot}</span>
        {right}
      </div>
    </button>
  );
}

/** Full edit of one day's record. Name, department and position come from
 * the staff profile and are shown read-only — no adding people here. */
function EditModal({ row, onClose, onSave }: { row: AttendanceRow; onClose: () => void; onSave: (r: AttendanceRecord) => void }) {
  const [checkIn, setCheckIn] = useState(row.checkIn);
  const [checkOut, setCheckOut] = useState(row.checkOut);
  const [status, setStatus] = useState<AttendanceStatus>(row.status);
  const [note, setNote] = useState(row.note);

  function onStatus(s: AttendanceStatus) {
    setStatus(s);
    if (s === 'absent') {
      setCheckIn('');
      setCheckOut('');
    } else if (!checkIn) setCheckIn(s === 'late' ? '09:15' : WORK_START);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-au-line bg-au-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-au-line bg-au-card-2 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <UserRoundCog className="size-4" />
            </div>
            <div>
              <h3 className="text-base font-bold">Xodim davomatini tahrirlash</h3>
              <p className="text-xs text-au-muted">Barcha ma‘lumotlarni istalgan payt o‘zgartirish mumkin</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-au-faint transition hover:bg-au-line hover:text-au-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ checkIn, checkOut, status, note: note.trim() });
          }}
          className="flex flex-col gap-4 p-6"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold">Xodimning F.I.Sh</label>
              <input value={row.name} readOnly className={cn(FIELD, 'bg-au-card-2 text-au-muted')} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Bo‘lim</label>
              <input value={DEPT_LABEL[row.dept]} readOnly className={cn(FIELD, 'bg-au-card-2 text-au-muted')} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Lavozimi</label>
              <input value={row.roleLabel} readOnly className={cn(FIELD, 'bg-au-card-2 text-au-muted')} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-semibold">Kelgan vaqti (Kirish)</label>
                <button type="button" onClick={() => setCheckIn(nowHm())} className="text-[11px] font-semibold text-indigo-600 hover:underline">
                  Hozirgi vaqt
                </button>
              </div>
              <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={FIELD} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-semibold">Ketgan vaqti (Chiqish)</label>
                <button type="button" onClick={() => setCheckOut(nowHm())} className="text-[11px] font-semibold text-indigo-600 hover:underline">
                  Hozirgi vaqt
                </button>
              </div>
              <input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={FIELD} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Davomat holati (Status)</label>
              <select value={status} onChange={(e) => onStatus(e.target.value as AttendanceStatus)} className={cn(FIELD, 'font-medium')}>
                {(Object.keys(STATUS_OPTION) as AttendanceStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_OPTION[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Izoh / Sabab (Ixtiyoriy)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Masalan: Tirbandlik sababli, Ta‘tilda..."
                className={FIELD}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-au-line pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-au-line px-4 py-2.5 text-sm font-semibold transition hover:bg-au-card-2"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-700"
            >
              <Check className="size-4" />
              O‘zgarishlarni saqlash
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
