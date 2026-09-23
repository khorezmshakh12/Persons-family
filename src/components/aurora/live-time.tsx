'use client';

import { useEffect, useState } from 'react';

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' });

/** HH:mm in Asia/Tashkent, ticking every 20s. Server renders the initial
 * value, so there is no empty flash before hydration. */
export function LiveTashkentTime({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const tick = () => setValue(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{value}</span>;
}
