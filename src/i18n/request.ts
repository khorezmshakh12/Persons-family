import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // The whole staff is in Tashkent — every date/time formatted via
    // next-intl's useFormatter()/format.dateTime() should default to this
    // zone rather than the server's or each visitor's local zone.
    timeZone: 'Asia/Tashkent',
  };
});
