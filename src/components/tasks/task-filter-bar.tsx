'use client';

import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Task } from './task-card';
import type { Assignee } from './assign-task-dialog';

export type TaskFilters = {
  /** Free text, matched against title + description. */
  search: string;
  /** An assignee id, or 'all'. Admin-only — the sentinel stays 'all' for
   * everyone else, so applyTaskFilters needs no separate non-admin path. */
  assignee: string;
  overdueOnly: boolean;
};

export const EMPTY_TASK_FILTERS: TaskFilters = {
  search: '',
  assignee: 'all',
  overdueOnly: false,
};

export function hasActiveTaskFilters(filters: TaskFilters): boolean {
  return filters.search.trim() !== '' || filters.assignee !== 'all' || filters.overdueOnly;
}

/**
 * Pure view-level narrowing, applied to the board's already-fetched list —
 * deliberately not a re-fetch. The board's realtime refresh
 * (board_signals/tasks) replaces `tasks` wholesale and the filters simply
 * re-apply to the new list, so filtering can never go stale or race a
 * refresh.
 */
export function applyTaskFilters(tasks: Task[], filters: TaskFilters): Task[] {
  const needle = filters.search.trim().toLowerCase();

  return tasks.filter((task) => {
    if (filters.overdueOnly && !task.is_overdue) return false;
    if (filters.assignee !== 'all' && task.assigned_to !== filters.assignee) return false;
    if (!needle) return true;
    return (
      task.title.toLowerCase().includes(needle) ||
      (task.description ?? '').toLowerCase().includes(needle)
    );
  });
}

export function TaskFilterBar({
  filters,
  onChange,
  isAdmin,
  assignees,
}: {
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
  isAdmin: boolean;
  assignees: Assignee[];
}) {
  const t = useTranslations('tasks');
  const active = hasActiveTaskFilters(filters);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-3 text-white shadow-lg backdrop-blur-md transform-gpu will-change-transform">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-white/50" />
        <Input
          type="search"
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder={t('filters.searchPlaceholder')}
          aria-label={t('filters.searchPlaceholder')}
          className="h-9 w-full border-white/30 bg-white/10 pl-8 text-white placeholder:text-white/50"
        />
      </div>

      {isAdmin && (
        <Select
          value={filters.assignee}
          onValueChange={(value) => value && onChange({ ...filters, assignee: String(value) })}
        >
          <SelectTrigger className="h-9 w-52 border-white/30 bg-white/10 text-white hover:bg-white/20">
            <SelectValue>
              {(value: string) => {
                if (value === 'all') return t('filters.allAssignees');
                const person = assignees.find((a) => a.id === value);
                return person ? `${person.first_name} ${person.last_name}` : value;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allAssignees')}</SelectItem>
            {assignees.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.first_name} {a.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* A plain aria-pressed toggle rather than the shared Switch: this is a
       * filter chip, not a form field, and it has to read against the glass
       * panel rather than the light form surface Switch is styled for. */}
      <button
        type="button"
        aria-pressed={filters.overdueOnly}
        onClick={() => onChange({ ...filters, overdueOnly: !filters.overdueOnly })}
        className={cn(
          'h-9 rounded-lg border px-3 text-sm font-medium transition-colors',
          filters.overdueOnly
            ? 'border-red-400/60 bg-red-500/25 text-red-100'
            : 'border-white/30 bg-white/10 text-white/80 hover:bg-white/20',
        )}
      >
        {t('filters.overdueOnly')}
      </button>

      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_TASK_FILTERS)}
          className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" />
          {t('filters.clear')}
        </button>
      )}
    </div>
  );
}
