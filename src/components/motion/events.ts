/**
 * Tiny window-event bus between the app and the MOTION v3 layer.
 *
 * Call sites (task board, notification bell…) fire these unconditionally —
 * they are no-ops unless the motion layer is mounted and listening, which
 * only happens for MOTION_ROLES. Nothing here touches data or state.
 */

export const CELEBRATE_EVENT = 'persons:celebrate';
export const LIVE_EVENT = 'persons:live';

export type LiveEventKind = 'chat' | 'task' | 'issue' | 'warning' | 'lessonPlan' | 'success' | 'info';

export type LiveEventDetail = {
  kind: LiveEventKind;
  text: string;
  /** In-app path (without locale) the island opens on click. */
  href?: string;
};

/** Confetti burst for a genuine success moment (task approved / done). */
export function celebrate() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CELEBRATE_EVENT));
}

/** Surface a live app event in the Dynamic Island. */
export function emitLiveEvent(detail: LiveEventDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LiveEventDetail>(LIVE_EVENT, { detail }));
}
