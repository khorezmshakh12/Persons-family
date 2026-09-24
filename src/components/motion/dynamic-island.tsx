'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  CircleCheck,
  ClipboardCheck,
  Info,
  ListTodo,
  MessageCircle,
  TriangleAlert,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { LIVE_EVENT, type LiveEventDetail, type LiveEventKind } from './events';

const ICONS: Record<LiveEventKind, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  chat: MessageCircle,
  task: ListTodo,
  issue: AlertCircle,
  warning: TriangleAlert,
  lessonPlan: ClipboardCheck,
  success: CircleCheck,
  info: Info,
};

const SHOW_MS = 4600;
const OUT_MS = 350;

type Shown = LiveEventDetail & { id: number };

/**
 * "Dynamic Island": a pill that briefly shows live app events that already
 * exist client-side — new notification-bell arrivals (via emitLiveEvent)
 * and success/info toasts (mirrored from sonner's DOM). It is not content:
 * it only exists while an event is showing, never blocks anything but its
 * own box, and a click opens the related page (or just dismisses).
 */
export function DynamicIsland() {
  const t = useTranslations('motion');
  const [shown, setShown] = useState<Shown | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    let seq = 0;
    const clear = () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };
    const show = (detail: LiveEventDetail) => {
      if (!detail?.text) return;
      clear();
      seq += 1;
      setLeaving(false);
      setShown({ ...detail, id: seq });
      timers.current.push(
        window.setTimeout(() => setLeaving(true), SHOW_MS),
        window.setTimeout(() => setShown(null), SHOW_MS + OUT_MS),
      );
    };

    const onLive = (e: Event) => show((e as CustomEvent<LiveEventDetail>).detail);
    window.addEventListener(LIVE_EVENT, onLive);

    // Mirror sonner success/info toasts. Errors stay in the toast only.
    const seen = new WeakSet<Element>();
    const inspect = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      const toasts = node.matches('[data-sonner-toast]')
        ? [node]
        : Array.from(node.querySelectorAll<HTMLElement>('[data-sonner-toast]'));
      for (const el of toasts) {
        if (seen.has(el)) continue;
        seen.add(el);
        const type = el.getAttribute('data-type');
        if (type !== 'success' && type !== 'info') continue;
        const text = (el.querySelector('[data-title]')?.textContent ?? el.textContent ?? '').trim();
        if (text) show({ kind: type, text });
      }
    };
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) m.addedNodes.forEach(inspect);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener(LIVE_EVENT, onLive);
      observer.disconnect();
      clear();
    };
  }, []);

  if (!shown) return <div role="status" aria-live="polite" />;

  const Icon = ICONS[shown.kind] ?? Info;
  const dismiss = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    setShown(null);
  };
  const body = (
    <>
      <span className="au-island-icon">
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </span>
      <span className="au-island-text">
        <small>{t(`kind.${shown.kind}`)}</small>
        <span>{shown.text}</span>
      </span>
      <span className="au-island-wave" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
    </>
  );
  const className = `au-island${leaving ? ' au-island-out' : ''}`;

  return (
    <div role="status" aria-live="polite">
      {shown.href ? (
        <Link key={shown.id} href={shown.href} className={className} onClick={dismiss}>
          {body}
        </Link>
      ) : (
        <button key={shown.id} type="button" className={className} onClick={dismiss} title={t('dismiss')}>
          {body}
        </button>
      )}
    </div>
  );
}
