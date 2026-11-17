import { cache } from 'react'

import { requestTheme } from '../presentation/request-theme'
import type { Configuration } from '../presentation/lifecycle'
import { DEFAULT_SITE_NAME } from '../presentation/themes/identity'
import { resolveTheme } from '../presentation/registry'
import {
  readRouteTemplates,
  readRouteTemplatesBySite,
  type SemanticRouteTemplates,
} from '../public/semantic-url'
import type { Payload } from 'payload'

/** Search-engine ownership verification tokens (F3), sanitized at resolution. */
export type SiteVerificationTokens = {
  google?: string
  bing?: string
  yandex?: string
}

export type ResolvedSiteSettings = {
  themeId?: string
  themeConfiguration?: Configuration | null
  siteName: string
  siteDescription: string
  canonicalOrigin: string
  canonicalOriginsBySite: Record<string, string>
  /** Which configuration layer supplied the canonical origin (F4 diagnostics). */
  canonicalOriginSource: 'configured' | 'onboarding' | 'app-url' | 'default'
  siteVerification: {
    tokens: SiteVerificationTokens
    bySite: Record<string, SiteVerificationTokens>
  }
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
  semanticRouteTemplates?: SemanticRouteTemplates
  semanticRouteTemplatesBySite?: Record<string, SemanticRouteTemplates>
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
  seoTitle?: string | null
  seoDescription?: string | null
  seoCanonicalURL?: string | null
  seoImageAlt?: string | null
  seoNoIndex?: boolean
  discoveryOverrides?: Record<string, unknown>
}

const idOf = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && 'id' in value) {
    const raw = (value as { id: unknown }).id
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null
  }
  return null
}

async function resolveSiteSettingsUncached(
  payload: Payload,
  options: { includeTheme?: boolean } = {},
): Promise<ResolvedSiteSettings> {
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
    const canonicalOriginSource: ResolvedSiteSettings['canonicalOriginSource'] =
      typeof settings?.canonicalOrigin === 'string' && settings.canonicalOrigin.trim()
        ? 'configured'
        : typeof onboarding?.primaryUrl === 'string' && onboarding.primaryUrl.trim()
          ? 'onboarding'
          : process.env.APP_URL
            ? 'app-url'
            : 'default'
    const canonicalOrigin = String(
      settings?.canonicalOrigin || onboarding?.primaryUrl || fallbackOrigin,
    )
      .trim()
      .replace(/\/$/, '')
    const parseVerificationTokens = (raw: unknown): SiteVerificationTokens => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
      const source = raw as Record<string, unknown>
      const tokens: SiteVerificationTokens = {}
      for (const key of ['google', 'bing', 'yandex'] as const) {
        const value = source[key]
        if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.trim()))
          tokens[key] = value.trim()
      }
      return tokens
    }
    const rawVerification =
      settings?.siteVerification && typeof settings.siteVerification === 'object'
        ? (settings.siteVerification as Record<string, unknown>)
        : {}
    const siteVerification: ResolvedSiteSettings['siteVerification'] = {
      tokens: parseVerificationTokens(rawVerification),
      bySite: Object.fromEntries(
        Object.entries(
          rawVerification.bySite && typeof rawVerification.bySite === 'object'
            ? (rawVerification.bySite as Record<string, unknown>)
            : {},
        )
          .map(([site, value]) => [site, parseVerificationTokens(value)] as const)
          .filter(([, tokens]) => Object.keys(tokens).length > 0),
      ),
    }
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

    // Host resolution needs origins before it can choose a theme. Loading a theme
    // from that path would await requestTheme's own cached in-flight promise.
    let themeConfiguration: Configuration | null = null
    if (options.includeTheme !== false) {
      try {
        themeConfiguration = await requestTheme(payload)
      } catch {
        themeConfiguration = null
      }
    }
    return {
      themeConfiguration,
      themeId:
        themeConfiguration?.renderer ??
        resolveTheme(typeof settings?.themeId === 'string' ? settings.themeId : undefined).id,
      siteName,
      siteDescription,
      canonicalOrigin: canonicalOrigin || fallbackOrigin,
      canonicalOriginsBySite,
      canonicalOriginSource,
      siteVerification,
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
      semanticRouteTemplates: readRouteTemplates(settings?.semanticRouteTemplates),
      semanticRouteTemplatesBySite: readRouteTemplatesBySite(
        settings?.semanticRouteTemplatesBySite,
        readRouteTemplates(settings?.semanticRouteTemplates),
      ),
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
      seoTitle:
        typeof settings?.seoTitle === 'string' && settings.seoTitle.trim()
          ? settings.seoTitle.trim()
          : null,
      seoDescription:
        typeof settings?.seoDescription === 'string' && settings.seoDescription.trim()
          ? settings.seoDescription.trim()
          : null,
      seoCanonicalURL:
        typeof settings?.seoCanonicalURL === 'string' && settings.seoCanonicalURL.trim()
          ? settings.seoCanonicalURL.trim()
          : null,
      seoImageAlt:
        typeof settings?.seoImageAlt === 'string' && settings.seoImageAlt.trim()
          ? settings.seoImageAlt.trim()
          : null,
      seoNoIndex: settings?.seoNoIndex === true || indexingMode === 'noindex',
      discoveryOverrides:
        settings?.discoveryOverrides && typeof settings.discoveryOverrides === 'object'
          ? (settings.discoveryOverrides as Record<string, unknown>)
          : undefined,
    }
  } catch {
    return {
      siteName: DEFAULT_SITE_NAME,
      siteDescription: '',
      canonicalOrigin: fallbackOrigin,
      canonicalOriginsBySite: {},
      canonicalOriginSource: process.env.APP_URL ? 'app-url' : 'default',
      siteVerification: { tokens: {}, bySite: {} },
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
      semanticRouteTemplates: {},
      semanticRouteTemplatesBySite: {},
      homepageSelection: { mode: 'default' },
    }
  }
}

/**
 * Per-request dedupe for settings resolution (Perf Pass 0, lane 01).
 * A single public render previously re-read the site-settings global up
 * to nine times (layout, page, metadata, JSON-LD and discovery each
 * resolve settings independently). React `cache` scopes the memo to one
 * request render — the same pattern `requestTheme` already uses — so
 * sequential phases of one render share one read, while separate
 * requests, route handlers and worker/CLI calls (no request store)
 * resolve fresh exactly as before. The two includeTheme variants stay
 * distinct keys: host resolution deliberately loads settings without a
 * theme, and that distinction is load-bearing (see the note inside the
 * resolver about requestTheme's in-flight promise).
 */
const resolveSiteSettingsCached = cache(
  async (payload: Payload, includeTheme: boolean): Promise<ResolvedSiteSettings> =>
    resolveSiteSettingsUncached(payload, { includeTheme }),
)

export async function resolveSiteSettings(
  payload: Payload,
  options: { includeTheme?: boolean } = {},
): Promise<ResolvedSiteSettings> {
  return resolveSiteSettingsCached(payload, options.includeTheme !== false)
}
