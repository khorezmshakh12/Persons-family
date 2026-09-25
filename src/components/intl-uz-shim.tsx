'use client';

import { installUzIntl } from '@/lib/intl-uz';

// Runs at module evaluation — before React renders anything on the client —
// so every uz date/number/relative-time formatted in the browser matches the
// server's. No-op when the browser already has Uzbek ICU data.
installUzIntl();

export function IntlUzShim() {
  return null;
}
