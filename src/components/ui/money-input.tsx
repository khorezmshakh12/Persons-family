'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/** Same look as components/ui/input.tsx — used when no className is given,
 * so a MoneyInput dropped into a form matches the fields around it. */
const INPUT_CLASS =
  'h-8 w-full min-w-0 rounded-lg border border-au-line bg-au-card px-2.5 py-1 text-base text-au-ink transition-colors outline-none placeholder:text-au-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:text-sm';

/** 1234567 → "1,234,567" (owner, 2026-10-05: every amount is written with
 * comma thousands separators while typing). */
export function groupDigits(n: number | string): string {
  const s = String(n).replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "1,234,567" → 1234567; empty → null. */
export function parseGrouped(s: string): number | null {
  const d = s.replace(/[^\d]/g, '');
  return d ? Number(d) : null;
}

/**
 * Whole-number amount field: shows "1,000,000" as you type and stays EMPTY
 * when cleared (no stuck 0 — owner, 2026-10-05). `value` null/0 renders as
 * an empty box with the placeholder. Fires `onValue` with a number, or null
 * when emptied. `name` adds a hidden input with the raw digits for forms.
 */
export function MoneyInput({
  value,
  onValue,
  name,
  className,
  placeholder = '0',
  allowZero = false,
  ...rest
}: {
  value: number | null | undefined;
  onValue?: (v: number | null) => void;
  name?: string;
  className?: string;
  placeholder?: string;
  /** Show a literal 0 instead of an empty box. */
  allowZero?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'name'>) {
  const shown = value === null || value === undefined || (!allowZero && value === 0) ? '' : groupDigits(Math.round(Math.abs(value)));
  const [text, setText] = useState(shown);
  const [last, setLast] = useState(value);
  // Follow outside changes (reset after save, month switch) without
  // fighting the user's own typing.
  if (last !== value) {
    setLast(value);
    if ((parseGrouped(text) ?? null) !== (value || null)) setText(shown);
  }
  return (
    <>
      <input
        {...rest}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        className={cn('tabular-nums', className ?? INPUT_CLASS)}
        value={text}
        onChange={(e) => {
          const g = groupDigits(e.target.value);
          setText(g);
          const v = parseGrouped(g);
          setLast(v);
          onValue?.(v);
        }}
      />
      {name && <input type="hidden" name={name} value={parseGrouped(text) ?? ''} />}
    </>
  );
}
