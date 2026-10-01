/**
 * Marks <html data-app="tg|pwa"> before first paint, so the app-mode CSS
 * (globals.css, "Mobile app mode") and the entry splash apply without a
 * flash of the browser layout.
 *
 *  - tg:  opened from the Telegram bot as a Mini App. Telegram passes its
 *         launch params in the URL hash on the first page only, so the
 *         answer is remembered in sessionStorage for later navigations.
 *  - pwa: launched from the home screen (installed web app).
 *
 * Only sets an attribute on <html> (suppressHydrationWarning) — touches no
 * DOM that React owns.
 */
const SCRIPT = `(function(){try{var d=document.documentElement,s=sessionStorage,m='';
if(/tgWebApp(Data|Version|Platform)=/.test(location.hash)||window.TelegramWebviewProxy||s.getItem('persons-app')==='tg'){m='tg'}
else if((window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone){m='pwa'}
if(m){d.setAttribute('data-app',m);s.setItem('persons-app',m)}}catch(e){}})();`;

export function AppModeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
