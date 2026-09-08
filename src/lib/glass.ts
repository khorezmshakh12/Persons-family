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
// brighter border) on top of the base GLASS_CARD look. The bounce easing +
// active press-down is what makes it feel like a physical card lifting
// off the surface rather than just a flat opacity/color swap.
export const GLASS_INTERACTIVE =
  'cursor-pointer transition-[transform,box-shadow,border-color] duration-300 ease-bounce hover:scale-[1.03] hover:-translate-y-1 hover:shadow-2xl hover:border-white/40 active:scale-[0.98] active:translate-y-0 active:duration-100 z-10 relative';
