import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The app once white-screened because a `both`-fill entrance keyframe started
// at opacity 0 and stalled. Rule: keyframes applied to real UI are
// transform-only. Fades are allowed only on View Transition snapshots
// (::view-transition-*) and ephemeral overlays — named vt-*, m-card-*, m-ping.
const FILES = ['src/app/motion-v4.css', 'src/app/themes.css'];
const ALLOWED = /^(vt-|m-card-|m-ping$)/;

test('real-UI keyframes never start hidden (motion-v4 / themes)', () => {
  for (const file of FILES) {
    const css = readFileSync(file, 'utf8');
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
      const [, name, body] = m;
      if (ALLOWED.test(name)) continue;
      assert.ok(!/opacity\s*:\s*0(?![.\d])/.test(body), `${file}: @keyframes ${name} animates opacity to/from 0 — keep it transform-only`);
      assert.ok(!/visibility\s*:\s*hidden/.test(body), `${file}: @keyframes ${name} hides content`);
    }
  }
});

test('PageTransition keeps its wrapper animation-free (View Transitions only)', () => {
  const src = readFileSync('src/components/app-shell/page-transition.tsx', 'utf8');
  assert.ok(!/animate-|framer-motion|initial=\{/.test(src), 'page-transition.tsx must not animate its own wrapper');
});
