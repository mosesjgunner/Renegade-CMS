import type { Payload } from 'payload'

export type ResolvedSiteSettings = {
  siteName: string
  siteDescription: string
  canonicalOrigin: string
  locale: string
  timezone: string
  logoId: string | null
  logoUrl: string | null
  defaultSocialImageId: string | null
  defaultSocialImageUrl: string | null
  footerText: string | null
  indexingMode: 'index' | 'noindex'
  homepageSelection: {
    mode: 'default' | 'page' | 'layout'
    pageId?: string | null
    layoutId?: string | null
  }
}

const idOf = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && 'id' in value) {
    const raw = (value as { id: unknown }).id
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null
  }
  return null
}

export async function resolveSiteSettings(payload: Payload): Promise<ResolvedSiteSettings> {
  const fallbackOrigin = process.env.APP_URL ?? 'http://localhost:3000'
  try {
    const settings = (await payload.findGlobal({
      slug: 'site-settings',
      depth: 0,
      overrideAccess: true,
    } as never)) as unknown as Record<string, unknown> | null

    const siteName = String(
      settings?.siteName ||
        settings?.defaultTitle ||
        settings?.organizationName ||
        settings?.personName ||
        'Renegade CMS',
    ).trim()

    const siteDescription = String(
      settings?.siteDescription || settings?.defaultDescription || '',
    ).trim()

    const onboarding = (settings?.onboarding as Record<string, unknown> | undefined) ?? {}
    const canonicalOrigin = String(
      settings?.canonicalOrigin || onboarding?.primaryUrl || fallbackOrigin,
    )
      .trim()
      .replace(/\/$/, '')

    const locale = String(settings?.locale || onboarding?.locale || 'en').trim()
    const timezone = String(settings?.timezone || onboarding?.timezone || 'UTC').trim()

    const logoId = idOf(settings?.logo)
    const defaultSocialImageId = idOf(settings?.defaultSocialImage)

    const footerText =
      typeof settings?.footerText === 'string' && settings.footerText.trim()
        ? settings.footerText.trim()
        : null

    const indexingMode =
      settings?.indexingMode === 'noindex' || settings?.seoNoIndex === true ? 'noindex' : 'index'

    const hp = (settings?.homepageSelection as Record<string, unknown> | undefined) ?? {}
    const homepageMode = hp.mode === 'page' || hp.mode === 'layout' ? hp.mode : ('default' as const)
    const homepagePageId = idOf(hp.page)
    const homepageLayoutId = idOf(hp.layout)

    return {
      siteName,
      siteDescription,
      canonicalOrigin: canonicalOrigin || fallbackOrigin,
      locale,
      timezone,
      logoId,
      logoUrl: logoId ? `/media/${logoId}` : null,
      defaultSocialImageId,
      defaultSocialImageUrl: defaultSocialImageId ? `/media/${defaultSocialImageId}` : null,
      footerText,
      indexingMode,
      homepageSelection: {
        mode: homepageMode,
        pageId: homepagePageId,
        layoutId: homepageLayoutId,
      },
    }
  } catch {
    return {
      siteName: 'Renegade CMS',
      siteDescription: '',
      canonicalOrigin: fallbackOrigin,
      locale: 'en',
      timezone: 'UTC',
      logoId: null,
      logoUrl: null,
      defaultSocialImageId: null,
      defaultSocialImageUrl: null,
      footerText: null,
      indexingMode: 'index',
      homepageSelection: { mode: 'default' },
    }
  }
}
