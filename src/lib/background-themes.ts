export type BackgroundTheme = { id: string; name: string; url: string };

export const PRESET_THEMES: BackgroundTheme[] = [
  {
    id: 'nature',
    name: 'Nature',
    // The original URL given for this theme (and for "cyberpunk" below) 404s
    // — the Unsplash photo IDs no longer resolve. Swapped in a verified-live
    // replacement matching the same theme.
    url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=2000',
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    url: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?q=80&w=2000',
  },
  {
    id: 'cyberpunk',
    name: 'Dark Cyberpunk',
    url: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?q=80&w=2000',
  },
  {
    id: 'abstract',
    name: 'Minimalist Abstract',
    url: 'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?q=80&w=2000',
  },
  {
    id: 'space',
    name: 'Space / Night Sky',
    url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=80&w=2000',
  },
];

export const DEFAULT_BACKGROUND = PRESET_THEMES[0].url;

// Base64 data URIs inflate ~33% over the source file and localStorage caps
// out around 5-10MB depending on the browser — cap the raw upload well
// under that so setItem never throws QuotaExceededError.
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
