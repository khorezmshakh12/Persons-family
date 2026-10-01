'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, RotateCw } from 'lucide-react';
import { PersonsLogo } from '@/components/brand/persons-logo';
import { getTelegramWebApp, haptic, isTelegramApp } from '@/lib/telegram-webapp';

const AUTH_URL = '/staff/api/telegram/webapp-auth';
/** The P assembly takes ~1.3s; never cut it short, even on a fast login. */
const MIN_SPLASH_MS = 1500;

type State = 'loading' | 'notTelegram' | 'notLinked' | 'ambiguous' | 'suspended' | 'starFrozen' | 'error';

/**
 * Mini App launch screen: the Persons "P" assembles while Telegram's
 * signed initData is exchanged for a session, then the dashboard takes
 * over — its intro layer picks up from this exact frame and irises away
 * (data-intro="handoff", see IntroSplash).
 */
export function TgEntry() {
  const t = useTranslations('appMode');
  const locale = useLocale();
  const [state, setState] = useState<State>('loading');
  const started = useRef(false);

  const signIn = useCallback(async () => {
    setState('loading');
    const shownAt = Date.now();
    const wait = () => new Promise((r) => setTimeout(r, Math.max(0, MIN_SPLASH_MS - (Date.now() - shownAt))));

    const wa = isTelegramApp() ? await getTelegramWebApp() : null;
    if (!wa?.initData) {
      await wait();
      setState('notTelegram');
      return;
    }
    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: wa.initData }),
        credentials: 'same-origin',
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; next?: string; error?: string };
      await wait();
      if (res.ok && data.ok) {
        haptic('success');
        try {
          sessionStorage.setItem('persons-intro', 'handoff');
        } catch {
          // storage blocked — the dashboard just skips the handoff frame
        }
        // A full navigation (not router.push) so the new cookie is sent and
        // the (app) layout renders server-side with it.
        window.location.replace(`/staff/${locale}${data.next === '/set-password' ? '/set-password' : '/dashboard'}`);
        return;
      }
      haptic('error');
      const known: State[] = ['notLinked', 'ambiguous', 'suspended', 'starFrozen'];
      setState(known.includes(data.error as State) ? (data.error as State) : 'error');
    } catch {
      await wait();
      haptic('error');
      setState('error');
    }
  }, [locale]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void signIn();
  }, [signIn]);

  const message =
    state === 'notLinked'
      ? t('notLinkedBody')
      : state === 'notTelegram'
        ? t('openInTelegram')
        : state === 'loading'
          ? null
          : t(state);

  return (
    <div className="tg-entry">
      <div className="intro-glow" aria-hidden />
      <div className="intro-stage">
        <span className="intro-ring" aria-hidden />
        <PersonsLogo className="intro-logo" animated />
        <div className="intro-word" aria-label="Persons">
          {'Persons'.split('').map((ch, i) => (
            <span key={i} aria-hidden style={{ animationDelay: `${780 + i * 45}ms` }}>
              {ch}
            </span>
          ))}
        </div>
        <div className="intro-sub">Staff Platform</div>

        <div className="tg-entry-status" aria-live="polite">
          {state === 'loading' ? (
            <span className="flex items-center gap-2 text-[13px] text-au-muted">
              <Loader2 className="size-4 animate-spin" />
              {t('connecting')}
            </span>
          ) : (
            <div className="flex w-full max-w-[320px] flex-col items-center gap-3 text-center">
              {state === 'notLinked' && <p className="text-[15px] font-semibold text-au-ink">{t('notLinkedTitle')}</p>}
              <p className="text-[13px] leading-5 text-au-muted">{message}</p>
              <div className="flex w-full flex-col gap-2">
                {state === 'error' && (
                  <button
                    type="button"
                    onClick={() => void signIn()}
                    className="flex h-11 items-center justify-center gap-2 rounded-au-ctl bg-au-ink text-[14px] font-semibold text-au-card"
                  >
                    <RotateCw className="size-4" />
                    {t('retry')}
                  </button>
                )}
                <a
                  href={`/staff/${locale}/login`}
                  className="flex h-11 items-center justify-center rounded-au-ctl border border-au-line bg-au-card text-[14px] font-semibold text-au-ink"
                >
                  {t('loginWithPassword')}
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
