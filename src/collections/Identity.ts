import type { CollectionConfig } from 'payload'

import {
  canonicalSlug,
  capabilityFields,
  enforceSiteTenantBoundary,
  moderationStateOptions,
  publicationStatusOptions,
  visibilityOptions,
} from './canonical-shared'

const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))

export const Brands: CollectionConfig = {
  slug: 'brands',
  admin: { useAsTitle: 'name', group: 'Publishing' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  hooks: { beforeChange: [enforceSiteTenantBoundary([])] },
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'legalName', type: 'text' },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'organization',
      options: ['organization', 'personal'],
    },
    { name: 'tagline', type: 'text' },
    { name: 'mission', type: 'textarea' },
    { name: 'description', type: 'textarea' },
    { name: 'bio', type: 'textarea' },
    { name: 'logo', type: 'relationship', relationTo: 'media-assets' },
    { name: 'favicon', type: 'relationship', relationTo: 'media-assets' },
    { name: 'colors', type: 'json' },
    { name: 'typography', type: 'json' },
    { name: 'contactDefaults', type: 'json' },
    { name: 'socialDefaults', type: 'json' },
    { name: 'primaryAuthor', type: 'relationship', relationTo: 'authors' },
    { name: 'audience', type: 'textarea' },
    { name: 'voice', type: 'textarea' },
    { name: 'vocabulary', type: 'json' },
    { name: 'avoidedPhrases', type: 'json' },
    { name: 'graphicStyle', type: 'textarea' },
    { name: 'seoDefaults', type: 'json' },
    { name: 'socialDefaultsOverride', type: 'json' },
    { name: 'newsletterDefaults', type: 'json' },
    { name: 'disclosures', type: 'textarea' },
    { name: 'structuredDataDefaults', type: 'json' },
  ],
}

export const Members: CollectionConfig = {
  slug: 'members',
  admin: { useAsTitle: 'displayName', group: 'Community' },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    { name: 'displayName', type: 'text', required: true },
    { name: 'email', type: 'email', unique: true, index: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: ['active', 'disabled', 'archived'],
    },
    { name: 'disabledAt', type: 'date' },
    { name: 'archivedAt', type: 'date' },
    { name: 'exportRequestedAt', type: 'date' },
    { name: 'deletionRequestedAt', type: 'date' },
    { name: 'verifiedEmailAt', type: 'date' },
    { name: 'moderationReason', type: 'textarea', admin: { readOnly: true } },
  ],
}

export const LinkedIdentities: CollectionConfig = {
  slug: 'linked-identities',
  admin: { useAsTitle: 'externalSubject', group: 'Community', hidden: true },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    { name: 'member', type: 'relationship', relationTo: 'members', required: true, index: true },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: ['passkey', 'oauth', 'social', 'wallet', 'email-magic-link'],
    },
    { name: 'providerKey', type: 'text', required: true, index: true },
    { name: 'externalSubject', type: 'text', required: true, index: true },
    { name: 'verifiedAt', type: 'date' },
    { name: 'revokedAt', type: 'date' },
    { name: 'expiresAt', type: 'date' },
    { name: 'metadata', type: 'json' },
  ],
  indexes: [{ fields: ['providerKey', 'externalSubject'], unique: true }],
}
export const MemberSessions: CollectionConfig = {
  slug: 'member-sessions',
  admin: { useAsTitle: 'id', group: 'Community', hidden: true },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    { name: 'member', type: 'relationship', relationTo: 'members', required: true, index: true },
    { name: 'tokenHash', type: 'text', required: true, unique: true },
    { name: 'expiresAt', type: 'date', required: true, index: true },
    { name: 'revokedAt', type: 'date' },
    { name: 'lastSeenAt', type: 'date' },
    { name: 'deviceLabel', type: 'text' },
    {
      name: 'createdFrom',
      type: 'select',
      required: true,
      options: ['magic-link', 'passkey', 'oauth', 'wallet', 'recovery'],
    },
  ],
}
export const IdentityTokens: CollectionConfig = {
  slug: 'identity-tokens',
  admin: { useAsTitle: 'purpose', group: 'Community', hidden: true },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    {
      name: 'purpose',
      type: 'select',
      required: true,
      options: ['magic-link-sign-in', 'identity-link', 'wallet-nonce'],
    },
    { name: 'tokenHash', type: 'text', required: true, unique: true },
    { name: 'emailHash', type: 'text', index: true },
    { name: 'member', type: 'relationship', relationTo: 'members', index: true },
    { name: 'browserBindingHash', type: 'text' },
    { name: 'expiresAt', type: 'date', required: true, index: true },
    { name: 'consumedAt', type: 'date' },
    { name: 'metadata', type: 'json' },
  ],
}
export const MemberRecoveryCodes: CollectionConfig = {
  slug: 'member-recovery-codes',
  admin: { useAsTitle: 'id', group: 'Community', hidden: true },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    { name: 'member', type: 'relationship', relationTo: 'members', required: true, index: true },
    { name: 'codeHash', type: 'text', required: true, unique: true },
    { name: 'usedAt', type: 'date' },
  ],
}
export const IdentityAuditEvents: CollectionConfig = {
  slug: 'identity-audit-events',
  admin: { useAsTitle: 'event', group: 'Community', hidden: true },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    { name: 'member', type: 'relationship', relationTo: 'members', index: true },
    { name: 'event', type: 'text', required: true, index: true },
    { name: 'details', type: 'json' },
  ],
}
export const Profiles: CollectionConfig = {
  slug: 'profiles',
  admin: { useAsTitle: 'displayName', group: 'Community' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  fields: [
    {
      name: 'member',
      type: 'relationship',
      relationTo: 'members',
      required: true,
      unique: true,
      index: true,
    },
    { name: 'displayName', type: 'text', required: true },
    {
      name: 'handle',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: canonicalSlug,
      admin: {
        description: 'Public handle; changes require an explicit member self-service request.',
      },
    },
    { name: 'avatar', type: 'relationship', relationTo: 'media-assets' },
    { name: 'cover', type: 'relationship', relationTo: 'media-assets' },
    { name: 'bio', type: 'textarea' },
    { name: 'links', type: 'json' },
    {
      name: 'preferences',
      type: 'json',
      admin: { description: 'Private member self-service preferences.' },
    },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'public',
      options: visibilityOptions,
    },
    {
      name: 'fieldAudience',
      type: 'json',
      admin: { description: 'Audience per public profile field.' },
    },
    { name: 'layoutTheme', type: 'json' },
  ],
}

export const Spaces: CollectionConfig = {
  slug: 'spaces',
  admin: { useAsTitle: 'handle', group: 'Community' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  hooks: { beforeChange: [enforceSiteTenantBoundary([])] },
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
    { name: 'member', type: 'relationship', relationTo: 'members', required: true, index: true },
    { name: 'profile', type: 'relationship', relationTo: 'profiles' },
    {
      name: 'handle',
      type: 'text',
      required: true,
      index: true,
      validate: canonicalSlug,
    },
    {
      name: 'canonicalPath',
      type: 'text',
      required: true,
      defaultValue: '/members/',
    },
    { name: 'displayName', type: 'text', required: true },
    { name: 'avatar', type: 'relationship', relationTo: 'media-assets' },
    { name: 'cover', type: 'relationship', relationTo: 'media-assets' },
    { name: 'bio', type: 'textarea' },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'public',
      options: visibilityOptions,
    },
    { name: 'fieldAudience', type: 'json' },
    { name: 'layoutTheme', type: 'json' },
    ...capabilityFields(),
    { name: 'providerOwnership', type: 'json' },
    {
      name: 'moderationState',
      type: 'select',
      required: true,
      defaultValue: 'clear',
      options: moderationStateOptions,
    },
    { name: 'suspendedAt', type: 'date' },
    { name: 'transferToMember', type: 'relationship', relationTo: 'members' },
    {
      name: 'transferState',
      type: 'select',
      defaultValue: 'none',
      options: ['none', 'pending', 'completed'],
    },
  ],
  indexes: [
    { fields: ['site', 'handle'], unique: true },
    { fields: ['site', 'canonicalPath'], unique: true },
  ],
}

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: { useAsTitle: 'displayName', group: 'Publishing' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        const references = await req.payload.find({
          collection: 'content',
          where: { 'authors.author': { equals: id } },
          depth: 0,
          limit: 1,
          overrideAccess: true,
        } as never)
        if (references.docs.length)
          throw new Error('This author is assigned to content and cannot be deleted.')
      },
    ],
  },
  fields: [
    { name: 'displayName', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: canonicalSlug,
    },
    { name: 'member', type: 'relationship', relationTo: 'members', unique: true },
    { name: 'bio', type: 'textarea' },
    { name: 'avatar', type: 'relationship', relationTo: 'media-assets' },
    { name: 'website', type: 'text' },
    { name: 'socialLinks', type: 'json' },
  ],
}

export const Publications: CollectionConfig = {
  slug: 'publications',
  admin: { useAsTitle: 'name', group: 'Publishing' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  hooks: {
    beforeChange: [
      enforceSiteTenantBoundary([
        { field: 'brand', collection: 'brands' },
        { field: 'space', collection: 'spaces' },
      ]),
    ],
  },
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
    { name: 'owner', type: 'relationship', relationTo: 'members', index: true },
    { name: 'space', type: 'relationship', relationTo: 'spaces', index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true, validate: canonicalSlug },
    { name: 'canonicalBasePath', type: 'text', required: true, defaultValue: '/blogs/' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: publicationStatusOptions,
    },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'public',
      options: visibilityOptions,
    },
    { name: 'brand', type: 'relationship', relationTo: 'brands' },
    { name: 'profile', type: 'relationship', relationTo: 'profiles' },
    {
      name: 'brandOverrides',
      type: 'json',
      admin: { description: 'Controlled presentation overrides; the brand remains canonical.' },
    },
    { name: 'themePreset', type: 'text' },
    { name: 'moderationPolicy', type: 'json' },
    { name: 'featurePolicy', type: 'json' },
    ...capabilityFields(),
    { name: 'navigation', type: 'json' },
    { name: 'feeds', type: 'json' },
    { name: 'seoDefaults', type: 'json' },
    { name: 'suspendedAt', type: 'date' },
    { name: 'archivedAt', type: 'date' },
    { name: 'archiveMessage', type: 'textarea' },
  ],
  indexes: [{ fields: ['site', 'slug'], unique: true }],
}

export const Relationships: CollectionConfig = {
  slug: 'relationships',
  admin: { useAsTitle: 'pairKey', group: 'Community' },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data?.subject && data?.object && data?.kind) {
          const object = data.object as string | { value?: string }
          const objectId = typeof object === 'string' ? object : object.value
          data.pairKey = `${data.kind}:${data.subject}:${objectId}`
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
    { name: 'subject', type: 'relationship', relationTo: 'members', required: true, index: true },
    {
      name: 'object',
      type: 'relationship',
      relationTo: ['members', 'publications', 'content', 'albums', 'media-assets'],
      required: true,
      index: true,
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [
        'follow',
        'friend',
        'block',
        'mute',
        'publication-membership',
        'content-association',
        'curation',
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: ['pending', 'active', 'blocked', 'archived'],
    },
    { name: 'role', type: 'select', options: ['owner', 'editor', 'author', 'moderator', 'member'] },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'private',
      options: visibilityOptions,
    },
    { name: 'startedAt', type: 'date' },
    { name: 'endedAt', type: 'date' },
    {
      name: 'pairKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
  ],
}
