import type { MetadataRoute } from 'next';

// Served at /staff/manifest.webmanifest (basePath) — lets staff install
// Persons on the home screen, where it opens full-screen like the
// Telegram Mini App (html[data-app="pwa"], see AppModeScript).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/staff/',
    name: 'Persons Staff',
    short_name: 'Persons',
    description: 'Persons Education — staff platform',
    start_url: '/staff/uz/dashboard',
    scope: '/staff/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f4f2ee',
    theme_color: '#f4f2ee',
    icons: [
      { src: '/staff/app-icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/staff/app-icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/staff/app-icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
