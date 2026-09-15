import { snapshotLayout } from '../modules/presentation/snapshots'
import { themes } from '../modules/presentation/registry'
import { validateLayout, type PageLayout } from '../modules/public/page-builder'
import type { CollectionConfig } from 'payload'

import { retentionFields, siteScopeFields, visibilityOptions } from './canonical-shared'
import { searchProjectionHooks } from '../modules/public/search-projection'

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
        const merged = { ...originalDoc, ...data }
        const site =
          typeof merged.site === 'string'
            ? merged.site
            : String((merged.site as { id?: unknown } | undefined)?.id ?? '')
        const checked = validateLayout({
          version: Number(merged.layoutVersion ?? 1) as 1,
          id: String(merged.id ?? 'new-layout'),
          siteId: site,
          name: merged.name ? String(merged.name) : undefined,
          path: String(merged.path ?? ''),
          status: merged.status === 'published' ? 'published' : 'draft',
          themeId: String(merged.themeId ?? 'neutral-starter'),
          surface: merged.surface ?? 'page',
          slot: merged.slot ?? 'main',
          templateId: merged.templateId ? String(merged.templateId) : undefined,
          templateVersion:
            typeof merged.templateVersion === 'number' ? merged.templateVersion : undefined,
          templateMode: merged.templateMode ?? undefined,
          isRetired: merged.isRetired === true,
          category: merged.category ? String(merged.category) : undefined,
          blocks: Array.isArray(merged.blocks) ? merged.blocks : [],
          unknownBlocks: Array.isArray(merged.unknownBlocks) ? merged.unknownBlocks : [],
          revision: Number(merged.revision ?? 1),
          publishedRevision:
            typeof merged.publishedRevision === 'number' ? merged.publishedRevision : undefined,
        } as PageLayout)
        const fatal = checked.errors.filter(
          (error) => !error.startsWith('Unavailable component preserved:'),
        )
        if (fatal.length) throw new Error(`Invalid presentation document: ${fatal.join(' ')}`)
        data.blocks = checked.layout.blocks
        data.unknownBlocks = checked.layout.unknownBlocks
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
      ...searchProjectionHooks('page-layouts').afterChange,
    ],
    afterDelete: searchProjectionHooks('page-layouts').afterDelete,
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
    {
      name: 'name',
      type: 'text',
      admin: { description: 'Human-readable title or template/pattern name' },
    },
    { name: 'path', type: 'text', required: true, index: true },
    {
      name: 'themeId',
      type: 'select',
      required: true,
      defaultValue: 'neutral-starter',
      options: Object.values(themes).map(({ id, label }) => ({ label, value: id })),
    },
    {
      name: 'surface',
      type: 'select',
      required: true,
      defaultValue: 'page',
      options: [
        { label: 'Flexible page', value: 'page' },
        { label: 'Global region', value: 'global' },
        { label: 'Page template', value: 'template' },
        { label: 'Reusable pattern', value: 'pattern' },
      ],
    },
    {
      name: 'slot',
      type: 'select',
      required: true,
      defaultValue: 'main',
      options: [
        { label: 'Main content', value: 'main' },
        { label: 'Global header', value: 'header' },
        { label: 'Global footer', value: 'footer' },
        { label: 'Announcement banner', value: 'announcement' },
        { label: 'Call to action', value: 'cta' },
      ],
    },
    {
      name: 'templateId',
      type: 'text',
      admin: { description: 'Source template ID if created from a template' },
    },
    { name: 'templateVersion', type: 'number' },
    {
      name: 'templateMode',
      type: 'select',
      options: [
        { label: 'Inherited', value: 'inherited' },
        { label: 'Explicitly applied', value: 'explicit' },
        { label: 'Detached', value: 'detached' },
      ],
    },
    { name: 'isRetired', type: 'checkbox', defaultValue: false },
    { name: 'category', type: 'text' },
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
