import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// One-way handoff token for the Persons Staff <-> Persons Materials SSO
// bridge (see app/api/sso/materials here, and Materials' app/api/sso). The
// two apps have entirely separate Identity Platform projects and Cloud SQL
// databases by design (see AGENTS.md/CLAUDE.md history) — this is the one
// deliberate, narrow trust bridge between them: a short-lived HMAC-signed
// payload, not a general auth token. There's no persisted single-use store,
// so the 60s TTL is the only replay protection — an acceptable tradeoff for
// an internal company tool, not a public-facing auth handoff.
const TTL_MS = 60_000;

function getSecret(): string {
  const secret = process.env.SSO_SHARED_SECRET;
  if (!secret) throw new Error('SSO_SHARED_SECRET is required');
  return secret;
}

function sign(body: string): string {
  return createHmac('sha256', getSecret()).update(body).digest('base64url');
}

export function signSsoToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifySsoToken<T extends object>(token: string): (T & { iat: number }) | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: T & { iat: number };
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.iat !== 'number' || Date.now() - payload.iat > TTL_MS) return null;
  return payload;
}
