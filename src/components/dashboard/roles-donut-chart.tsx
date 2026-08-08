import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';

const ROLE_ORDER = [
  'ceo',
  'admin_manager',
  'teacher',
  'assistant',
  'smm_mobilgrof',
  'it_developer',
] as const;
const ROLE_COLOR: Record<(typeof ROLE_ORDER)[number], string> = {
  ceo: '#a855f7',
  admin_manager: '#3b82f6',
  teacher: '#22c55e',
  assistant: '#f97316',
  smm_mobilgrof: '#ec4899',
  it_developer: '#06b6d4',
};

export async function RolesDonutChart({
  href,
  large,
  delayMs = 0,
}: {
  href?: string;
  large?: boolean;
  delayMs?: number;
} = {}) {
  const t = await getTranslations('dashboard.rolesChart');
  const tStaff = await getTranslations('staff');
  const supabase = await createClient();

  const SIZE = large ? 220 : 160;
  const STROKE = large ? 28 : 22;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const { data } = await supabase.from('profiles').select('role').eq('is_active', true);
  const rows = data ?? [];
  const total = rows.length;
  const counts = ROLE_ORDER.map((role) => rows.filter((r) => r.role === role).length);

  let cumulative = 0;
  const segments = ROLE_ORDER.map((role, i) => {
    const count = counts[i];
    const fraction = total > 0 ? count / total : 0;
    const dash = fraction * CIRCUMFERENCE;
    const offset = -cumulative * CIRCUMFERENCE;
    cumulative += fraction;
    return { role, count, color: ROLE_COLOR[role], dash, offset };
  }).filter((s) => s.count > 0);

  const content = (
    <>
      <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('title')}</h2>
      <div className="flex justify-center">
        <div className="relative" style={{ width: SIZE, height: SIZE }}>
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            style={{ animationDelay: `${delayMs + 100}ms` }}
            className="animate-pop-in -rotate-90"
          >
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={STROKE}
            />
            {segments.map((s) => (
              <circle
                key={s.role}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                strokeDasharray={`${s.dash} ${CIRCUMFERENCE - s.dash}`}
                strokeDashoffset={s.offset}
              />
            ))}
          </svg>
          <div
            style={{ animationDelay: `${delayMs + 350}ms` }}
            className="animate-pop-in absolute inset-0 flex flex-col items-center justify-center"
          >
            <span className="text-2xl font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{total}</span>
            <span className="text-xs text-white/60">{t('totalLabel')}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {ROLE_ORDER.map((role, i) => (
          <div
            key={role}
            style={{ animationDelay: `${delayMs + 450 + i * 40}ms` }}
            className="animate-fade-in-up flex items-center gap-2 text-xs text-white/80"
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: ROLE_COLOR[role] }} />
            <span className="truncate">
              {tStaff(`roles.${role}`)} · {counts[i]}
            </span>
          </div>
        ))}
      </div>
    </>
  );

  const cardClassName = cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-4 p-6', href && GLASS_INTERACTIVE);
  const cardStyle = { animationDelay: `${delayMs}ms` };

  return href ? (
    <Link href={href} style={cardStyle} className={cardClassName}>
      {content}
    </Link>
  ) : (
    <div style={cardStyle} className={cardClassName}>
      {content}
    </div>
  );
}
