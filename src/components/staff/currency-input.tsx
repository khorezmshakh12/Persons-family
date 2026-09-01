'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatUZS } from '@/lib/format-currency';

/** Whole-som only. Any fractional part (a `numeric` bonus seeded as
 * "5000.50") is rounded off rather than having its dot stripped, which used
 * to turn 5000.5 into a displayed 50 005. */
function toInteger(value: string | number): number {
  const n = Math.round(Number(String(value).replace(/[^\d.]/g, '')));
  return Number.isFinite(n) ? n : 0;
}

function toDisplay(raw: string | number) {
  const n = toInteger(raw);
  return n ? formatUZS(n) : '';
}

export function CurrencyInput({
  name,
  id,
  defaultValue,
}: {
  name: string;
  id: string;
  defaultValue: number;
}) {
  const initial = toInteger(defaultValue);
  const [display, setDisplay] = useState(() => (initial ? formatUZS(initial) : ''));
  const [raw, setRaw] = useState(() => (initial ? String(initial) : ''));

  return (
    <>
      <Input
        id={id}
        inputMode="numeric"
        value={display}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, '');
          setRaw(digits);
          setDisplay(toDisplay(digits));
        }}
      />
      <input type="hidden" name={name} value={raw} />
    </>
  );
}
