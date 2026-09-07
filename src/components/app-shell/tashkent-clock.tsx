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

  return <span suppressHydrationWarning>{now ? `Tashkent vaqti: ${formatter.format(now)}` : null}</span>;
}
