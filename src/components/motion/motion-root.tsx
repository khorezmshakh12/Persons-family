import { MIDNIGHT_BOOT_SCRIPT } from './midnight';
import { MotionLayer } from './motion-layer';

/**
 * MOTION v3 entry point (server component). Render it only for
 * MOTION_ROLES, inside the `data-motion="on"` wrapper.
 *
 * The inline script applies a saved midnight choice before first paint
 * (it only sets an attribute on <html>, which already carries
 * suppressHydrationWarning — same pattern as IntroSplash).
 */
export function MotionRoot() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: MIDNIGHT_BOOT_SCRIPT }} />
      <MotionLayer />
    </>
  );
}
