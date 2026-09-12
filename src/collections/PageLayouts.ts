import { snapshotLayout } from '../modules/presentation/snapshots'
import { themes } from '../modules/presentation/registry'
import type { CollectionConfig } from 'payload'

import { retentionFields, siteScopeFields, visibilityOptions } from './canonical-shared'

const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))

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
  hooks: {
    beforeChange: [
      ({ data, originalDoc, context }) => {
        const publish =
          context.publishPresentation === true ||
          (context.publishPresentation !== false &&
            ((!originalDoc && data.status === 'published') ||
              (data.status === 'published' &&
                data.publishedRevision != null &&
                data.publishedRevision !== originalDoc?.publishedRevision)))
        data.publishedPresentation = originalDoc?.publishedPresentation ?? null
        if (publish) {
          const snapshot = snapshotLayout({ ...originalDoc, ...data })
          data.publishedPresentation = snapshot
          data.publishedRevision = snapshot.revision
          data.status = 'published'
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc }) => {
        try {
          const { revalidatePath } = await import('next/cache.js')
          revalidatePath('/', 'layout')
        } catch {
          /* Local API callers have no Next cache; public routes read dynamically. */
        }
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'publishedPresentation',
      type: 'json',
      admin: {
        readOnly: true,
        description:
          'Complete immutable public presentation; replaced only by explicit publication.',
      },
    },
    ...siteScopeFields(),
    { name: 'path', type: 'text', required: true, index: true },
    {
      name: 'themeId',
      type: 'select',
      required: true,
      defaultValue: 'neutral-starter',
      options: Object.values(themes).map(({ id, label }) => ({ label, value: id })),
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
    { name: 'blocks', access: { read: staffOnly }, type: 'json', required: true, defaultValue: [] },
    {
      name: 'unknownBlocks',
      access: { read: staffOnly },
      type: 'json',
      required: true,
      defaultValue: [],
    },
    { name: 'revision', type: 'number', required: true, defaultValue: 1 },
    { name: 'publishedRevision', type: 'number' },
    {
      name: 'revisionHistory',
      access: { read: staffOnly },
      type: 'json',
      required: true,
      defaultValue: [],
    },
    ...retentionFields(),
  ],
  indexes: [{ fields: ['site', 'path'], unique: true }],
}
