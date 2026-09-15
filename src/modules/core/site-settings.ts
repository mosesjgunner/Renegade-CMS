import { requestTheme } from '../presentation/request-theme'
import type { Configuration } from '../presentation/lifecycle'
import { DEFAULT_SITE_NAME } from '../presentation/themes/identity'
import { resolveTheme } from '../presentation/registry'
import type { Payload } from 'payload'

export type ResolvedSiteSettings = {
  themeId?: string
  themeConfiguration?: Configuration | null
  siteName: string
  siteDescription: string
  canonicalOrigin: string
  canonicalOriginsBySite: Record<string, string>
  locale: string
  timezone: string
  logoId: string | null
  logoUrl: string | null
  defaultSocialImageId: string | null
  defaultSocialImageUrl: string | null
  footerText: string | null
  indexingMode: 'index' | 'noindex'
  launchState: 'live' | 'prelaunch' | 'maintenance'
  discoveryDefaults: Record<string, Record<string, unknown>>
  homepageSelection: {
    mode: 'default' | 'page' | 'layout'
    pageId?: string | null
    layoutId?: string | null
  }
  ownerKind?: 'organization' | 'person'
  organizationName?: string
  personName?: string
  legalName?: string
  sameAs?: string[]
  searchAction?: {
    enabled?: boolean
    target?: string
    queryInput?: string
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
        DEFAULT_SITE_NAME,
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
    const canonicalOriginsBySite = Object.fromEntries(
      Object.entries(
        settings?.canonicalOriginsBySite && typeof settings.canonicalOriginsBySite === 'object'
          ? (settings.canonicalOriginsBySite as Record<string, unknown>)
          : {},
      ).flatMap(([key, value]) =>
        typeof value === 'string' && value.trim() ? [[key, value.trim().replace(/\/$/, '')]] : [],
      ),
    )

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
    const launchState =
      settings?.launchState === 'prelaunch' || settings?.launchState === 'maintenance'
        ? settings.launchState
        : 'live'
    const discoveryDefaults =
      settings?.discoveryDefaults && typeof settings.discoveryDefaults === 'object'
        ? (settings.discoveryDefaults as Record<string, Record<string, unknown>>)
        : {}

    const hp = (settings?.homepageSelection as Record<string, unknown> | undefined) ?? {}
    const homepageMode = hp.mode === 'page' || hp.mode === 'layout' ? hp.mode : ('default' as const)
    const homepagePageId = idOf(hp.page)
    const homepageLayoutId = idOf(hp.layout)

    const themeConfiguration = await requestTheme(payload)
    return {
      themeConfiguration,
      themeId:
        themeConfiguration?.renderer ??
        resolveTheme(typeof settings?.themeId === 'string' ? settings.themeId : undefined).id,
      siteName,
      siteDescription,
      canonicalOrigin: canonicalOrigin || fallbackOrigin,
      canonicalOriginsBySite,
      locale,
      timezone,
      logoId,
      logoUrl: logoId ? `/media/${logoId}` : null,
      defaultSocialImageId,
      defaultSocialImageUrl: defaultSocialImageId ? `/media/${defaultSocialImageId}` : null,
      footerText,
      indexingMode,
      launchState,
      discoveryDefaults,
      homepageSelection: {
        mode: homepageMode,
        pageId: homepagePageId,
        layoutId: homepageLayoutId,
      },
      ownerKind: settings?.ownerKind === 'person' ? 'person' : 'organization',
      organizationName:
        typeof settings?.organizationName === 'string'
          ? settings.organizationName.trim()
          : undefined,
      personName: typeof settings?.personName === 'string' ? settings.personName.trim() : undefined,
      legalName: typeof settings?.legalName === 'string' ? settings.legalName.trim() : undefined,
      sameAs: Array.isArray(settings?.sameAs)
        ? settings.sameAs.filter((s): s is string => typeof s === 'string' && Boolean(s.trim()))
        : undefined,
      searchAction:
        settings?.searchAction && typeof settings.searchAction === 'object'
          ? (settings.searchAction as { enabled?: boolean; target?: string; queryInput?: string })
          : undefined,
    }
  } catch {
    return {
      siteName: DEFAULT_SITE_NAME,
      siteDescription: '',
      canonicalOrigin: fallbackOrigin,
      canonicalOriginsBySite: {},
      locale: 'en',
      timezone: 'UTC',
      logoId: null,
      logoUrl: null,
      defaultSocialImageId: null,
      defaultSocialImageUrl: null,
      footerText: null,
      indexingMode: 'index',
      launchState: 'live',
      discoveryDefaults: {},
      homepageSelection: { mode: 'default' },
    }
  }
}
