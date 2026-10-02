import { MotionLayer } from './motion-layer';

/**
 * MOTION v3 entry point (server component). Render it only for
 * MOTION_ROLES, inside the `data-motion="on"` wrapper.
 *
 * The saved theme (midnight included) is applied for everyone by
 * ThemeBoot in the (app) layout, not here.
 */
export function MotionRoot() {
  return (
    <MotionLayer />
  );
}
