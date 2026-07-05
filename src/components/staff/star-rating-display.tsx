import { Star } from 'lucide-react';

const STARS = [1, 2, 3, 4, 5];

export function StarRatingDisplay({ value }: { value: number | null }) {
  const rating = value ?? 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {STARS.map((star) => {
          const fill = Math.min(Math.max(rating - (star - 1), 0), 1);
          return (
            <span key={star} className="text-muted-foreground relative">
              <Star className="size-5" />
              {fill > 0 && (
                <span
                  className="absolute inset-0 overflow-hidden text-amber-400"
                  style={{ width: `${fill * 100}%` }}
                >
                  <Star className="size-5 fill-current" />
                </span>
              )}
            </span>
          );
        })}
      </div>
      <span className="text-muted-foreground text-sm tabular-nums">{rating.toFixed(1)} / 5</span>
    </div>
  );
}
