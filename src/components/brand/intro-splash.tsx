import { PersonsLogo } from './persons-logo';

/**
 * Entry intro: the two halves of the Persons "P" fly in and lock together,
 * the wordmark rises, then the whole layer irises away.
 *
 * Who sees it (decided before first paint by the inline script below):
 *  - the mobile app (Telegram Mini App / installed PWA, <html data-app>):
 *    everyone, once per app session;
 *  - the browser: MOTION_ROLES only (`motion`), once per browser session;
 *  - right after the Telegram launch screen (/tg, which already played the
 *    assembly): data-intro="handoff" — only the final frame, irising away,
 *    so the two screens read as one continuous animation.
 *
 * Safety rules (the site once white-screened on an entrance animation):
 *  - It is a separate `pointer-events: none` overlay. The app underneath is
 *    rendered and interactive the whole time; nothing real is ever hidden.
 *  - Its lifetime is pure CSS with `forwards` fill ending in
 *    `visibility: hidden`, so it disappears even if JS never runs.
 *  - The script only sets an attribute on <html> (suppressHydrationWarning)
 *    — no DOM React owns is touched. Blocked storage or reduced motion =>
 *    no intro at all.
 */
const once = (motion: boolean) =>
  `try{var d=document.documentElement,s=sessionStorage,v=s.getItem('persons-intro');if(v==='handoff'){d.setAttribute('data-intro','handoff');s.setItem('persons-intro','1')}else if(v||!(${motion}||d.hasAttribute('data-app'))){d.setAttribute('data-intro','seen')}else{s.setItem('persons-intro','1')}}catch(e){document.documentElement.setAttribute('data-intro','seen')}`;

export function IntroSplash({ motion = false }: { motion?: boolean }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: once(motion) }} />
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
