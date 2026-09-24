'use client';

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Command } from 'cmdk';
import { useTranslations } from 'next-intl';
import { Search, Users, Layers, AlertCircle, CornerDownLeft, Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { searchCommandPaletteAction, type CommandSearchResult } from '@/lib/actions/command-search';
import { cn } from '@/lib/utils';

const EMPTY: CommandSearchResult = { staff: [], groups: [], issues: [] };
/** Same floor the server action applies — below it the action returns
 * nothing, so there is no point sending the request. */
const MIN_QUERY = 2;

/** Window event other UI (the topbar search field) dispatches to open the
 * palette without owning its state. */
export const OPEN_COMMAND_PALETTE_EVENT = 'persons:open-command-palette';

type Row = { value: string; label: string; sub?: string; href: string; group: 'staff' | 'groups' | 'issues' };

/** Flatten the grouped server result into rows, in display order. Values are
 * cmdk's selection keys — ids only, so they are unique and stable. */
function toRows(results: CommandSearchResult, roleLabel: (role: string) => string | undefined): Row[] {
  return [
    ...results.staff.map<Row>((s) => ({
      value: `staff-${s.id}`.toLowerCase(),
      label: s.name,
      sub: roleLabel(s.role),
      href: '/staff',
      group: 'staff',
    })),
    ...results.groups.map<Row>((g) => ({
      value: `group-${g.id}`.toLowerCase(),
      label: g.name,
      href: `/lesson-plans/${g.id}`,
      group: 'groups',
    })),
    ...results.issues.map<Row>((i) => ({
      value: `issue-${i.id}`.toLowerCase(),
      label: i.title,
      href: '/issues',
      group: 'issues',
    })),
  ];
}

/** Wrap the first case-insensitive occurrence of `query` in a <mark>. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[4px] bg-au-accent-soft px-px font-semibold text-au-accent-text">
        {text.slice(at, at + q.length)}
      </mark>
      {text.slice(at + q.length)}
    </>
  );
}

const GROUP_ICON: Record<Row['group'], ReactNode> = {
  staff: <Users className="size-4" />,
  groups: <Layers className="size-4" />,
  issues: <AlertCircle className="size-4" />,
};

const GROUP_ICON_TINT: Record<Row['group'], string> = {
  staff: 'bg-au-card-2 text-au-ink',
  groups: 'bg-au-info-soft text-au-info',
  issues: 'bg-au-accent-soft text-au-accent-text',
};

export function CommandPalette() {
  const t = useTranslations('commandPalette');
  const tStaff = useTranslations('staff');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommandSearchResult>(EMPTY);
  const [selected, setSelected] = useState('');
  const [isPending, startTransition] = useTransition();
  const requestSeq = useRef(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      // Ctrl+/ is a fallback for Ctrl+K, which some Chromium builds reserve
      // as an address-bar shortcut and intercept before page JS ever sees it.
      if ((e.metaKey || e.ctrlKey) && (key === 'k' || key === '/')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    function onOpenRequest() {
      setOpen(true);
    }
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
    };
  }, []);

  const roleLabel = (role: string) => (tStaff.has(`roles.${role}`) ? tStaff(`roles.${role}`) : undefined);
  const tooShort = query.trim().length < MIN_QUERY;
  const rows = tooShort ? [] : toRows(results, roleLabel);

  // Debounced server search — every keystroke would otherwise fire a round
  // trip per character. A sequence number drops any response that arrives
  // after a newer query was sent, so results never flash back to a stale set.
  useEffect(() => {
    if (!open) return;
    const seq = ++requestSeq.current;
    // Too short: nothing to fetch (the action would return EMPTY anyway);
    // `rows` below already renders nothing for it. Bumping the sequence
    // above still discards any in-flight response for the longer query.
    if (query.trim().length < MIN_QUERY) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        const next = await searchCommandPaletteAction(query);
        if (seq !== requestSeq.current) return;
        setResults(next);
        // A fresh result set always starts on its first row.
        const first = toRows(next, () => undefined)[0];
        setSelected(first?.value ?? '');
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(EMPTY);
      setSelected('');
    }
  }, [open]);

  // Sliding highlight: one absolutely-positioned pill that glides (transform
  // only) to whichever row is selected — by arrow key or by pointer — instead
  // of each row toggling its own background.
  const listInnerRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ y: number; h: number; instant: boolean } | null>(null);
  useLayoutEffect(() => {
    const root = listInnerRef.current;
    if (!root || !selected) {
      setPill(null);
      return;
    }
    const el = root.querySelector<HTMLElement>(`[cmdk-item][data-value="${CSS.escape(selected)}"]`);
    if (!el) {
      setPill(null);
      return;
    }
    // The first placement of a result set jumps straight there; only moves
    // between rows animate.
    setPill((prev) => ({ y: el.offsetTop, h: el.offsetHeight, instant: prev === null }));
  }, [selected, results]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const groups = (['staff', 'groups', 'issues'] as const)
    .map((g) => ({ key: g, rows: rows.filter((r) => r.group === g) }))
    .filter((g) => g.rows.length > 0);

  let emptyState: ReactNode = null;
  if (rows.length === 0) {
    if (tooShort) {
      emptyState = t('hint');
    } else if (isPending) {
      emptyState = (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          {t('searching')}
        </span>
      );
    } else {
      emptyState = t('noResultsFor', { query: query.trim() });
    }
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label={t('label')}
      shouldFilter={false}
      loop
      value={selected}
      onValueChange={setSelected}
      className="fixed top-[15vh] left-1/2 z-100 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 animate-in zoom-in-95 duration-150 motion-reduce:animate-none"
      overlayClassName="fixed inset-0 z-100 bg-black/50 animate-in fade-in-0"
      contentClassName="overflow-hidden rounded-au-card border border-au-line bg-au-card text-au-ink shadow-au-card"
    >
      <div className="flex items-center gap-3 border-b border-au-line px-4 py-3">
        {isPending ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-au-muted motion-reduce:animate-none" />
        ) : (
          <Search className="size-4 shrink-0 text-au-muted" />
        )}
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={t('placeholder')}
          className="w-full bg-transparent text-[15px] font-medium text-au-ink caret-au-accent placeholder:font-normal placeholder:text-au-muted focus:outline-none"
        />
      </div>

      <Command.List className="max-h-[min(22rem,60vh)] scroll-py-2 overflow-y-auto overscroll-contain p-2">
        <div ref={listInnerRef} className="relative">
          {pill && rows.length > 0 && (
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 rounded-lg border-l-[3px] border-au-accent bg-au-accent-soft',
                pill.instant
                  ? 'transition-none'
                  : 'transition-[transform,height] duration-200 ease-[var(--ease-snappy)] motion-reduce:transition-none',
              )}
              style={{ transform: `translateY(${pill.y}px)`, height: pill.h }}
            />
          )}

          {emptyState && (
            <div className="px-3 py-8 text-center text-sm text-au-muted" role="status">
              {emptyState}
            </div>
          )}

          {groups.map((g) => (
            <Command.Group
              key={g.key}
              heading={
                <span className="flex items-center justify-between">
                  <span>{t(`groups.${g.key}`)}</span>
                  <span className="rounded-full bg-au-card-2 px-1.5 py-px text-[10px] font-bold text-au-muted tabular-nums">
                    {g.rows.length}
                  </span>
                </span>
              }
              className="pb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-au-muted [&_[cmdk-group-heading]]:uppercase"
            >
              {g.rows.map((r) => (
                <Command.Item
                  key={r.value}
                  value={r.value}
                  onSelect={() => go(r.href)}
                  className="relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-au-ink"
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-lg',
                      GROUP_ICON_TINT[r.group],
                    )}
                  >
                    {GROUP_ICON[r.group]}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    <Highlight text={r.label} query={query} />
                  </span>
                  {r.sub && <span className="shrink-0 truncate text-xs text-au-muted">{r.sub}</span>}
                  {r.value === selected && (
                    <CornerDownLeft className="size-3.5 shrink-0 text-au-accent-text" aria-hidden />
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </div>
      </Command.List>

      <div className="flex items-center gap-4 border-t border-au-line bg-au-card-2 px-4 py-2 text-[11px] text-au-muted">
        <span className="inline-flex items-center gap-1.5">
          <kbd className="rounded-[4px] border border-au-line bg-au-card px-1 font-semibold">↑</kbd>
          <kbd className="rounded-[4px] border border-au-line bg-au-card px-1 font-semibold">↓</kbd>
          {t('navigate')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="rounded-[4px] border border-au-line bg-au-card px-1 font-semibold">↵</kbd>
          {t('open')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="rounded-[4px] border border-au-line bg-au-card px-1 font-semibold">Esc</kbd>
          {t('close')}
        </span>
      </div>
    </Command.Dialog>
  );
}
