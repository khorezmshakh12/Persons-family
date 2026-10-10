'use client';

import { useEffect, useState, useId } from 'react';

/** Fired by «Hammasini yoyish / yig'ish»: detail = { prefix, open }. */
export const TOGGLE_ALL_EVENT = 'persons:collapsible-all';
import { cn } from '@/lib/utils';

interface CollapsibleCardProps {
  id?: string;
  header: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}

export function CollapsibleCard({
  id,
  header,
  children,
  defaultOpen = false,
  storageKey,
  onOpenChange,
  className,
  headerClassName,
  contentClassName,
}: CollapsibleCardProps) {
  const generatedId = useId();
  const cardId = id || generatedId;
  const contentId = `${cardId}-content`;

  // Server and first client render agree on `defaultOpen`; the remembered
  // choice is applied right after mount (reading localStorage during render
  // caused a hydration mismatch). "Expand / collapse all" arrives as a
  // window event instead of a page reload.
  const [isOpen, setIsOpen] = useState(defaultOpen);
  useEffect(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) setIsOpen(stored === 'true');
      } catch {
        // localStorage not available
      }
    }
    if (!storageKey) return;
    const onAll = (e: Event) => {
      const { prefix, open } = (e as CustomEvent<{ prefix: string; open: boolean }>).detail ?? {};
      if (prefix && storageKey.startsWith(`${prefix}-`)) setIsOpen(!!open);
    };
    window.addEventListener(TOGGLE_ALL_EVENT, onAll);
    return () => window.removeEventListener(TOGGLE_ALL_EVENT, onAll);
  }, [storageKey]);

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    onOpenChange?.(newState);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, String(newState));
      } catch {
        // localStorage not available
      }
    }
  };

  return (
    <div className={cn('overflow-hidden', className)}>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className={cn(
          'w-full text-left transition-colors duration-200',
          headerClassName,
        )}
      >
        {header}
      </button>
      <div
        id={contentId}
        role="region"
        aria-labelledby={cardId}
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows] duration-300 ease-in-out',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          contentClassName,
        )}
      >
        <div className="min-h-0">{children}</div>
      </div>
    </div>
  );
}
