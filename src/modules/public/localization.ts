export type LocaleSettings = {
  defaultLocale: string
  supportedLocales: string[]
  fallbackChain: string[]
  direction?: 'ltr' | 'rtl'
  timeZone: string
}
const RTL = new Set(['ar', 'fa', 'he', 'ur'])
export function localeDirection(locale: string, explicit?: 'ltr' | 'rtl') {
  return explicit ?? (RTL.has(locale.split('-')[0] ?? '') ? 'rtl' : 'ltr')
}
export function localizedPath(path: string, locale: string, settings: LocaleSettings) {
  return locale === settings.defaultLocale ? path : `/${locale}${path === '/' ? '' : path}`
}
export function localeAlternates(path: string, settings: LocaleSettings) {
  return Object.fromEntries(
    settings.supportedLocales.map((locale) => [locale, localizedPath(path, locale, settings)]),
  )
}
export function formatPublicDate(value: string | Date, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone }).format(new Date(value))
}
