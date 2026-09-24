import { PersonsLogo } from './persons-logo';

/**
 * First-visit intro: the two halves of the Persons mark fly in and lock
 * together, the wordmark rises, then the whole layer irises away.
 *
 * Safety rules (the site once white-screened on an entrance animation):
 *  - It is a separate `pointer-events: none` overlay. The app underneath is
 *    rendered and interactive the whole time; nothing real is ever hidden.
 *  - Its lifetime is pure CSS with `forwards` fill ending in
 *    `visibility: hidden`, so it disappears even if JS never runs.
 *  - Once per browser session: the inline script below marks <html> before
 *    first paint (it only sets an attribute on <html>, which already carries
 *    suppressHydrationWarning — no DOM React owns is touched). Blocked
 *    storage or reduced motion => no intro at all.
 */
const ONCE = `try{if(sessionStorage.getItem('persons-intro')){document.documentElement.setAttribute('data-intro','seen')}else{sessionStorage.setItem('persons-intro','1')}}catch(e){document.documentElement.setAttribute('data-intro','seen')}`;

export function IntroSplash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: ONCE }} />
      <div className="intro-splash" aria-hidden>
        <div className="intro-glow" />
        <div className="intro-stage">
          <span className="intro-ring" />
          <PersonsLogo className="intro-logo" animated />
          <div className="intro-word">
            {'Persons'.split('').map((ch, i) => (
              <span key={i} style={{ animationDelay: `${780 + i * 45}ms` }}>
                {ch}
              </span>
            ))}
          </div>
          <div className="intro-sub">Staff Platform</div>
        </div>
      </div>
    </>
  );
}
