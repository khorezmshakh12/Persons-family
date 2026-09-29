import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The one star used for Persons stars everywhere (market prices, balance,
 * rewards, leaderboards) — a filled five-point star in the current text
 * colour, so every place shows the same shape. */
export function StarIcon({ className }: { className?: string }) {
  return <Star className={cn('size-3.5 shrink-0 fill-current', className)} strokeWidth={1.75} aria-hidden />;
}
