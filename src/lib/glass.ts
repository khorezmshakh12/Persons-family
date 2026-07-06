// Shared glassmorphism card treatment — frosted panel over the dynamic
// background photo set in Settings. Used by every card/table across the
// app shell so the whole interior UI reads as one consistent surface.
//
// transform-gpu + will-change-transform promote each panel to its own
// compositor layer, so the backdrop-blur is painted once by the GPU instead
// of being recomputed on every scroll/animation frame.
export const GLASS_CARD =
  'rounded-2xl border border-white/20 bg-white/10 text-white shadow-xl backdrop-blur-md transform-gpu will-change-transform';

// Applied to any glass surface that's a link/button to something else —
// gives an unambiguous "this is clickable" signal (scale, deeper shadow,
// brighter border) on top of the base GLASS_CARD look.
export const GLASS_INTERACTIVE =
  'cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:border-white/40 z-10 relative';
