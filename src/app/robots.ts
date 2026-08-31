import type { MetadataRoute } from 'next';

const BASE_URL = 'https://www.persons-staffs.uz';
// robots.ts sits above the [locale] segment, so next.config.ts's basePath
// ('/staff') isn't applied automatically — spell it out, same as sitemap.ts.
const BASE_PATH = '/staff';

/**
 * Everything past the per-locale /login page requires a session and is
 * bounced to /login by proxy.ts, so there's nothing to gain from letting a
 * crawler wander deeper — but the login pages themselves (and the marketing
 * copy on them) are what should surface for a "persons staffs" search, so
 * the rest of the tree is disallowed rather than the whole site.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [`${BASE_PATH}/`, `${BASE_PATH}/uz/login`, `${BASE_PATH}/ru/login`, `${BASE_PATH}/en/login`],
        disallow: [
          `${BASE_PATH}/dashboard`,
          `${BASE_PATH}/staff`,
          `${BASE_PATH}/chat`,
          `${BASE_PATH}/issues`,
          `${BASE_PATH}/tasks`,
          `${BASE_PATH}/lesson-plans`,
          `${BASE_PATH}/finance`,
          `${BASE_PATH}/missions`,
          `${BASE_PATH}/self-development`,
          `${BASE_PATH}/market`,
          `${BASE_PATH}/roadmap`,
          `${BASE_PATH}/analytics`,
          `${BASE_PATH}/profile`,
          `${BASE_PATH}/settings`,
          `${BASE_PATH}/company-news`,
          `${BASE_PATH}/calendar`,
          `${BASE_PATH}/telegram-setup`,
        ],
      },
    ],
    sitemap: `${BASE_URL}${BASE_PATH}/sitemap.xml`,
    host: BASE_URL,
  };
}
