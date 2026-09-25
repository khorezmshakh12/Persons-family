'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { avatarGradientClass, initialsOf } from '@/lib/avatar-palette';
import { cn } from '@/lib/utils';
import {
  PRIORITIES,
  STATUSES,
  WORKSTREAMS,
  fmtDay,
  isLate,
  type Priority,
  type StrategyPerson,
  type StrategyTask,
  type TaskStatus,
  type Workstream,
} from '@/lib/strategy';

export function PersonAvatar({ person, size = 26 }: { person: StrategyPerson | undefined; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: size < 26 ? 9 : 11 };
  if (!person) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full border border-dashed border-au-line bg-au-card-2 font-bold text-au-faint"
        style={style}
        title="Mas'ul tayinlanmagan"
      >
        ?
      </span>
    );
  }
  const name = `${person.first_name} ${person.last_name}`;
  return person.avatar_url && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={person.avatar_url}
      alt={name}
      title={name}
      className="shrink-0 rounded-full object-cover"
      style={style}
      onError={() => setBroken(true)}
    />
  ) : (
    <span
      title={name}
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-bold text-white',
        avatarGradientClass(person.id),
      )}
      style={style}
    >
      {initialsOf(person.first_name, person.last_name)}
    </span>
  );
}

export function StatusChip({ status }: { status: TaskStatus }) {
  const s = STATUSES[status];
  return (
    <span className="sx-chip" style={{ color: s.c, background: `color-mix(in srgb, ${s.c} 14%, transparent)` }}>
      {s.n}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: Priority }) {
  const p = PRIORITIES[priority];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: p.c }}>
      <Flag className="size-3" fill="currentColor" fillOpacity={0.2} />
      {p.n}
    </span>
  );
}

export function WsTag({ ws }: { ws: Workstream }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-au-muted">
      <i className="size-2 rounded-full" style={{ background: WORKSTREAMS[ws].c }} />
      {WORKSTREAMS[ws].n}
    </span>
  );
}

export function DueTag({ task, today }: { task: StrategyTask; today: string }) {
  const late = isLate(task, today);
  return (
    <span className={cn('text-[11px] font-semibold tabular-nums', late ? 'text-au-bad' : 'text-au-muted')}>
      {late ? '⚠ ' : ''}
      {fmtDay(task.end_date)}
    </span>
  );
}

export function Donut({ parts, total, label }: { parts: { v: number; c: string }[]; total: number; label: string }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const segs = parts.filter((p) => p.v > 0 && total > 0);
  const offsets = segs.map((_, i) => segs.slice(0, i).reduce((a, p) => a + (C * p.v) / total, 0));
  return (
    <svg viewBox="0 0 130 130" width="150" height="150" className="sx-donut">
      <g transform="rotate(-90 65 65)">
        <circle cx="65" cy="65" r={R} fill="none" stroke="var(--au-card-2)" strokeWidth="18" />
        {segs.map((p, i) => (
          <circle
            key={i}
            cx="65"
            cy="65"
            r={R}
            fill="none"
            stroke={p.c}
            strokeWidth="18"
            strokeDasharray={`${Math.max((C * p.v) / total - 2, 0)} ${C}`}
            strokeDashoffset={-offsets[i]}
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </g>
      <text x="65" y="63" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--au-ink)">
        {total}
      </text>
      <text x="65" y="80" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--au-faint)">
        {label}
      </text>
    </svg>
  );
}
