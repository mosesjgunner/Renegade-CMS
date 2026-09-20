import type { LocaleCode, TranslationGroup } from './contracts'

export interface HreflangAlternateMap {
  canonicalUrl: string
  canonicalPath: string
  alternateLocales: Record<string, string> // e.g. { 'en': 'https://...', 'es': 'https://...', 'x-default': 'https://...' }
  activeLocales: string[]
  omittedPhantomLocales: string[]
}

/**
 * Computes deterministic hreflang and alternate tags for a given locale document.
 * Invariants:
 * 1. ONLY real approved/published equivalents are included. Unreviewed/draft/review states are omitted (no phantom languages).
 * 2. Self-reference: the current locale always includes its own alternate tag pointing to its own URL.
 * 3. Canonical consistency: the canonicalUrl always points to the document's own canonical URL.
 * 4. x-default: points to the group source locale or default approved variant.
 */
export function computeHreflangAlternates(
  group: TranslationGroup,
  currentLocale: LocaleCode,
  siteBaseUrl: string,
): HreflangAlternateMap {
  const cleanBase = siteBaseUrl.replace(/\/+$/, '')
  const currentVariant = group.variants[currentLocale]

  if (!currentVariant) {
    throw new Error(`Locale '${currentLocale}' not found in TranslationGroup '${group.id}'`)
  }

  const canonicalUrl = currentVariant.canonicalUrl.startsWith('http')
    ? currentVariant.canonicalUrl
    : `${cleanBase}${currentVariant.canonicalPath.startsWith('/') ? currentVariant.canonicalPath : `/${currentVariant.canonicalPath}`}`

  const canonicalPath = currentVariant.canonicalPath

  const alternateLocales: Record<string, string> = {}
  const activeLocales: string[] = []
  const omittedPhantomLocales: string[] = []

  // Iterate all variants in the group
  for (const [localeCode, variant] of Object.entries(group.variants)) {
    // Only real approved or published equivalents qualify!
    const isEligible = variant.status === 'approved' || variant.status === 'published'

    if (isEligible) {
      const url = variant.canonicalUrl.startsWith('http')
        ? variant.canonicalUrl
        : `${cleanBase}${variant.canonicalPath.startsWith('/') ? variant.canonicalPath : `/${variant.canonicalPath}`}`
      alternateLocales[localeCode] = url
      activeLocales.push(localeCode)
    } else {
      omittedPhantomLocales.push(localeCode)
    }
  }

  // Ensure self-reference is strictly preserved if current variant is approved/published
  if (currentVariant.status === 'approved' || currentVariant.status === 'published') {
    alternateLocales[currentLocale] = canonicalUrl
    if (!activeLocales.includes(currentLocale)) {
      activeLocales.push(currentLocale)
    }
  }

  // x-default: points to source locale if approved/published, else the first approved variant
  const sourceVariant = group.variants[group.sourceLocale]
  if (
    sourceVariant &&
    (sourceVariant.status === 'approved' || sourceVariant.status === 'published')
  ) {
    const sourceUrl = sourceVariant.canonicalUrl.startsWith('http')
      ? sourceVariant.canonicalUrl
      : `${cleanBase}${sourceVariant.canonicalPath.startsWith('/') ? sourceVariant.canonicalPath : `/${sourceVariant.canonicalPath}`}`
    alternateLocales['x-default'] = sourceUrl
  } else if (activeLocales.length > 0) {
    alternateLocales['x-default'] = alternateLocales[activeLocales[0]]
  }

  return {
    canonicalUrl,
    canonicalPath,
    alternateLocales,
    activeLocales,
    omittedPhantomLocales,
  }
}
