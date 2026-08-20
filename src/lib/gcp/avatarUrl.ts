import 'server-only';
import { createSignedReadUrl } from './storage';

const AVATAR_URL_TTL_SECONDS = 60 * 60; // 1 hour — short-lived, re-minted on every render.

/**
 * profiles.avatar_url now stores a private bucket object path (e.g.
 * "<uid>/avatar.jpg"), not a public URL — GCS buckets here have no public
 * ACLs. Every place that renders an avatar must resolve it through this
 * first. Returns null unchanged so callers can fall back to an initials
 * placeholder exactly as before.
 */
export async function resolveAvatarUrl(avatarPath: string | null): Promise<string | null> {
  if (!avatarPath) return null;
  try {
    return await createSignedReadUrl('avatars', avatarPath, AVATAR_URL_TTL_SECONDS);
  } catch (error) {
    console.error('resolveAvatarUrl failed', avatarPath, error);
    return null;
  }
}
