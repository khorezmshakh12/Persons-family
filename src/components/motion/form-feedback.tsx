'use client';

import { useEffect } from 'react';
import { motionAllowed } from '@/lib/motion-level';

/**
 * #17: a form that fails native validation (a required reason left empty,
 * too-short text…) shakes the offending field and its submit button, so the
 * "nothing happened" click explains itself. App-wide via the `invalid` event;
 * renders nothing. Transform-only.
 */
export function FormFeedback() {
  useEffect(() => {
    const shake = (el: Element | null | undefined) => {
      if (!(el instanceof HTMLElement)) return;
      el.classList.remove('m-shake');
      void el.offsetWidth; // restart the animation on repeat attempts
      el.classList.add('m-shake');
      el.addEventListener('animationend', () => el.classList.remove('m-shake'), { once: true });
    };
    let lastForm: HTMLFormElement | null = null;
    let lastAt = 0;
    const onInvalid = (e: Event) => {
      if (!motionAllowed('calm')) return;
      const field = e.target as HTMLElement & { form?: HTMLFormElement | null };
      shake(field);
      const form = field.form ?? null;
      const now = Date.now();
      if (form && (form !== lastForm || now - lastAt > 300)) {
        shake(form.querySelector('[type="submit"], button:not([type])'));
        lastForm = form;
        lastAt = now;
      }
    };
    document.addEventListener('invalid', onInvalid, true);
    return () => document.removeEventListener('invalid', onInvalid, true);
  }, []);
  return null;
}
