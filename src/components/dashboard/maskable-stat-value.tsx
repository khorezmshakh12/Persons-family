'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Masked by default every time the dashboard loads — nothing is
 * persisted, so a salary figure never shows up on screen until the viewer
 * deliberately clicks the eye to reveal it, and it's masked again on the
 * next visit. Lives inside StatCard's own `<Link>`, so the button must
 * stop the click from bubbling into a navigation. */
export function MaskableStatValue({ value }: { value: string }) {
  const t = useTranslations('dashboard.stats');
  const [revealed, setRevealed] = useState(false);

  return (
    <span className="inline-flex items-center gap-2">
      <span>{revealed ? value : '••••••••'}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRevealed((v) => !v);
        }}
        aria-label={revealed ? t('hideAmount') : t('showAmount')}
        className="tap-scale text-white/50 hover:text-white/90"
      >
        {revealed ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </span>
  );
}
