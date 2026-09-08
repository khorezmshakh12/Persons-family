'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DragOverlay,
  defaultDropAnimationSideEffects,
  type DropAnimation,
} from '@dnd-kit/core';
import { useReducedMotion } from 'framer-motion';

/**
 * Shared cursor-follower for the kanban boards (tasks + issues).
 *
 * Why this exists instead of a bare `<DragOverlay>`:
 *
 * 1. **The portal.** `<DragOverlay>` renders a `position: fixed` wrapper
 *    whose `top`/`left` are the *viewport* coordinates of the card you
 *    grabbed. The app shell's `<main>` carries `transform-gpu
 *    will-change-transform` (see app-shell.tsx — it promotes the glass
 *    surfaces to their own compositor layer), and a transformed ancestor
 *    becomes the containing block for `position: fixed` descendants. Left
 *    in place, the overlay's viewport coordinates were resolved against
 *    `<main>` instead — so on a scrolled board the card jumped hundreds of
 *    pixels *up* and then scrolled with the page instead of tracking the
 *    pointer. Portalling to `document.body` puts the overlay back outside
 *    every transformed ancestor, which is what makes it follow the cursor
 *    1:1. Context still flows through `createPortal`, so the overlay is
 *    still a child of its `<DndContext>`.
 *
 * 2. **The drop animation.** The boards previously passed
 *    `dropAnimation={null}`, so on release the card simply vanished from
 *    under the cursor. dnd-kit's drop animation measures the draggable's
 *    *final* DOM position (the optimistic move has already re-rendered the
 *    card into its new column by then) and glides the overlay into it —
 *    the magnet-snap-and-settle. Under `prefers-reduced-motion` it is
 *    dropped entirely; placement is identical either way, only the
 *    tweening goes away.
 */
const DROP_ANIMATION: DropAnimation = {
  // Short enough to feel like a snap rather than a flight, with a touch of
  // overshoot at the end so the card visibly settles into its slot.
  duration: 200,
  easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.08)',
  // Hide the real card for exactly as long as the overlay is gliding onto
  // it, so the two are never both visible mid-landing.
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0' } },
  }),
};

export function KanbanDragOverlay({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  // `document` doesn't exist while this renders on the server, and the
  // portal target has to match between the server HTML and the first client
  // render — so mount the overlay only after hydration. Nothing is lost: no
  // drag can be in flight before the board is interactive.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <DragOverlay dropAnimation={reduceMotion ? null : DROP_ANIMATION}>{children}</DragOverlay>,
    document.body,
  );
}
