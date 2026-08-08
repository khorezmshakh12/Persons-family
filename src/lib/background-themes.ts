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

/** Looping video background choices — a separate list from PRESET_THEMES
 * (those are photos rendered via next/image; these need a <video> element).
 * `overlay: true` applies the dark colour-harmony veil that ties a clip's
 * palette back into this app's teal/glass theme; `false` plays the clip
 * completely raw with no dimming, for a theme whose own footage is meant
 * to be seen at full brightness. */
export type VideoTheme = { id: string; name: string; url: string; overlay: boolean };

export const VIDEO_THEMES: VideoTheme[] = [
  {
    id: 'cinematic',
    name: 'Cinematic',
    url: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4',
    overlay: true,
  },
  {
    id: 'vivid',
    name: 'Vivid',
    url: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4',
    overlay: false,
  },
];

export const DEFAULT_VIDEO_THEME_ID = VIDEO_THEMES[0].id;

// Base64 data URIs inflate ~33% over the source file and localStorage caps
// out around 5-10MB depending on the browser — cap the raw upload well
// under that so setItem never throws QuotaExceededError.
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
