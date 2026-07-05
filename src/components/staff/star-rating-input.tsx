'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';

const STARS = [1, 2, 3, 4, 5];

export function StarRatingInput({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: number | null;
}) {
  const [value, setValue] = useState(defaultValue ?? 0);

  function handleClick(e: React.MouseEvent<HTMLButtonElement>, star: number) {
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeftHalf = e.clientX - rect.left < rect.width / 2;
    setValue(isLeftHalf ? star - 0.5 : star);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {STARS.map((star) => {
          const fill = Math.min(Math.max(value - (star - 1), 0), 1);
          return (
            <button
              key={star}
              type="button"
              className="text-muted-foreground relative cursor-pointer transition-transform hover:scale-110"
              onClick={(e) => handleClick(e, star)}
              aria-label={`Rate ${star}`}
            >
              <Star className="size-6" />
              {fill > 0 && (
                <span
                  className="absolute inset-0 overflow-hidden text-amber-400"
                  style={{ width: `${fill * 100}%` }}
                >
                  <Star className="size-6 fill-current" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <span className="text-muted-foreground text-sm tabular-nums">{value.toFixed(1)}</span>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
