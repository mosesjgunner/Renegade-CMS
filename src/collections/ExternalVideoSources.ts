import type { CollectionConfig } from 'payload'

const internal = {
  admin: { hidden: true },
  lockDocuments: false as const,
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
}
const scope = () => [
  {
    name: 'site',
    type: 'relationship' as const,
    relationTo: 'sites' as const,
    required: true,
    index: true,
  },
  {
    name: 'owner',
    type: 'relationship' as const,
    relationTo: 'members' as const,
    required: true,
    index: true,
  },
]

export const ExternalVideoSources: CollectionConfig = {
  ...internal,
  slug: 'external-video-sources',
  fields: [
    ...scope(),
    { name: 'content', type: 'relationship', relationTo: 'content', required: true, unique: true },
    { name: 'identity', type: 'text', required: true },
    { name: 'provider', type: 'text', required: true },
    { name: 'availability', type: 'text', required: true },
    { name: 'snapshot', type: 'json' },
    { name: 'expiresAt', type: 'date', index: true },
  ],
  indexes: [{ fields: ['site', 'identity'], unique: true }],
}

export const YouTubeChannelClaims: CollectionConfig = {
  ...internal,
  slug: 'youtube-channel-claims',
  fields: [
    ...scope(),
    { name: 'claim', type: 'text', unique: true },
    { name: 'credential', type: 'text', access: { read: () => false } },
  ],
  indexes: [{ fields: ['site', 'owner'], unique: true }],
}
