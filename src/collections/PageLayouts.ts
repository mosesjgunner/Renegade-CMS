import type { CollectionConfig } from 'payload'

import { retentionFields, siteScopeFields, visibilityOptions } from './canonical-shared'

const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  req.user?.role === 'owner' || req.user?.role === 'staff'

/** Materialized, portable public PageLayout IR. Anonymous reads can never expose drafts. */
export const PageLayouts: CollectionConfig = {
  slug: 'page-layouts',
  admin: { useAsTitle: 'path', group: 'Publishing' },
  access: {
    create: staffOnly,
    delete: staffOnly,
    read: ({ req }) =>
      staffOnly({ req }) || { status: { equals: 'published' }, visibility: { equals: 'public' } },
    update: staffOnly,
  },
  fields: [
    ...siteScopeFields(),
    { name: 'path', type: 'text', required: true, index: true },
    {
      name: 'themeId',
      type: 'select',
      required: true,
      defaultValue: 'neutral-starter',
      options: ['neutral-starter', 'renegade-party'],
    },
    { name: 'layoutVersion', type: 'number', required: true, defaultValue: 1 },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: ['draft', 'published'],
    },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'public',
      options: visibilityOptions,
    },
    { name: 'blocks', type: 'json', required: true, defaultValue: [] },
    { name: 'unknownBlocks', type: 'json', required: true, defaultValue: [] },
    { name: 'revision', type: 'number', required: true, defaultValue: 1 },
    { name: 'publishedRevision', type: 'number' },
    { name: 'revisionHistory', type: 'json', required: true, defaultValue: [] },
    ...retentionFields(),
  ],
  indexes: [{ fields: ['site', 'path'], unique: true }],
}
