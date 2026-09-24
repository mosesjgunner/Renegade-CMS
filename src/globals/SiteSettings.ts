import { DEFAULT_SITE_NAME } from '../modules/presentation/themes/identity'
import { themes } from '../modules/presentation/registry'
import type { GlobalConfig } from 'payload'

import { seoFields, structuredDataSourceFields } from '../collections/canonical-shared'
import { revalidateDiscoveryOutputs } from '../modules/public/revalidation'

const staffOrOwner = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))
const ownerOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  req.user?.role === 'owner'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site Settings',
  admin: { group: 'Settings' },
  access: { read: () => true, update: staffOrOwner },
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
        if (data.siteName && !data.defaultTitle) {
          data.defaultTitle = data.siteName
        } else if (data.defaultTitle && !data.siteName) {
          data.siteName = data.defaultTitle
        }
        if (data.siteDescription && !data.defaultDescription) {
          data.defaultDescription = data.siteDescription
        }
        if (data.indexingMode === 'noindex') {
          data.seoNoIndex = true
        } else if (data.indexingMode === 'index') {
          data.seoNoIndex = false
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
    { name: 'defaultTitle', type: 'text', defaultValue: DEFAULT_SITE_NAME },
    { name: 'defaultDescription', type: 'textarea' },
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
