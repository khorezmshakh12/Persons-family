// @/lib/glass — PERSONS AURORA surface & control class sets.
//
// The file keeps its historical name (and the GLASS_* exports) so every
// existing import keeps working — the values are now the Aurora light
// surfaces: white cards, 1px warm border, soft shadow, no backdrop blur.
// New code should use the SURFACE_* / BTN_* / CHIP_* names directly.
// Tokens live in src/app/aurora.css; the rules in persons-aurora-kit/
// AURORA_DESIGN_SYSTEM.md.

/** Main card: white, 1px warm border, soft shadow. No blur. */
export const SURFACE_CARD = 'rounded-au-card border border-au-line bg-au-card shadow-au-card text-au-ink';

/** Block inside a card (list row, small panel). No shadow. */
export const SURFACE_INSET = 'rounded-au-ctl border border-au-line bg-au-card-2';

/** Hero block: mesh gradient, ink text. One per page. */
export const SURFACE_HERO = 'rounded-au-card bg-au-hero text-au-ink relative overflow-hidden';

/** Clickable card add-on — layered on top of SURFACE_CARD. Deeper shadow on
 * hover, no scale/jump (design rule: hover never moves the card). */
export const CARD_INTERACTIVE =
  'cursor-pointer transition-shadow duration-150 ease-out hover:shadow-au-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15';

/** Clickable element (row, chip, segment button). */
export const INTERACTIVE =
  'rounded-au-ctl border border-au-line bg-au-card text-au-ink transition-colors duration-150 ' +
  'hover:bg-au-card-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15';

/** Primary button — INK. One per screen. */
export const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 h-11 px-[18px] rounded-au-ctl bg-au-primary text-white ' +
  'font-semibold text-sm shadow-au-btn hover:bg-black transition-[color,background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none';

/** Secondary button — white with a border. */
export const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 h-11 px-[18px] rounded-au-ctl bg-white/70 border border-au-line ' +
  'text-au-ink font-semibold text-sm hover:bg-white transition-[color,background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none';

/** Accent button — star/reward actions only (buy, claim stars). */
export const BTN_ACCENT =
  'inline-flex items-center justify-center gap-2 h-11 px-[18px] rounded-au-ctl bg-au-accent text-au-accent-ink ' +
  'font-semibold text-sm hover:brightness-105 transition active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none';

/** Input */
export const INPUT =
  'h-11 w-full rounded-au-ctl border border-au-line bg-au-card px-3.5 text-sm text-au-ink ' +
  'placeholder:text-au-faint focus:outline-none focus:ring-2 focus:ring-au-accent/40 focus:border-au-accent';

/** Chip / badge variants */
export const CHIP = 'inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs font-semibold';
export const CHIP_ACCENT = `${CHIP} bg-au-accent-soft text-au-accent-text`;
export const CHIP_OK = `${CHIP} bg-au-ok-soft text-au-ok`;
export const CHIP_INFO = `${CHIP} bg-au-info-soft text-au-info`;
export const CHIP_BAD = `${CHIP} bg-au-bad-soft text-au-bad`;
export const CHIP_NEUTRAL = `${CHIP} bg-au-card-2 text-au-muted`;

/** Sidebar navigation item */
export const NAV_ITEM =
  'nav-motion flex items-center gap-3 h-9 px-2.5 rounded-au-ctl text-sm font-medium text-au-muted hover:bg-au-card hover:text-au-ink';
export const NAV_ITEM_ACTIVE =
  'nav-motion flex items-center gap-3 h-9 px-2.5 rounded-au-ctl text-sm font-semibold bg-au-card text-au-ink shadow-sm ring-1 ring-au-line [&_svg]:text-au-accent-text';

/** Card title row: title left, muted "Batafsil →" link right. */
export const CARD_TITLE = 'text-[15px] leading-5 font-bold text-au-ink';
export const CARD_LINK = 'text-xs font-semibold text-au-muted hover:text-au-ink transition-colors';

/** Loading skeleton bar */
export const SKELETON = 'animate-pulse rounded-au-ctl bg-au-card-2';

/* ---------- Legacy names (backwards compatible) ---------- */
export const GLASS_CARD = SURFACE_CARD;
export const GLASS_INTERACTIVE = CARD_INTERACTIVE;
export const GLASS_PANEL = SURFACE_CARD;
