export type BackgroundTheme = { id: string; name: string; url: string };

export const PRESET_THEMES: BackgroundTheme[] = [
  {
    id: 'nature',
    name: 'Nature',
    // The original URL given for this theme 404s — the Unsplash photo ID no
    // longer resolves. Swapped in a verified-live replacement matching the
    // same theme.
    url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=2000',
  },
];

export const DEFAULT_BACKGROUND = PRESET_THEMES[0].url;

// Base64 data URIs inflate ~33% over the source file and localStorage caps
// out around 5-10MB depending on the browser — cap the raw upload well
// under that so setItem never throws QuotaExceededError.
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
