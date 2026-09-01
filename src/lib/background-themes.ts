export type BackgroundTheme = { id: string; name: string; url: string };

export type DesignTheme = {
  id: string;
  name: string;
  subtitle: string;
  tagline: string;
  url: string;
  type: 'photo' | 'video';
  overlay?: boolean;
  accentColors: string[];
  glassBorder: string;
};

export const DESIGN_VARIANTS: DesignTheme[] = [
  {
    id: 'aurora',
    name: 'Zenith Aurora',
    subtitle: "Shimol Yog'dusi & Neomorphic Teal",
    tagline: 'Tinchlantiruvchi zumrad-feruza nurlari va shaffof shisha',
    url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?q=80&w=2000',
    type: 'photo',
    accentColors: ['#2dd4bf', '#34d399', '#0d9488'],
    glassBorder: 'border-teal-400/30',
  },
  {
    id: 'kyoto',
    name: 'Kyoto Oasis',
    subtitle: "Yapon Bog'i & Zumrad Sokinlik",
    tagline: "Ko'zni charchatmaydigan sokin bambukzor va daryo toshlari",
    url: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=2000',
    type: 'photo',
    accentColors: ['#10b981', '#6ee7b7', '#065f46'],
    glassBorder: 'border-emerald-400/30',
  },
  {
    id: 'midnight',
    name: 'Midnight Velvet',
    subtitle: 'Tungi Hashamat & Oltin Yulduz',
    tagline: "Elita boshqaruv uslubi va iliq oltin yorug'lik",
    url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=2000',
    type: 'photo',
    accentColors: ['#fbbf24', '#f59e0b', '#d97706'],
    glassBorder: 'border-amber-400/35',
  },
  {
    id: 'nordic',
    name: 'Nordic Mist',
    subtitle: "Skandinaviya Tog'lari & Muz Kristali",
    tagline: "Qorli cho'qqilar, sokin ko'l va toza havo minimalizmi",
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=2000',
    type: 'photo',
    accentColors: ['#38bdf8', '#7dd3fc', '#0284c7'],
    glassBorder: 'border-sky-300/35',
  },
  {
    id: 'cosmic',
    name: 'Cosmic Horizon',
    subtitle: 'Koinot Ufqi & Cheksiz Ilhom',
    tagline: "Binafsha galaktikalar, cheksiz ilhom va zamonaviy nurlanish",
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2000',
    type: 'photo',
    accentColors: ['#c084fc', '#a855f7', '#06b6d4'],
    glassBorder: 'border-purple-400/35',
  },
];

export const PRESET_THEMES: BackgroundTheme[] = [
  {
    id: 'aurora',
    name: 'Zenith Aurora',
    url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?q=80&w=2000',
  },
  {
    id: 'kyoto',
    name: 'Kyoto Oasis',
    url: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=2000',
  },
  {
    id: 'midnight',
    name: 'Midnight Velvet',
    url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=2000',
  },
  {
    id: 'nordic',
    name: 'Nordic Mist',
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=2000',
  },
  {
    id: 'cosmic',
    name: 'Cosmic Horizon',
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2000',
  },
  {
    id: 'nature',
    name: 'Nature Calm',
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
