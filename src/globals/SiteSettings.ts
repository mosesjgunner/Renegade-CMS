import type { GlobalConfig } from 'payload'

import { seoFields, structuredDataSourceFields } from '../collections/canonical-shared'

const ownerOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  req.user?.role === 'owner'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site Settings',
  admin: { group: 'Publishing' },
  access: { read: () => true, update: ownerOnly },
  fields: [
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
