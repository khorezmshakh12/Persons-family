import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';

const BASE_URL = 'https://www.persons-staffs.uz';
// This route sits above the [locale] segment, so next.config.ts's
// basePath ('/staff') isn't applied to anything it returns -- it has to be
// included by hand to match the URLs the app actually serves.
const BASE_PATH = '/staff';

// Everything past /login requires an active session, so a crawler visiting
// any other URL just gets bounced there by proxy.ts anyway -- the login
// page per locale is the only part of the site there's anything to index.
export default function sitemap(): MetadataRoute.Sitemap {
  return routing.locales.map((locale) => ({
    url: `${BASE_URL}${BASE_PATH}/${locale}/login`,
    changeFrequency: 'monthly',
    priority: locale === routing.defaultLocale ? 1 : 0.8,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `${BASE_URL}${BASE_PATH}/${l}/login`]),
      ),
    },
  }));
}
