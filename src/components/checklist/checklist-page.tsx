'use client';

import { useState, useTransition, type JSX } from 'react';
import { Check, Plus, Pencil, Trash2, X, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { usePathname, useRouter } from '@/i18n/navigation';
import { SURFACE_CARD, SURFACE_INSET, INPUT, BTN_PRIMARY } from '@/lib/glass';
import { cn } from '@/lib/utils';
import {
  toggleTemplateTickAction,
  addTemplateAction,
  editTemplateAction,
  deleteTemplateAction,
} from '@/lib/actions/checklist-templates';

export type Cadence = 'daily' | 'weekly' | 'monthly';
export type ChecklistRow = { id: string; cadence: Cadence; title: string; detail: string; sort: number; done: boolean };
export type RoleOption = { value: string; label: string };

const TABS: { key: Cadence; label: string }[] = [
  { key: 'daily', label: 'Kunlik' },
  { key: 'weekly', label: 'Haftalik' },
  { key: 'monthly', label: 'Oylik' },
];

export function ChecklistPage(props: {
  data: { daily: ChecklistRow[]; weekly: ChecklistRow[]; monthly: ChecklistRow[] };
  role: string;
  roleLabel: string;
  canManage: boolean;
  managing: boolean;
  roles: RoleOption[];
}): JSX.Element {
  const { data, role, roleLabel, canManage, managing, roles } = props;
  const router = useRouter();
  const pathname = usePathname();

  const [active, setActive] = useState<Cadence>('daily');
  // Optimistic tick overrides keyed by template id. Ticks are not refreshed,
  // so they survive a router.refresh gracefully (fall back to the server row).
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [, start] = useTransition();

  const rows = data[active];
  const isDone = (r: ChecklistRow) => overrides[r.id] ?? r.done;

  const counts = (c: Cadence) => {
    const list = data[c];
    return { done: list.filter((r) => overrides[r.id] ?? r.done).length, total: list.length };
  };
  const { done, total } = counts(active);
  const pct = total ? Math.round((done / total) * 100) : 0;

  const toggle = (r: ChecklistRow) => {
    if (managing) return;
    const next = !isDone(r);
    setOverrides((prev) => ({ ...prev, [r.id]: next }));
    start(async () => {
      const res = await toggleTemplateTickAction(r.id, r.cadence, next);
      if ('error' in res) {
        setOverrides((prev) => ({ ...prev, [r.id]: !next }));
        toast.error(res.error);
      }
    });
  };

  function goRole(value: string) {
    router.push(`${pathname}?role=${value}`);
  }
  function toggleManage() {
    if (managing) router.push(`${pathname}?role=${role}`);
    else router.push(`${pathname}?role=${role}&manage=1`);
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Title row + manage picker */}
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="flex-1 text-base font-bold text-au-ink">{roleLabel}</h2>
        {canManage && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={role}
                onChange={(e) => goRole(e.target.value)}
                aria-label="Rolni tanlang"
                className={cn(INPUT, 'h-9 w-44 appearance-none pr-9')}
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-au-muted" />
            </div>
            <button
              type="button"
              onClick={toggleManage}
              aria-pressed={managing}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-au-ctl border px-3 text-sm font-semibold transition-colors',
                managing
                  ? 'border-au-accent bg-au-accent-soft text-au-accent-text'
                  : 'border-au-line bg-au-card text-au-ink hover:bg-au-card-2',
              )}
            >
              <Pencil className="size-3.5" />
              {managing ? 'Ko‘rish' : 'Boshqarish'}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto">
        {TABS.map((tab) => {
          const c = counts(tab.key);
          const on = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              aria-pressed={on}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-au-ctl border px-3.5 py-2 text-sm font-semibold transition-colors',
                on
                  ? 'border-au-line bg-au-card text-au-ink shadow-sm ring-1 ring-au-line'
                  : 'border-transparent text-au-muted hover:bg-au-card-2 hover:text-au-ink',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-xs tabular-nums',
                  on ? 'bg-au-accent-soft text-au-accent-text' : 'bg-au-card-2 text-au-muted',
                )}
              >
                {c.done}/{c.total}
              </span>
            </button>
          );
        })}
      </div>

      {/* Progress */}
      <div className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-4')}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-au-ink">Bajarildi</span>
          <span className="text-sm font-semibold tabular-nums text-au-muted">
            {done}/{total} · {pct}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-au-line">
          <div className="h-full rounded-full bg-au-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Items */}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <ChecklistItemRow
            key={r.id}
            row={r}
            done={isDone(r)}
            managing={managing && canManage}
            onToggle={() => toggle(r)}
            onChanged={() => router.refresh()}
          />
        ))}
        {rows.length === 0 && (
          <li className={cn(SURFACE_INSET, 'px-4 py-3 text-sm text-au-muted')}>
            Hali band yo‘q.{managing && canManage ? ' Quyidan yangi band qo‘shing.' : ''}
          </li>
        )}
      </ul>

      {/* Add form (manage mode) */}
      {managing && canManage && (
        <AddTemplateForm role={role} cadence={active} onAdded={() => router.refresh()} />
      )}
    </div>
  );
}

function ChecklistItemRow({
  row,
  done,
  managing,
  onToggle,
  onChanged,
}: {
  row: ChecklistRow;
  done: boolean;
  managing: boolean;
  onToggle: () => void;
  onChanged: () => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(row.title);
  const [detail, setDetail] = useState(row.detail);
  const [, start] = useTransition();

  const saveEdit = () => {
    const t = title.trim();
    if (!t) return;
    start(async () => {
      const res = await editTemplateAction({ id: row.id, title: t, detail: detail.trim() || undefined });
      if ('error' in res) {
        toast.error(res.error);
        return;
      }
      setEditing(false);
      onChanged();
    });
  };

  const del = () => {
    if (!window.confirm(`“${row.title}” bandi o‘chirilsinmi?`)) return;
    start(async () => {
      const res = await deleteTemplateAction(row.id);
      if ('error' in res) {
        toast.error(res.error);
        return;
      }
      onChanged();
    });
  };

  if (editing) {
    return (
      <li className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-4')}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          placeholder="Band nomi"
          className={cn(INPUT, 'h-10')}
        />
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Tavsif (ixtiyoriy)"
          className={cn(INPUT, 'h-auto resize-y py-2')}
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={saveEdit} disabled={!title.trim()} className={cn(BTN_PRIMARY, 'h-9')}>
            Saqlash
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setTitle(row.title);
              setDetail(row.detail);
            }}
            className="inline-flex h-9 items-center rounded-au-ctl border border-au-line bg-au-card px-3 text-sm font-semibold text-au-ink transition-colors hover:bg-au-card-2"
          >
            Bekor qilish
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className={cn(SURFACE_CARD, 'group flex items-start gap-3 p-4')}>
      <button
        type="button"
        onClick={onToggle}
        disabled={managing}
        aria-pressed={done}
        aria-label={done ? 'Belgini olib tashlash' : 'Bajarildi deb belgilash'}
        className={cn(
          'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border transition-colors',
          done ? 'border-au-accent bg-au-accent text-white' : 'border-au-line bg-au-card hover:border-au-accent',
          managing && 'cursor-not-allowed opacity-50',
        )}
      >
        {done && <Check className="size-3.5" strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-bold', done && !managing ? 'text-au-faint line-through' : 'text-au-ink')}>
          {row.title}
        </p>
        {row.detail && <p className="mt-0.5 text-xs text-au-muted">{row.detail}</p>}
      </div>

      {managing && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Tahrirlash"
            className="rounded-md p-1.5 text-au-muted transition-colors hover:bg-au-card-2 hover:text-au-ink"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={del}
            aria-label="O‘chirish"
            className="rounded-md p-1.5 text-au-muted transition-colors hover:bg-au-bad-soft hover:text-au-bad"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </li>
  );
}

function AddTemplateForm({
  role,
  cadence,
  onAdded,
}: {
  role: string;
  cadence: Cadence;
  onAdded: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [, start] = useTransition();

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    start(async () => {
      const res = await addTemplateAction({ role, cadence, title: t, detail: detail.trim() || undefined });
      if ('error' in res) {
        toast.error(res.error);
        return;
      }
      setTitle('');
      setDetail('');
      setOpen(false);
      onAdded();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          SURFACE_INSET,
          'flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-au-muted transition-colors hover:bg-au-card hover:text-au-ink',
        )}
      >
        <Plus className="size-4" />
        Band qo‘shish
      </button>
    );
  }

  return (
    <div className={cn(SURFACE_CARD, 'flex flex-col gap-2 p-4')}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        maxLength={160}
        placeholder="Yangi band…"
        autoFocus
        className={cn(INPUT, 'h-10')}
      />
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        rows={2}
        maxLength={400}
        placeholder="Tavsif (ixtiyoriy)"
        className={cn(INPUT, 'h-auto resize-y py-2')}
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={submit} disabled={!title.trim()} className={cn(BTN_PRIMARY, 'h-9')}>
          <Plus className="size-4" />
          Qo‘shish
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTitle('');
            setDetail('');
          }}
          aria-label="Bekor qilish"
          className="inline-flex h-9 items-center rounded-au-ctl border border-au-line bg-au-card px-3 text-sm font-semibold text-au-ink transition-colors hover:bg-au-card-2"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
