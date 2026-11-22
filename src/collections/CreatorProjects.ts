import type { Access, CollectionConfig, Field, Where } from 'payload'
import { ownerFields } from './canonical-shared'
import { operatorSiteReadAccess } from '../modules/operations/operator-grants'

export const portfolioSnapshotFields = (): Field[] => [
  {
    name: 'portfolioDraft',
    type: 'json',
    admin: { readOnly: true, description: 'Edit in Creator Studio.' },
    access: {
      create: () => false,
      update: () => false,
      read: async (args) => Boolean(await operatorSiteReadAccess({ req: args.req })),
    },
  },
  {
    name: 'portfolioPublished',
    type: 'json',
    admin: { readOnly: true },
    access: { create: () => false, update: () => false },
  },
]

export const readAlbums: Access = async (args) => {
  const operator = await operatorSiteReadAccess(args)
  if (operator === true) return true
  const legacyPublic: Where = {
    and: [
      { portfolioDraft: { exists: false } },
      { visibility: { equals: 'public' } },
      { moderationState: { equals: 'clear' } },
      { removeFromDiscovery: { not_equals: true } },
      { retentionMode: { not_in: ['tombstone', 'manual-burn', 'expire-at'] } },
    ],
  }
  return operator ? { or: [operator, legacyPublic] } : legacyPublic
}

export const CreatorProjects: CollectionConfig = {
  slug: 'creator-projects',
  labels: { singular: 'Creator Project', plural: 'Creator Projects' },
  admin: {
    useAsTitle: 'title',
    group: 'Publishing',
    description: 'Projects are authored in Creator Studio.',
  },
  lockDocuments: false,
  access: {
    read: operatorSiteReadAccess,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    ...ownerFields(),
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true },
    { name: 'canonicalPath', type: 'text', required: true },
    ...portfolioSnapshotFields(),
  ],
  indexes: [{ fields: ['site', 'canonicalPath'], unique: true }],
}
