'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The short "something new arrived" chime for the notification bell —
 * modelled on the iOS text-tone feel: a quick three-note mallet motif
 * rather than a single ding, so it reads unmistakably as "a message just
 * landed".
 *
 * Synthesised with the Web Audio API rather than shipped as an asset: three
 * short notes and an envelope are a few lines of code, weigh nothing, need
 * no `/staff` basePath handling, and can be retuned without re-encoding a
 * file.
 *
 * Two hard constraints shape the rest of this:
 *
 * 1. Autoplay policy. Every browser refuses to start an AudioContext until
 *    the page has seen a real user gesture, and a blocked `resume()` on
 *    Safari leaves the context stuck rather than throwing something we can
 *    react to. So the context is not created on mount at all — it is created
 *    (and resumed) by a one-shot pointerdown/keydown listener. Until the
 *    user has touched the page, `play()` is a silent no-op; the bell's shake
 *    and badge pop still run, so the notification is never *missed*, it just
 *    arrives quietly.
 * 2. Nothing here may throw into render. Any of `localStorage`, the
 *    `AudioContext` constructor, or `resume()` can fail (private mode, a
 *    locked-down embed, an exhausted audio-hardware slot) and none of that is
 *    worth breaking the app shell over, so every one is wrapped.
 *
 * Mute is a per-device preference in localStorage, defaulting to ON (unmuted),
 * and is kept in a ref alongside the state so `play()` can stay a stable
 * `useCallback` — the bell calls it from an effect, and a callback identity
 * that changed on every mute toggle would be one more unstable dep in a
 * dependency array (see AGENTS.md on effect re-arming).
 */

const MUTE_STORAGE_KEY = 'persons-erp:notifications-muted';

// An iOS-text-tone-style three-note motif: F6, down to C6, up to G6, each
// note a quick mallet strike (triangle wave — a little woodier than a pure
// sine, so it reads as a marimba tap rather than a bell) starting on the
// tail of the one before it. ~0.5s in total.
const NOTES = [
  { frequency: 1396.91, startOffset: 0, duration: 0.22 },
  { frequency: 1046.5, startOffset: 0.1, duration: 0.22 },
  { frequency: 1567.98, startOffset: 0.2, duration: 0.32 },
] as const;

// The oscillator timbre for every note. `triangle` keeps a soft mallet
// character; `sine` would be the old plain ding.
const WAVE: OscillatorType = 'triangle';

// Deliberately quiet. This fires unprompted while someone is working, so it
// should sit under whatever else they are listening to, not over it.
const PEAK_GAIN = 0.18;

type AudioContextCtor = new () => AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  // Older iOS Safari only exposes the prefixed constructor, and it isn't in
  // lib.dom, hence the widened globalThis rather than a plain `window.`.
  const g = globalThis as typeof globalThis & { webkitAudioContext?: AudioContextCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

function playChime(ctx: AudioContext) {
  // A hair in the future so the whole envelope is scheduled ahead of the
  // audio thread rather than racing it (a `currentTime` start can clip the
  // attack on a busy main thread).
  const start = ctx.currentTime + 0.02;

  const master = ctx.createGain();
  master.gain.setValueAtTime(PEAK_GAIN, start);
  master.connect(ctx.destination);

  let tail = start;

  for (const note of NOTES) {
    const osc = ctx.createOscillator();
    osc.type = WAVE;
    osc.frequency.setValueAtTime(note.frequency, start);

    const envelope = ctx.createGain();
    const noteStart = start + note.startOffset;
    const noteEnd = noteStart + note.duration;
    // exponentialRamp can never touch 0, hence the epsilons at both ends.
    envelope.gain.setValueAtTime(0.0001, noteStart);
    envelope.gain.exponentialRampToValueAtTime(1, noteStart + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    osc.connect(envelope);
    envelope.connect(master);
    osc.start(noteStart);
    osc.stop(noteEnd + 0.02);
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
    };

    tail = Math.max(tail, noteEnd);
  }

  // The per-note nodes unhook themselves in `onended`; the shared master gain
  // has no such event, so it is released once the last note has decayed.
  // Without this, one node per notification accumulates on the context.
  window.setTimeout(() => master.disconnect(), Math.ceil((tail - ctx.currentTime) * 1000) + 200);
}

export type NotificationChime = {
  /** Plays the chime. No-op while muted or before the audio unlock gesture. */
  play: () => void;
  muted: boolean;
  toggleMuted: () => void;
};

export function useNotificationChime(): NotificationChime {
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const contextRef = useRef<AudioContext | null>(null);

  // Restore the stored preference after mount only — reading localStorage
  // during render would desync the server HTML from the client's first paint.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(MUTE_STORAGE_KEY) === '1') {
        mutedRef.current = true;
        setMuted(true);
      }
    } catch {
      // Storage unavailable (private mode / blocked cookies): fall back to
      // the default, sound on.
    }
  }, []);

  // Mount-only, empty deps, and the cleanup removes exactly what it added —
  // this effect can never re-arm itself.
  useEffect(() => {
    function stopListening() {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    }

    function unlock() {
      stopListening();
      const Ctor = getAudioContextCtor();
      if (!Ctor) return;
      try {
        const ctx = contextRef.current ?? new Ctor();
        contextRef.current = ctx;
        // Chrome hands back a context that is already 'suspended' until it
        // is resumed inside a gesture — which is exactly where we are.
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      } catch (error) {
        console.error('notification chime: audio unlock failed', error);
      }
    }

    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    return () => {
      stopListening();
      const ctx = contextRef.current;
      contextRef.current = null;
      if (ctx) void ctx.close().catch(() => {});
    };
  }, []);

  const play = useCallback(() => {
    if (mutedRef.current) return;
    const ctx = contextRef.current;
    // Not unlocked yet: silent by design, the visual cue carries it.
    if (!ctx || ctx.state === 'closed') return;
    try {
      if (ctx.state === 'suspended') {
        // The tab was backgrounded and the context auto-suspended. Resuming
        // is allowed here because the page already earned a gesture.
        void ctx
          .resume()
          .then(() => playChime(ctx))
          .catch(() => {});
        return;
      }
      playChime(ctx);
    } catch (error) {
      console.error('notification chime: playback failed', error);
    }
  }, []);

  const toggleMuted = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Preference just won't survive a reload; the toggle still works for
      // this session.
    }
  }, []);

  return { play, muted, toggleMuted };
}
