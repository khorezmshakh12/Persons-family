'use client';

import { useEffect, useState } from 'react';

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tashkent',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function TashkentClock() {
  // Rendering the real time on the server would mismatch the client's
  // first paint (different second, possibly different machine timezone),
  // so this starts null and fills in after mount instead of risking a
  // hydration warning.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  return (
    <span suppressHydrationWarning className="inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-white/80">
      <span className="size-1.5 rounded-full bg-teal-400 animate-pulse shadow-[0_0_6px_#2dd4bf]" />
      <span className="text-white/60 font-sans text-[11px]">Toshkent:</span>
      <span className="font-semibold text-white/90 tabular-nums">{formatter.format(now)}</span>
    </span>
  );
}
