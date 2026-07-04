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
};

export default withNextIntl(nextConfig);
