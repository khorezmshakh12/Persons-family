'use client';

import { useEffect, useState, useTransition } from 'react';
import { Command } from 'cmdk';
import { useTranslations } from 'next-intl';
import { Search, Users, Layers, AlertCircle } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { searchCommandPaletteAction, type CommandSearchResult } from '@/lib/actions/command-search';

const EMPTY: CommandSearchResult = { staff: [], groups: [], issues: [] };

export function CommandPalette() {
  const t = useTranslations('commandPalette');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommandSearchResult>(EMPTY);
  const [isPending, startTransition] = useTransition();

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
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Debounced server search — every keystroke would otherwise fire a
  // round trip per character.
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        setResults(await searchCommandPaletteAction(query));
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(EMPTY);
    }
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const hasResults = results.staff.length + results.groups.length + results.issues.length > 0;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label={t('label')}
      className="fixed top-[15vh] left-1/2 z-100 w-full max-w-lg -translate-x-1/2 animate-in fade-in-0 zoom-in-95 duration-150"
      overlayClassName="fixed inset-0 z-100 bg-black/50 backdrop-blur-sm animate-in fade-in-0"
      contentClassName="overflow-hidden rounded-2xl border border-white/20 bg-slate-900/80 text-white shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <Search className="size-4 shrink-0 text-white/50" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={t('placeholder')}
          className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
        />
      </div>
      <Command.List className="max-h-80 overflow-y-auto p-2">
        {!isPending && query.trim().length >= 2 && !hasResults && (
          <Command.Empty className="px-3 py-6 text-center text-sm text-white/50">{t('noResults')}</Command.Empty>
        )}

        {results.staff.length > 0 && (
          <Command.Group heading={t('groups.staff')} className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-white/40 uppercase [&_[cmdk-group-heading]]:px-2">
            {results.staff.map((s) => (
              <Command.Item
                key={s.id}
                value={`staff-${s.id}-${s.name}`}
                onSelect={() => go('/staff')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/90 data-[selected=true]:bg-white/10"
              >
                <Users className="size-4 shrink-0 text-teal-300" />
                {s.name}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {results.groups.length > 0 && (
          <Command.Group heading={t('groups.groups')} className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-white/40 uppercase [&_[cmdk-group-heading]]:px-2">
            {results.groups.map((g) => (
              <Command.Item
                key={g.id}
                value={`group-${g.id}-${g.name}`}
                onSelect={() => go(`/lesson-plans/${g.id}`)}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/90 data-[selected=true]:bg-white/10"
              >
                <Layers className="size-4 shrink-0 text-blue-300" />
                {g.name}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {results.issues.length > 0 && (
          <Command.Group heading={t('groups.issues')} className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-white/40 uppercase [&_[cmdk-group-heading]]:px-2">
            {results.issues.map((i) => (
              <Command.Item
                key={i.id}
                value={`issue-${i.id}-${i.title}`}
                onSelect={() => go('/issues')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/90 data-[selected=true]:bg-white/10"
              >
                <AlertCircle className="size-4 shrink-0 text-orange-300" />
                {i.title}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
