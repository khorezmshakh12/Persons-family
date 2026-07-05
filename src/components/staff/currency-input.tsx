'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatUZS } from '@/lib/format-currency';

function toDisplay(raw: string) {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return formatUZS(Number(digits));
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
  const [display, setDisplay] = useState(() => toDisplay(String(defaultValue)));
  const [raw, setRaw] = useState(() => String(defaultValue || ''));

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
