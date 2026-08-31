import type { GlobalConfig } from 'payload'

import { seoFields, structuredDataSourceFields } from '../collections/canonical-shared'

const ownerOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  req.user?.role === 'owner'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site Settings',
  admin: { group: 'Settings' },
  access: { read: () => true, update: ownerOnly },
  fields: [
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
      admin: { description: 'Collection is off by default. Consent is never bypassed by server-side collection.' },
      fields: [
        { name: 'analyticsEnabled', type: 'checkbox', defaultValue: false },
        { name: 'consentVersion', type: 'text', required: true, defaultValue: '2026-08-31' },
        { name: 'respectGlobalPrivacyControl', type: 'checkbox', defaultValue: true },
        { name: 'respectDoNotTrack', type: 'checkbox', defaultValue: true },
        { name: 'rawEventRetentionDays', type: 'number', required: true, defaultValue: 90, min: 1, max: 365 },
        { name: 'rollupRetentionDays', type: 'number', required: true, defaultValue: 730, min: 1, max: 3650 },
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
    { name: 'defaultTitle', type: 'text', required: true },
    { name: 'defaultDescription', type: 'textarea' },
    { name: 'logo', type: 'relationship', relationTo: 'media-assets' },
    { name: 'favicon', type: 'relationship', relationTo: 'media-assets' },
    { name: 'defaultSocialImage', type: 'relationship', relationTo: 'media-assets' },
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
