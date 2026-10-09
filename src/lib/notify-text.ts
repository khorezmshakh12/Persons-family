/** Pure helpers for the notification center (client-safe, testable). */

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** Telegram HTML → plain title / body for the bell. */
export function toPlain(text: string): { title: string; body: string | null } {
  const plain = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
    .trim();
  const lines = plain.split('\n').map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] ?? '').slice(0, 160) || 'Bildirishnoma';
  const body = lines.slice(1).join(' · ').slice(0, 480) || null;
  return { title, body };
}
