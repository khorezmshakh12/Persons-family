import { themeBootScript } from '@/lib/themes';
import { ThemeSync } from './theme-sync';

/**
 * Applies the saved theme before first paint (an attribute on <html>, which
 * already carries suppressHydrationWarning — same pattern as IntroSplash),
 * for every signed-in user. Rendered by the (app) layout only, so the
 * login screens always stay Aurora.
 */
export function ThemeBoot({ serverTheme }: { serverTheme?: string | null }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeBootScript(serverTheme) }} />
      <ThemeSync />
    </>
  );
}
