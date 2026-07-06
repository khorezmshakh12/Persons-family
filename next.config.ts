import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Actual file uploads now bypass Server Actions entirely (direct to
      // Supabase Storage via a signed URL) to stay under Vercel's 4.5MB
      // serverless function payload limit. This only needs headroom for
      // regular form fields, well below Next's 1MB default.
      bodySizeLimit: '2mb',
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
      // Lesson material thumbnails: private bucket, served via short-lived
      // signed URLs generated server-side (createSignedUrl), never a public
      // bucket URL.
      { protocol: 'https', hostname: 'enjfzcnfwstcwjsycxhi.supabase.co', pathname: '/storage/v1/object/sign/**' },
    ],
  },
};

export default withNextIntl(nextConfig);
