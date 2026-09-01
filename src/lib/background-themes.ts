export type BackgroundTheme = { id: string; name: string; url: string };

export type DesignTheme = {
  id: string;
  name: string;
  styleName: string;
  subtitle: string;
  tagline: string;
  url: string;
  type: 'photo' | 'video' | 'mesh' | 'dark_matte' | 'cyber';
  overlay?: boolean;
  accentColors: string[];
  glassBorder: string;
  badge: string;
};

export const DESIGN_VARIANTS: DesignTheme[] = [
  {
    id: 'aurora',
    name: 'Zenith Aurora Glass',
    styleName: "Shimoliy Yog'du (Zenith Aurora)",
    subtitle: "Muzlatilgan Shisha & Mayin Oltin Yulduzlar",
    tagline: "Arktika nurlari, shaffof zumrad-feruza shisha va havoda suzuvchi oltin yulduzchalar",
    url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?q=80&w=2000',
    type: 'photo',
    accentColors: ['#2dd4bf', '#34d399', '#fbbf24'],
    glassBorder: 'border-teal-400/30',
    badge: 'Zenith Aurora',
  },
  {
    id: 'kyoto',
    name: 'Kyoto Zen Oasis',
    styleName: "Yapon Bambuk Bog'i (Zen Oasis)",
    subtitle: "Tabiiy Zumrad & Ko'zga Orom Beruvchi Sokinlik",
    tagline: "Tumanli bambukzor va daryo toshlari — uzoq ishlaganda ko'zni charchatmaydigan yashil tabiat",
    url: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=2000',
    type: 'photo',
    accentColors: ['#10b981', '#6ee7b7', '#065f46'],
    glassBorder: 'border-emerald-400/30',
    badge: 'Zen Comfort',
  },
  {
    id: 'midnight',
    name: 'Royal Obsidian & Gold',
    styleName: 'Monarx Oltin (VIP Velvet)',
    subtitle: 'Obsidian Qora & Oltin Yulduz Nurlari',
    tagline: "Oltin metall hoshiyalar, chuqur qora baxmal va iliq hashamatli boshqaruv nurlanishi",
    url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=2000',
    type: 'photo',
    accentColors: ['#fbbf24', '#f59e0b', '#d97706'],
    glassBorder: 'border-amber-400/35',
    badge: 'Royal Gold',
  },
  {
    id: 'nordic',
    name: 'Nordic Alpine Mist',
    styleName: "Skandinaviya Tog'lari (Nordic Mist)",
    subtitle: 'Muz Kristali & Toza Havo Minimalizmi',
    tagline: "Qorli alp cho'qqilari, sokin oyna ko'l va shaffof muzdek tiniq akril shisha",
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=2000',
    type: 'photo',
    accentColors: ['#38bdf8', '#7dd3fc', '#0284c7'],
    glassBorder: 'border-sky-300/35',
    badge: 'Alpine Clean',
  },
  {
    id: 'cosmic',
    name: 'Cosmic Deep Nebula',
    styleName: 'Koinot Ufqi (Cosmic Horizon)',
    subtitle: 'Binafsha Galaktika & Cheksiz Ilhom',
    tagline: "Chuqur koinot yulduz changi, binafsha-moviy golografik nurlar va kreativ muhit",
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2000',
    type: 'photo',
    accentColors: ['#c084fc', '#a855f7', '#06b6d4'],
    glassBorder: 'border-purple-400/35',
    badge: 'Cosmic Pro',
  },
  {
    id: 'studio',
    name: 'Linear Dark Studio',
    styleName: 'Linear Pro Studio (Bento UI)',
    subtitle: 'Matoviy Qora & Taktil Neomorfizm',
    tagline: "Rasm shovqinisiz sof matoviy qora sirt, bo'rtma taktil soyalar va maksimal diqqat-e'tibor",
    url: '',
    type: 'dark_matte',
    accentColors: ['#818cf8', '#6366f1', '#38bdf8'],
    glassBorder: 'border-slate-700/60',
    badge: 'Studio Focus',
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
