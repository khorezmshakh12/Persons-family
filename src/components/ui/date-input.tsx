'use client';

import { useId, useRef, useState, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const FIELD =
  'h-9 rounded-lg border border-white/25 bg-white/5 px-2 text-center text-sm text-white outline-none transition-colors focus-visible:border-white/70 placeholder:text-white/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function pad(value: string, length: number) {
  return value.padStart(length, '0');
}

/** Numeric day/month/year fields in that fixed order (never the visitor's
 * OS/browser locale order, unlike a native `<input type="date">`), styled
 * to actually be visible against this app's dark glass UI (unlike the
 * native calendar icon/popup, which `[color-scheme:dark]` alone can't fully
 * fix). Feeds a hidden `<input type="hidden" name={name}>` with the real
 * ISO value so server actions need no changes — `YYYY-MM-DD` normally,
 * `YYYY-MM` when `showDay` is false (matches `<input type="month">`'s old
 * submission format for the income-roadmap step schema). Deliberately has
 * no `required` on the hidden field: a browser can't show a validation
 * bubble on a hidden input, so an incomplete date instead reaches the
 * server as a non-matching string and surfaces through the same
 * zod-error-to-toast path every one of these forms already has. */
export function DateInput({
  id,
  name,
  defaultValue,
  showDay = true,
}: {
  id?: string;
  name: string;
  defaultValue?: string;
  showDay?: boolean;
}) {
  const t = useTranslations('common.dateInput');
  const autoId = useId();
  const baseId = id ?? autoId;

  const [y0, m0, d0] = (defaultValue ?? '').split('-');
  const [day, setDay] = useState(d0 ?? '');
  const [month, setMonth] = useState(m0 ?? '');
  const [year, setYear] = useState(y0 ?? '');

  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  const isoValue =
    year.length === 4 && month.length > 0 && (!showDay || day.length > 0)
      ? showDay
        ? `${year}-${pad(month, 2)}-${pad(day, 2)}`
        : `${year}-${pad(month, 2)}`
      : '';

  function handleDigits(raw: string, max: number, setter: (v: string) => void, next?: RefObject<HTMLInputElement | null>) {
    const digits = raw.replace(/\D/g, '').slice(0, max);
    setter(digits);
    if (digits.length === max) next?.current?.focus();
  }

  return (
    <div className="flex items-center gap-1.5">
      {showDay && (
        <input
          ref={dayRef}
          id={baseId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t('day')}
          aria-label={t('day')}
          value={day}
          maxLength={2}
          onChange={(e) => handleDigits(e.target.value, 2, setDay, monthRef)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && day === '') monthRef.current?.focus();
          }}
          className={cn(FIELD, 'w-12')}
        />
      )}
      <input
        ref={monthRef}
        id={showDay ? undefined : baseId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t('month')}
        aria-label={t('month')}
        value={month}
        maxLength={2}
        onChange={(e) => handleDigits(e.target.value, 2, setMonth, yearRef)}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && month === '' && showDay) dayRef.current?.focus();
        }}
        className={cn(FIELD, 'w-12')}
      />
      <span className="text-white/40">/</span>
      <input
        ref={yearRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t('year')}
        aria-label={t('year')}
        value={year}
        maxLength={4}
        onChange={(e) => handleDigits(e.target.value, 4, setYear)}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && year === '') monthRef.current?.focus();
        }}
        className={cn(FIELD, 'w-16')}
      />
      <input type="hidden" name={name} value={isoValue} />
    </div>
  );
}
