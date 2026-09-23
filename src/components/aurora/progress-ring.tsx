/**
 * Aurora ring: warm track, apricot arc with round caps, drawn from 12
 * o'clock. Pure SVG — colours come from the tokens only.
 */
export function ProgressRing({
  value,
  size = 178,
  stroke = 9,
  children,
}: {
  /** 0–100 */
  value: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const r = 50 - stroke / 2 - 0.5;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--au-ring-track)" strokeWidth={stroke} />
        {pct > 0 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--au-accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
            className="transition-[stroke-dasharray] duration-500 ease-out motion-reduce:transition-none"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
