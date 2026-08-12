'use client';

import { Component, type ReactNode } from 'react';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

type Props = { children: ReactNode; fallbackMessage: string };
type State = { hasError: boolean };

/** Wraps one profile section so a query that *throws* (as opposed to one
 * that's merely slow — Suspense already covers that case) takes down only
 * that card instead of the whole route falling through to the global
 * error.tsx and kicking the viewer out of the page entirely. No hook-based
 * equivalent exists for catching render errors, hence the class component.
 * Future sections added to this page inherit the same isolation for free
 * by wrapping them in this too. */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={cn(GLASS_CARD, 'flex flex-col gap-1 p-6')}>
          <p className="text-sm text-white/60">{this.props.fallbackMessage}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
