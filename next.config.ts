import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Cloud Run deployment: a self-contained server bundle (see Dockerfile),
  // rather than Vercel's default build output.
  output: 'standalone',

  // Mounted at www.persons-staffs.uz/staff by the gateway app's reverse
  // proxy (see persons-staffs-gateway) — basePath makes Next.js
  // automatically prefix page routing, next/link, next-intl's
  // navigation helpers, next/image, and /_next/ asset URLs with /staff.
  basePath: '/staff',
  experimental: {
    serverActions: {
      // Actual file uploads bypass Server Actions entirely (direct to
      // Cloud Storage via a signed URL) to stay well under any serverless
      // payload limit. This only needs headroom for regular form fields,
      // well below Next's 1MB default.
      bodySizeLimit: '2mb',
      // This app is reverse-proxied at www.persons-staffs.uz/staff (see
      // persons-staffs-gateway) — the browser's Origin header on a Server
      // Action POST is the gateway's domain, not this app's own Cloud Run
      // host, so Next's default same-origin check rejects it unless that
      // domain is explicitly allowed. The bare Cloud Run URL is kept too,
      // for direct access/testing outside the gateway.
      allowedOrigins: ['www.persons-staffs.uz', 'persons-staffs.uz', 'persons-staff-app-121315485439.europe-west3.run.app'],
    },
  },
  images: {
    // The five preset background themes (src/lib/background-themes.ts) are
    // all Unsplash photos rendered through next/image for real optimization
    // (resize, format conversion, LCP priority). Custom uploads are a
    // client-generated data: URI and go through next/image with
    // `unoptimized` instead, since there's nothing remote to fetch/resize.
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Avatars/lesson materials/etc: private buckets, served via
      // short-lived signed URLs generated server-side
      // (createSignedReadUrl), never a public bucket URL.
      { protocol: 'https', hostname: 'storage.googleapis.com' },
    ],
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/uz',
        permanent: false,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
