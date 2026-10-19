import { DEFAULT_SITE_NAME } from '../modules/presentation/themes/identity'
import { themes } from '../modules/presentation/registry'
import { APIError, type GlobalConfig } from 'payload'
import { operatorAllSitesAccess } from '../modules/operations/operator-grants'

import { seoFields, structuredDataSourceFields } from '../collections/canonical-shared'
import { revalidateDiscoveryOutputs } from '../modules/public/revalidation'
import {
  validateRouteTemplates,
  validateRouteTemplatesBySite,
} from '../modules/public/semantic-url'

const ownerOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  req.user?.role === 'owner'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site Settings',
  admin: { group: 'Settings' },
  access: { read: () => true, update: operatorAllSitesAccess },
  hooks: {
    afterChange: [
      async ({ doc }) => {
        await revalidateDiscoveryOutputs()
        return doc
      },
    ],
    beforeValidate: [
      ({ data, originalDoc }) => {
        if (!data) return data
        const routeTemplateError = validateRouteTemplates(data.semanticRouteTemplates)
        if (routeTemplateError) throw new Error(routeTemplateError)
        const siteRouteTemplateError = validateRouteTemplatesBySite(
          data.semanticRouteTemplatesBySite,
          (data.semanticRouteTemplates ?? originalDoc?.semanticRouteTemplates) as
            | Record<string, string>
            | undefined,
        )
        if (siteRouteTemplateError) throw new Error(siteRouteTemplateError)
        if (data.canonicalOrigin && typeof data.canonicalOrigin === 'string') {
          const trimmed = data.canonicalOrigin.trim()
          try {
            const parsed = new URL(trimmed)
            if (!['http:', 'https:'].includes(parsed.protocol)) {
              throw new Error('Canonical origin must use HTTP or HTTPS protocol.')
            }
          } catch (err) {
            throw new Error(
              err instanceof Error && err.message.includes('protocol')
                ? err.message
                : `Invalid canonical origin URL: "${data.canonicalOrigin}".`,
            )
          }
        }
        if (
          data.canonicalOriginsBySite &&
          typeof data.canonicalOriginsBySite === 'object' &&
          !Array.isArray(data.canonicalOriginsBySite)
        ) {
          const hostToSite = new Map<string, string>()
          for (const [siteKey, rawOrigin] of Object.entries(data.canonicalOriginsBySite)) {
            if (typeof rawOrigin === 'string' && rawOrigin.trim()) {
              try {
                const parsed = new URL(rawOrigin.trim())
                if (!['http:', 'https:'].includes(parsed.protocol)) {
                  throw new Error(
                    `Canonical origin for site ${siteKey} must use HTTP or HTTPS protocol.`,
                  )
                }
                const hostKey = parsed.host.toLowerCase()
                const hostnameKey = parsed.hostname.toLowerCase()
                if (
                  (hostToSite.has(hostKey) && hostToSite.get(hostKey) !== siteKey) ||
                  (hostToSite.has(hostnameKey) && hostToSite.get(hostnameKey) !== siteKey)
                ) {
                  const conflictingSite = hostToSite.get(hostKey) || hostToSite.get(hostnameKey)
                  throw new Error(
                    `Canonical origin host "${hostnameKey}" conflicts between site "${siteKey}" and site "${conflictingSite}".`,
                  )
                }
                hostToSite.set(hostKey, siteKey)
                hostToSite.set(hostnameKey, siteKey)
              } catch (err) {
                throw new Error(
                  err instanceof Error
                    ? err.message
                    : `Invalid canonical origin URL for site ${siteKey}: "${rawOrigin}".`,
                )
              }
            }
          }
        }
        if (data.siteName) {
          data.defaultTitle = data.siteName
        } else if (data.defaultTitle) {
          data.siteName = data.defaultTitle
        }
        if (data.siteDescription) {
          data.defaultDescription = data.siteDescription
        } else if (data.defaultDescription) {
          data.siteDescription = data.defaultDescription
        }
        if (
          typeof data.seoNoIndex === 'boolean' &&
          data.seoNoIndex !== originalDoc?.seoNoIndex &&
          data.indexingMode === originalDoc?.indexingMode
        ) {
          data.indexingMode = data.seoNoIndex ? 'noindex' : 'index'
        } else if (data.indexingMode === 'noindex') {
          data.seoNoIndex = true
        } else if (data.indexingMode === 'index') {
          data.seoNoIndex = false
        } else if (typeof data.seoNoIndex === 'boolean') {
          data.indexingMode = data.seoNoIndex ? 'noindex' : 'index'
        }
        const rawHomeCanonical =
          typeof data.seoCanonicalURL === 'string' && data.seoCanonicalURL.trim()
            ? data.seoCanonicalURL.trim()
            : typeof (data.discoveryOverrides as Record<string, unknown> | undefined)?.canonical ===
                  'string' &&
                String((data.discoveryOverrides as Record<string, unknown>).canonical).trim()
              ? String((data.discoveryOverrides as Record<string, unknown>).canonical).trim()
              : null
        if (rawHomeCanonical) {
          const originCandidate = String(
            data.canonicalOrigin ??
              originalDoc?.canonicalOrigin ??
              process.env.APP_URL ??
              'http://localhost:3000',
          )
            .trim()
            .replace(/\/$/, '')
          try {
            const baseParsed = new URL(originCandidate)
            const parsed = new URL(rawHomeCanonical, `${originCandidate}/`)
            if (!['http:', 'https:'].includes(parsed.protocol)) {
              throw new Error('Homepage canonical URL must use HTTP or HTTPS protocol.')
            }
            if (parsed.origin !== baseParsed.origin) {
              throw new Error(
                `Homepage canonical URL "${rawHomeCanonical}" cannot point to a cross-origin host (${parsed.origin} !== ${baseParsed.origin}).`,
              )
            }
            if (parsed.search || parsed.hash) {
              throw new Error(
                'Homepage canonical URL cannot contain query parameters or fragments.',
              )
            }
            if (parsed.pathname !== '/') {
              throw new Error('Homepage canonical URL must point to the site root.')
            }
          } catch (err) {
            throw new APIError(
              err instanceof Error
                ? err.message
                : `Invalid homepage canonical URL: "${rawHomeCanonical}".`,
              400,
              undefined,
              true,
            )
          }
        }
        if (data.launchState === 'live' && originalDoc?.launchState !== 'live') {
          data.launchedAt = new Date().toISOString()
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'themeId',
      type: 'select',
      defaultValue: 'neutral-starter',
      options: Object.values(themes).map(({ id, label }) => ({ label, value: id })),
    },
    { name: 'siteName', type: 'text', label: 'Site Name', defaultValue: DEFAULT_SITE_NAME },
    { name: 'siteDescription', type: 'textarea', label: 'Site Description' },
    {
      name: 'canonicalOrigin',
      type: 'text',
      label: 'Canonical Origin',
      admin: { description: 'Canonical public origin, e.g. https://renegadeparty.org' },
    },
    {
      name: 'canonicalOriginsBySite',
      type: 'json',
      admin: {
        description:
          'Optional site-id to canonical-origin map for multisite installs. Origins must be absolute HTTPS URLs in production.',
      },
    },
    {
      name: 'semanticRouteTemplates',
      type: 'json',
      admin: {
        description:
          'Optional templates for routes served by the semantic catch-all. Fixed-renderer and unavailable entity routes retain their safe defaults. Site-specific templates can override supported defaults using approved variables.',
      },
    },
    {
      name: 'semanticRouteTemplatesBySite',
      type: 'json',
      admin: {
        description:
          'Optional route templates by site id. Each site can override supported semantic route types; unspecified types use safe defaults.',
      },
    },
    { name: 'locale', type: 'text', defaultValue: 'en' },
    { name: 'timezone', type: 'text', defaultValue: 'UTC' },
    {
      name: 'footerText',
      type: 'textarea',
      label: 'Footer Text',
      admin: { description: 'Custom footer disclaimer or copyright notice.' },
    },
    {
      name: 'indexingMode',
      type: 'select',
      defaultValue: 'index',
      options: ['index', 'noindex'],
      label: 'Search Engine Indexing Mode',
      admin: { description: 'Controls whether public pages are indexable by search engines.' },
    },
    {
      name: 'homepageSelection',
      type: 'group',
      label: 'Homepage Selection',
      fields: [
        {
          name: 'mode',
          type: 'select',
          defaultValue: 'default',
          options: ['default', 'page', 'layout'],
          label: 'Homepage Type',
        },
        {
          name: 'page',
          type: 'relationship',
          relationTo: 'content',
          filterOptions: { contentType: { equals: 'page' } },
        },
        {
          name: 'layout',
          type: 'relationship',
          relationTo: 'page-layouts',
        },
      ],
    },
    {
      name: 'onboarding',
      label: 'Onboarding preferences',
      type: 'group',
      admin: {
        description:
          'Non-secret first-run choices. Provider credentials remain in their provider configuration.',
      },
      fields: [
        { name: 'primaryUrl', type: 'text' },
        { name: 'locale', type: 'text' },
        { name: 'timezone', type: 'text' },
        { name: 'featureProfile', type: 'select', options: ['Lean', 'Standard'] },
        { name: 'starterType', type: 'text' },
        { name: 'starterContent', type: 'checkbox', defaultValue: true },
      ],
    },
    {
      name: 'adminExperience',
      type: 'group',
      label: 'Optional capabilities',
      admin: {
        description:
          'Enable a capability to make its existing tools discoverable in Capability Center. This changes presentation only; it never grants permissions or deletes data.',
      },
      fields: [
        {
          name: 'optionalCapabilities',
          type: 'group',
          fields: [
            {
              name: 'mediaProcessing',
              type: 'checkbox',
              defaultValue: false,
              label: 'Advanced media & DAM',
            },
            {
              name: 'socialDistribution',
              type: 'checkbox',
              defaultValue: false,
              label: 'Social scheduling',
            },
            {
              name: 'transactionalEmail',
              type: 'checkbox',
              defaultValue: false,
              label: 'Audience delivery',
            },
            {
              name: 'commerceCheckout',
              type: 'checkbox',
              defaultValue: false,
              label: 'Commerce & POS',
            },
            {
              name: 'analyticsReporting',
              type: 'checkbox',
              defaultValue: false,
              label: 'Advanced analytics',
            },
            { name: 'experiments', type: 'checkbox', defaultValue: false, label: 'Experiments' },
            {
              name: 'qualityScanning',
              type: 'checkbox',
              defaultValue: false,
              label: 'Quality Center',
            },
          ],
        },
      ],
    },
    {
      name: 'privacy',
      label: 'Privacy and first-party analytics',
      type: 'group',
      admin: {
        description:
          'Collection is off by default. Consent is never bypassed by server-side collection.',
      },
      fields: [
        { name: 'analyticsEnabled', type: 'checkbox', defaultValue: false },
        { name: 'consentVersion', type: 'text', required: true, defaultValue: '2026-08-31' },
        { name: 'respectGlobalPrivacyControl', type: 'checkbox', defaultValue: true },
        { name: 'respectDoNotTrack', type: 'checkbox', defaultValue: true },
        {
          name: 'rawEventRetentionDays',
          type: 'number',
          required: true,
          defaultValue: 90,
          min: 1,
          max: 365,
        },
        {
          name: 'rollupRetentionDays',
          type: 'number',
          required: true,
          defaultValue: 730,
          min: 1,
          max: 3650,
        },
      ],
    },
    {
      name: 'ownerKind',
      type: 'select',
      required: true,
      defaultValue: 'organization',
      options: ['organization', 'person'],
    },
    { name: 'organizationName', type: 'text' },
    { name: 'personName', type: 'text' },
    { name: 'legalName', type: 'text' },
    {
      name: 'defaultTitle',
      type: 'text',
      defaultValue: DEFAULT_SITE_NAME,
      admin: { hidden: true },
    },
    { name: 'defaultDescription', type: 'textarea', admin: { hidden: true } },
    { name: 'logo', type: 'relationship', relationTo: 'media-assets' },
    { name: 'favicon', type: 'relationship', relationTo: 'media-assets' },
    { name: 'defaultSocialImage', type: 'relationship', relationTo: 'media-assets' },
    {
      name: 'discoveryDefaults',
      type: 'json',
      admin: {
        description:
          'Optional defaults by content type. Keys may include default, page, post, article, podcast, video, author, taxonomy and search. Each may set titleTemplate, description, socialTitle, socialDescription, socialImage, locale, alternates, index and follow.',
      },
    },
    {
      name: 'launchState',
      type: 'select',
      defaultValue: 'live',
      options: ['live', 'prelaunch', 'maintenance'],
      admin: {
        description:
          'Prelaunch and maintenance safely noindex every public surface. Return this prominently to Live after launch.',
      },
    },
    { name: 'launchedAt', type: 'date', admin: { readOnly: true } },
    { name: 'sameAs', type: 'json' },
    { name: 'contactDefaults', type: 'json' },
    { name: 'socialHandles', type: 'json' },
    { name: 'siteVerification', type: 'json' },
    { name: 'robotsDefaults', type: 'json' },
    {
      name: 'searchAction',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false },
        { name: 'targetTemplate', type: 'text', defaultValue: '/search?q={search_term_string}' },
      ],
    },
    { name: 'organizationDefaults', type: 'json' },
    { name: 'personDefaults', type: 'json' },
    {
      name: 'inheritancePolicy',
      type: 'select',
      required: true,
      defaultValue: 'site-publication-brand',
      options: ['site-publication-brand', 'site-brand-publication', 'explicit-only'],
    },
    ...seoFields(),
    ...structuredDataSourceFields(),
    {
      name: 'rawStructuredDataOverride',
      type: 'json',
      access: { read: ownerOnly, update: ownerOnly },
      admin: {
        description: 'Privileged exception for owners; normal editors use structured defaults.',
      },
    },
  ],
}
