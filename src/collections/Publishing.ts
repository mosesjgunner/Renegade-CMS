import type { CollectionBeforeDeleteHook, CollectionConfig, Field } from 'payload'
import { assertEvent } from '../modules/events/contracts'
import {
  assertEditorialPathAvailable,
  deriveEditorialPath,
} from '../modules/editorial/publishing-pass'
import { ensureEditorialCompanion } from '../modules/editorial/persistence'

import {
  canonicalSlug,
  enforceSiteTenantBoundary,
  importExportHookFields,
  knowledgeGraphProjectionFields,
  milestoneSixPresentationHookFields,
  moderationStateOptions,
  ownerFields,
  publicRenderHookFields,
  retentionFields,
  seoFields,
  siteScopeFields,
  structuredDataSourceFields,
  visibilityOptions,
} from './canonical-shared'

const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))

const taxonomyScope = [
  {
    name: 'site',
    type: 'relationship' as const,
    relationTo: 'sites' as const,
    required: true,
    index: true,
  },
  {
    name: 'publication',
    type: 'relationship' as const,
    relationTo: 'publications' as const,
    index: true,
  },
  {
    name: 'scope',
    type: 'select' as const,
    required: true,
    defaultValue: 'publication',
    options: ['site', 'publication'],
  },
]

const enforceTaxonomyTenantBoundary = enforceSiteTenantBoundary([
  {
    field: 'publication',
    collection: 'publications',
    requiredWhen: (data) => data.scope === 'publication',
  },
  { field: 'section', collection: 'sections' },
  { field: 'parent', collection: 'categories' },
])

const editorialLifecycleOptions = [
  'draft',
  'review',
  'approved',
  'scheduled',
  'published',
  'updated',
  'archived',
  'rejected',
] as const

const editorialActionOptions = [
  'read',
  'edit',
  'request-review',
  'review',
  'approve',
  'schedule',
  'publish',
] as const

/**
 * Payload tabs are presentation-only: this keeps the existing persisted field
 * names and migration shape while giving a publisher one predictable set of
 * task groups. Everything not used in ordinary authoring remains available
 * under Advanced instead of being silently removed from the product.
 */
const publisherFieldGroups = (fields: Field[]): Field[] => {
  const groups: Array<{ label: string; names: readonly string[]; fields: Field[] }> = [
    {
      label: 'Writing',
      names: [
        'site',
        'publication',
        'space',
        'owner',
        'contentType',
        'title',
        'subtitle',
        'body',
        'summary',
        'excerpt',
        'authors',
        'sections',
        'categories',
        'topics',
        'tags',
        'series',
      ],
      fields: [],
    },
    {
      label: 'Presentation',
      names: [
        'slug',
        'pathOverride',
        'canonicalPath',
        'parentPage',
        'pageTemplate',
        'featured',
        'pinned',
        'readingTimeMinutes',
        'tableOfContents',
        'relatedContent',
        'correctionNotices',
        'changeNotes',
      ],
      fields: [],
    },
    { label: 'Media', names: ['heroMedia'], fields: [] },
    {
      label: 'Publish',
      names: [
        'status',
        'publishedAt',
        'updatedAtEditorial',
        'commentsPolicy',
        'publicChangeHistoryPolicy',
      ],
      fields: [],
    },
    {
      label: 'SEO',
      names: [
        'seoTitle',
        'seoDescription',
        'seoCanonicalURL',
        'seoImageAlt',
        'seoFocusKeyphrase',
        'seoNoIndex',
      ],
      fields: [],
    },
    { label: 'Advanced', names: [], fields: [] },
  ]
  for (const field of fields) {
    const name = 'name' in field ? field.name : undefined
    const group = groups.find((candidate) => name && candidate.names.includes(name)) ?? groups[5]!
    group.fields.push(field)
  }
  return [
    {
      type: 'tabs',
      tabs: groups
        .filter((group) => group.fields.length)
        .map(({ label, fields: tabFields }) => ({
          label,
          fields: tabFields,
        })),
    },
  ] as Field[]
}

/** Taxonomy is archival identity; refuse deletion while an editorial record still uses it. */
const refuseReferencedTaxonomyDeletion =
  (field: string): CollectionBeforeDeleteHook =>
  async ({ id, req }) => {
    const references = await req.payload.find({
      collection: 'content',
      where: { [field]: { contains: String(id) } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    } as never)
    if (references.docs.length)
      throw new Error(`This taxonomy term is assigned to content and cannot be deleted.`)
  }

export const MediaAssets: CollectionConfig = {
  slug: 'media-assets',
  admin: { useAsTitle: 'title', group: 'Media' },
  // Metadata includes the opaque storage location. Anonymous readers must use the
  // scoped public byte route, which independently verifies a published reference.
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    ...ownerFields(),
    { name: 'title', type: 'text', required: true },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: ['image', 'audio', 'video', 'document', 'cover', 'thumbnail', 'graphic'],
    },
    {
      name: 'storageLocation',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'Local storage first; provider location is an implementation detail.' },
    },
    { name: 'storageProvider', type: 'text', required: true, defaultValue: 'local' },
    { name: 'mimeType', type: 'text' },
    { name: 'sizeBytes', type: 'number', min: 0 },
    { name: 'checksum', type: 'text', admin: { readOnly: true } },
    { name: 'width', type: 'number', min: 0 },
    { name: 'height', type: 'number', min: 0 },
    { name: 'durationSeconds', type: 'number', min: 0 },
    { name: 'altText', type: 'text' },
    {
      name: 'focalPoint',
      type: 'group',
      admin: { description: 'Normalized focal point for supported image crops.' },
      fields: [
        { name: 'x', type: 'number', min: 0, max: 1 },
        { name: 'y', type: 'number', min: 0, max: 1 },
      ],
    },
    { name: 'caption', type: 'textarea' },
    { name: 'credits', type: 'text' },
    { name: 'license', type: 'text' },
    { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
    { name: 'collections', type: 'relationship', relationTo: 'albums', hasMany: true },
    {
      name: 'variants',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'location', type: 'text', required: true },
        { name: 'mimeType', type: 'text' },
      ],
    },
    { name: 'replaceGloballyWith', type: 'relationship', relationTo: 'media-assets' },
    { name: 'originalExportAllowed', type: 'checkbox', defaultValue: true },
    {
      name: 'rightsStatus',
      type: 'select',
      defaultValue: 'approved',
      options: ['pending', 'approved', 'restricted', 'expired'],
    },
    ...retentionFields(),
  ],
}

export const Sections: CollectionConfig = {
  slug: 'sections',
  admin: { useAsTitle: 'name', group: 'Taxonomy' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  hooks: { beforeChange: [enforceTaxonomyTenantBoundary] },
  fields: [
    ...taxonomyScope,
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, validate: canonicalSlug },
    { name: 'description', type: 'textarea' },
    { name: 'sortOrder', type: 'number', defaultValue: 0 },
  ],
  indexes: [{ fields: ['site', 'publication', 'slug'], unique: true }],
}

export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: { useAsTitle: 'name', group: 'Taxonomy' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  hooks: {
    beforeDelete: [refuseReferencedTaxonomyDeletion('categories')],
    beforeChange: [
      enforceTaxonomyTenantBoundary,
      async ({ data, originalDoc, req }) => {
        const parentId = typeof data?.parent === 'string' ? data.parent : data?.parent?.id
        if (!parentId) return data
        if (parentId === originalDoc?.id) throw new Error('A category cannot be its own parent.')

        const visited = new Set<string>([String(originalDoc?.id ?? '')])
        let currentId: string | undefined = parentId
        while (currentId) {
          if (visited.has(currentId))
            throw new Error('A category cannot be moved below one of its descendants.')
          visited.add(currentId)
          const current = await req.payload.findByID({
            collection: 'categories',
            id: currentId,
            depth: 0,
          })
          currentId = typeof current.parent === 'string' ? current.parent : current.parent?.id
        }
        return data
      },
    ],
  },
  fields: [
    ...taxonomyScope,
    { name: 'section', type: 'relationship', relationTo: 'sections' },
    { name: 'parent', type: 'relationship', relationTo: 'categories', index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, validate: canonicalSlug },
    { name: 'canonicalPath', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'sortOrder', type: 'number', defaultValue: 0 },
  ],
  indexes: [{ fields: ['site', 'publication', 'parent', 'slug'], unique: true }],
}

const simpleTaxonomy = (slug: string, label: string): CollectionConfig => ({
  slug,
  admin: { useAsTitle: 'name', group: 'Taxonomy' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  hooks: {
    beforeChange: [enforceTaxonomyTenantBoundary],
    beforeDelete: [refuseReferencedTaxonomyDeletion(slug)],
  },
  fields: [
    ...taxonomyScope,
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, validate: canonicalSlug },
    { name: 'description', type: 'textarea' },
    {
      name: 'sortOrder',
      type: 'number',
      defaultValue: 0,
      admin: { description: `${label} ordering.` },
    },
  ],
  indexes: [{ fields: ['site', 'publication', 'slug'], unique: true }],
})

export const Topics = simpleTaxonomy('topics', 'Topic')
export const Tags = simpleTaxonomy('tags', 'Tag')
export const Series = simpleTaxonomy('series', 'Series')

export const TaxonomyRedirects: CollectionConfig = {
  slug: 'taxonomy-redirects',
  admin: { useAsTitle: 'fromPath', group: 'Taxonomy' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
    { name: 'fromPath', type: 'text', required: true, unique: true },
    { name: 'toPath', type: 'text', required: true },
    { name: 'reason', type: 'select', required: true, options: ['rename', 'move'] },
    { name: 'targetCategory', type: 'relationship', relationTo: 'categories' },
  ],
}

/** Public redirects are site-scoped and intentionally separate from taxonomy move history. */
export const PublicRedirects: CollectionConfig = {
  slug: 'public-redirects',
  admin: { useAsTitle: 'fromPath', group: 'Publishing' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        const from = String(data?.fromPath ?? '')
        const to = String(data?.toPath ?? '')
        if (
          !from.startsWith('/') ||
          from.startsWith('//') ||
          !to.startsWith('/') ||
          to.startsWith('//')
        )
          throw new Error('Redirect paths must remain on this site.')
        if (from === to) throw new Error('A redirect cannot target itself.')
        if (data?.match === 'regex')
          try {
            new RegExp(from)
          } catch {
            throw new Error('Redirect regex is invalid.')
          }
        return data
      },
    ],
  },
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
    { name: 'fromPath', type: 'text', required: true },
    { name: 'toPath', type: 'text', required: true },
    {
      name: 'match',
      type: 'select',
      required: true,
      defaultValue: 'exact',
      options: ['exact', 'prefix', 'regex'],
    },
    {
      name: 'statusCode',
      type: 'select',
      required: true,
      defaultValue: '308',
      options: ['301', '302', '307', '308'],
    },
    { name: 'preserveQuery', type: 'checkbox', defaultValue: true },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    {
      name: 'hitCount',
      type: 'number',
      required: true,
      defaultValue: 0,
      admin: { readOnly: true },
    },
    { name: 'lastHitAt', type: 'date', admin: { readOnly: true } },
  ],
  indexes: [{ fields: ['site', 'fromPath'], unique: true }],
}

export const Content: CollectionConfig = {
  slug: 'content',
  labels: { singular: 'Post or Page', plural: 'All content' },
  admin: {
    useAsTitle: 'title',
    group: 'Publishing',
    defaultColumns: ['title', 'contentType', 'status', 'canonicalPath', 'updatedAt'],
    description:
      'Posts and Pages share one editorial record. Use the Posts and Pages links for focused work.',
  },
  // Public pages query through the explicit publication renderer; Payload's raw
  // REST/GraphQL collection surface must not disclose drafts or private records.
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  hooks: {
    beforeValidate: [
      async ({ data, originalDoc, req }) => {
        const resolved = await deriveEditorialPath({
          data: (data ?? {}) as Record<string, unknown>,
          originalDoc: originalDoc as Record<string, unknown> | null,
          payload: req.payload as never,
        })
        await assertEditorialPathAvailable({
          data: resolved,
          originalDoc: originalDoc as Record<string, unknown> | null,
          payload: req.payload as never,
        })
        return resolved
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        await ensureEditorialCompanion(req.payload, doc as Record<string, unknown>, req)
        if (operation !== 'update') return doc
        const fromPath =
          typeof previousDoc?.canonicalPath === 'string' ? previousDoc.canonicalPath : ''
        const toPath = typeof doc?.canonicalPath === 'string' ? doc.canonicalPath : ''
        const site = typeof doc?.site === 'string' ? doc.site : doc?.site?.id
        // Canonical path (normally derived from a slug) is the durable public URL contract.
        if (!site || !fromPath || !toPath || fromPath === toPath) return doc
        const existing = await req.payload.find({
          collection: 'public-redirects',
          where: { and: [{ site: { equals: site } }, { fromPath: { equals: fromPath } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        } as never)
        if (!existing.docs.length)
          await req.payload.create({
            collection: 'public-redirects',
            data: {
              site,
              fromPath,
              toPath,
              match: 'exact',
              statusCode: '308',
              preserveQuery: true,
              enabled: true,
            },
            overrideAccess: true,
          } as never)
        return doc
      },
    ],
  },
  fields: publisherFieldGroups([
    ...ownerFields(),
    {
      name: 'contentType',
      type: 'select',
      required: true,
      options: ['article', 'page', 'book', 'podcast', 'video', 'product', 'event', 'campaign'],
    },
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      validate: canonicalSlug,
      admin: { description: 'Generated from the title until you choose a different URL slug.' },
    },
    {
      name: 'pathOverride',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Keep a manually chosen canonical path instead of deriving it from the slug.',
      },
    },
    { name: 'canonicalPath', type: 'text', required: true, admin: { readOnly: true } },
    {
      name: 'parentPage',
      type: 'relationship',
      relationTo: 'content',
      admin: {
        condition: (_, siblingData) => siblingData.contentType === 'page',
        description: 'Optional parent Page. Its path becomes the prefix for this page.',
      },
      filterOptions: { contentType: { equals: 'page' } },
    },
    {
      name: 'pageTemplate',
      type: 'select',
      defaultValue: 'standard',
      options: ['standard', 'landing', 'about', 'contact', 'legal'],
      admin: { condition: (_, siblingData) => siblingData.contentType === 'page' },
    },
    {
      name: 'body',
      type: 'richText',
      admin: {
        description:
          'Structured, accessible prose. Use the editor controls for headings, links, lists, quotes, and safe inline references—not raw HTML or JSON.',
      },
    },
    { name: 'summary', type: 'textarea' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        'draft',
        'review',
        'approved',
        'scheduled',
        'published',
        'updated',
        'archived',
        'rejected',
      ],
    },
    { name: 'publishedAt', type: 'date' },
    { name: 'updatedAtEditorial', type: 'date' },
    { name: 'subtitle', type: 'text' },
    { name: 'excerpt', type: 'textarea' },
    {
      name: 'authors',
      type: 'array',
      fields: [
        { name: 'author', type: 'relationship', relationTo: 'authors', required: true },
        { name: 'displayOrder', type: 'number', required: true, defaultValue: 0 },
        { name: 'role', type: 'text' },
      ],
    },
    { name: 'sections', type: 'relationship', relationTo: 'sections', hasMany: true },
    { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true },
    { name: 'topics', type: 'relationship', relationTo: 'topics', hasMany: true },
    { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
    { name: 'series', type: 'relationship', relationTo: 'series', hasMany: true },
    { name: 'heroMedia', type: 'relationship', relationTo: 'media-assets' },
    { name: 'featured', type: 'checkbox', defaultValue: false },
    { name: 'pinned', type: 'checkbox', defaultValue: false },
    { name: 'readingTimeMinutes', type: 'number', min: 0 },
    { name: 'tableOfContents', type: 'json' },
    {
      name: 'relatedContent',
      type: 'relationship',
      relationTo: 'content',
      hasMany: true,
    },
    {
      name: 'correctionNotices',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'detail', type: 'textarea', required: true },
        { name: 'issuedAt', type: 'date', required: true },
      ],
    },
    {
      name: 'changeNotes',
      type: 'array',
      fields: [
        { name: 'summary', type: 'textarea', required: true },
        { name: 'issuedAt', type: 'date', required: true },
      ],
    },
    ...seoFields(),
    { name: 'relationships', type: 'relationship', relationTo: 'relationships', hasMany: true },
    { name: 'seoOverride', type: 'json' },
    { name: 'socialOverride', type: 'json' },
    ...structuredDataSourceFields(),
    ...knowledgeGraphProjectionFields(),
    ...importExportHookFields(),
    {
      name: 'commentsPolicy',
      type: 'select',
      required: true,
      defaultValue: 'open',
      options: ['open', 'members', 'closed'],
    },
    { name: 'revisionCompatibility', type: 'json' },
    { name: 'auditMetadata', type: 'json' },
    {
      name: 'publicChangeHistoryPolicy',
      type: 'select',
      required: true,
      defaultValue: 'summary',
      options: ['hidden', 'summary', 'full'],
    },
    ...retentionFields(),
  ]),
  indexes: [{ fields: ['publication', 'slug'], unique: true }],
}

export const ArticleFamilyContent: CollectionConfig = {
  slug: 'article-family-content',
  admin: { useAsTitle: 'articleKey', group: 'Publishing' },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    {
      name: 'content',
      type: 'relationship',
      relationTo: 'content',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'articleKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'lifecycle',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [...editorialLifecycleOptions],
    },
    { name: 'document', type: 'json', required: true },
    { name: 'documentHash', type: 'text', required: true },
    { name: 'plainTextProjection', type: 'textarea', required: true },
    { name: 'currentRevisionSequence', type: 'number', required: true, defaultValue: 1 },
    { name: 'currentRevision', type: 'relationship', relationTo: 'revision-records' as never },
    {
      name: 'latestPublishedRevision',
      type: 'relationship',
      relationTo: 'revision-records' as never,
    },
    { name: 'firstPublishedAt', type: 'date' },
    { name: 'lastPreviewedAt', type: 'date' },
    {
      name: 'previewModes',
      type: 'select',
      hasMany: true,
      defaultValue: ['desktop', 'mobile'],
      options: ['desktop', 'mobile'],
    },
    {
      name: 'permissions',
      type: 'array',
      fields: [
        { name: 'user', type: 'relationship', relationTo: 'users', required: true },
        {
          name: 'actions',
          type: 'select',
          hasMany: true,
          required: true,
          options: [...editorialActionOptions],
        },
        { name: 'grantedAt', type: 'date', required: true },
        { name: 'expiresAt', type: 'date' },
      ],
    },
    {
      name: 'sourceReferences',
      type: 'array',
      fields: [
        { name: 'sourceReferenceId', type: 'text', required: true },
        { name: 'source', type: 'relationship', relationTo: 'sources', required: true },
        { name: 'locator', type: 'text' },
        { name: 'bibliographyKey', type: 'text', required: true },
        {
          name: 'publicVisibility',
          type: 'select',
          required: true,
          defaultValue: 'public',
          options: ['public', 'staff'],
        },
      ],
    },
    {
      name: 'citations',
      type: 'array',
      fields: [
        { name: 'citationId', type: 'text', required: true },
        { name: 'sourceReferenceId', type: 'text', required: true },
        { name: 'nodeKey', type: 'text', required: true },
        { name: 'offsetStart', type: 'number', required: true },
        { name: 'offsetEnd', type: 'number', required: true },
        { name: 'ordinal', type: 'number', required: true },
        { name: 'passageChecksum', type: 'text' },
      ],
    },
    {
      name: 'citationAttachments',
      type: 'array',
      fields: [
        { name: 'citationId', type: 'text', required: true },
        { name: 'media', type: 'relationship', relationTo: 'media-assets', required: true },
        {
          name: 'role',
          type: 'select',
          required: true,
          options: ['excerpt', 'scan', 'transcript', 'supporting-document'],
        },
        { name: 'checksum', type: 'text', required: true },
      ],
    },
    { name: 'bibliography', type: 'json' },
    { name: 'workflowAudit', type: 'json', required: true, defaultValue: [] },
    { name: 'acceptedMutationKeys', type: 'json', required: true, defaultValue: [] },
    { name: 'revisionComparison', type: 'json' },
    { name: 'promotionProvenance', type: 'json' },
  ],
}

export const MarkdownConversionReports: CollectionConfig = {
  slug: 'markdown-conversion-reports',
  admin: { useAsTitle: 'sourceChecksum', group: 'Publishing' },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'article-family-content' as never,
      index: true,
    },
    { name: 'sourceChecksum', type: 'text', required: true, index: true },
    { name: 'targetDocumentHash', type: 'text' },
    { name: 'formatVersion', type: 'number', required: true, defaultValue: 1 },
    {
      name: 'status',
      type: 'select',
      required: true,
      options: ['accepted', 'accepted-with-warnings', 'rejected'],
    },
    { name: 'fidelityBoundary', type: 'json', required: true },
    { name: 'warnings', type: 'json', required: true, defaultValue: [] },
    { name: 'unsupportedConstructs', type: 'json', required: true, defaultValue: [] },
    { name: 'createdBy', type: 'relationship', relationTo: 'users' },
  ],
}

export const RevisionRecords: CollectionConfig = {
  slug: 'revision-records',
  admin: { useAsTitle: 'sequence', group: 'Publishing' },
  // Revision records are append-only evidence. Restoration creates a new record
  // linked to the retained historical revision rather than mutating history.
  access: { create: staffOnly, delete: () => false, read: staffOnly, update: () => false },
  fields: [
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'article-family-content' as never,
      required: true,
      index: true,
    },
    {
      name: 'parentRevision',
      type: 'relationship',
      relationTo: 'revision-records' as never,
      index: true,
    },
    {
      name: 'restoredFromRevision',
      type: 'relationship',
      relationTo: 'revision-records' as never,
    },
    { name: 'sequence', type: 'number', required: true },
    { name: 'document', type: 'json', required: true },
    { name: 'documentHash', type: 'text', required: true },
    { name: 'integrityHash', type: 'text', required: true },
    {
      name: 'reason',
      type: 'select',
      required: true,
      options: ['created', 'edited', 'reviewed', 'published', 'restored', 'imported'],
    },
    { name: 'immutable', type: 'checkbox', required: true, defaultValue: true },
    { name: 'createdBy', type: 'relationship', relationTo: 'users' },
  ],
  indexes: [{ fields: ['article', 'sequence'], unique: true }],
}

export const PreviewTokens: CollectionConfig = {
  slug: 'preview-tokens',
  admin: { useAsTitle: 'tokenHash', group: 'Publishing' },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'article-family-content' as never,
      required: true,
      index: true,
    },
    { name: 'revision', type: 'relationship', relationTo: 'revision-records' as never },
    { name: 'tokenHash', type: 'text', required: true, unique: true, index: true },
    {
      name: 'scope',
      type: 'select',
      required: true,
      defaultValue: 'article-preview',
      options: ['article-preview'],
    },
    { name: 'expiresAt', type: 'date', required: true },
    { name: 'revokedAt', type: 'date' },
    { name: 'createdBy', type: 'relationship', relationTo: 'users' },
  ],
}

export const ScheduledPublishJobs: CollectionConfig = {
  slug: 'scheduled-publish-jobs',
  admin: { useAsTitle: 'idempotencyKey', group: 'Publishing' },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'article-family-content' as never,
      required: true,
      index: true,
    },
    {
      name: 'job',
      type: 'relationship',
      relationTo: 'payload-jobs',
      index: true,
    },
    {
      name: 'revision',
      type: 'relationship',
      relationTo: 'revision-records' as never,
      required: true,
      index: true,
    },
    { name: 'scheduledFor', type: 'date', required: true, index: true },
    { name: 'timeZone', type: 'text', required: true },
    { name: 'idempotencyKey', type: 'text', required: true, unique: true, index: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending-contract',
      options: ['pending-contract', 'queued', 'completed', 'cancelled', 'failed'],
    },
    { name: 'createdBy', type: 'relationship', relationTo: 'users' },
  ],
}

export const Events: CollectionConfig = {
  slug: 'events',
  admin: { useAsTitle: 'title', group: 'Calendar' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data) assertEvent(data as Parameters<typeof assertEvent>[0])
        return data
      },
    ],
  },
  fields: [
    ...ownerFields(),
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, validate: canonicalSlug },
    { name: 'canonicalPath', type: 'text', required: true, unique: true },
    { name: 'summary', type: 'textarea' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: ['draft', 'scheduled', 'published', 'cancelled', 'archived'],
    },
    { name: 'allDay', type: 'checkbox', defaultValue: false },
    { name: 'startsAt', type: 'date', required: true },
    { name: 'endsAt', type: 'date' },
    {
      name: 'timeZone',
      type: 'text',
      required: true,
      defaultValue: 'UTC',
      admin: { description: 'IANA timezone for the event start and end values.' },
    },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'public',
      options: visibilityOptions,
    },
    { name: 'venueName', type: 'text' },
    { name: 'venueRegion', type: 'text' },
    { name: 'venueAddress', type: 'textarea' },
    {
      name: 'attendanceMode',
      type: 'select',
      required: true,
      defaultValue: 'in-person',
      options: ['in-person', 'virtual', 'hybrid'],
    },
    {
      name: 'onlineUrl',
      type: 'text',
      admin: { description: 'Meeting or livestream URL; required for virtual events.' },
    },
    { name: 'organizerName', type: 'text' },
    { name: 'organizerUrl', type: 'text' },
    { name: 'capacity', type: 'number', min: 1 },
    {
      name: 'registrationUrl',
      type: 'text',
      admin: {
        description: 'External registration only; ticketing and payments are not part of Events.',
      },
    },
    {
      name: 'recurrence',
      type: 'json',
      admin: {
        description:
          'Optional daily, weekly, or monthly series. Expansion is limited to 250 occurrences / 366 days.',
      },
    },
    {
      name: 'recurrenceOverrides',
      type: 'json',
      admin: {
        description:
          'Edit one occurrence by its original ISO start instant; edit the series by changing this event. Cancelled overrides suppress only that occurrence.',
      },
    },
    { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true },
    {
      name: 'relatedContent',
      type: 'relationship',
      relationTo: ['content', 'events'],
      hasMany: true,
    },
    { name: 'heroMedia', type: 'relationship', relationTo: 'media-assets' },
    { name: 'calendarEntry', type: 'relationship', relationTo: 'calendar-entries', index: true },
    { name: 'audience', type: 'json' },
    ...seoFields(),
    ...structuredDataSourceFields(),
    ...knowledgeGraphProjectionFields(),
    ...importExportHookFields(),
    ...publicRenderHookFields('event'),
    ...milestoneSixPresentationHookFields(),
    ...retentionFields(),
  ],
  indexes: [{ fields: ['publication', 'slug'], unique: true }],
}

export const Timelines: CollectionConfig = {
  slug: 'timelines',
  admin: { useAsTitle: 'title', group: 'Calendar' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  fields: [
    ...ownerFields(),
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, validate: canonicalSlug },
    { name: 'canonicalPath', type: 'text', required: true, unique: true },
    { name: 'summary', type: 'textarea' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: ['draft', 'published', 'archived'],
    },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'public',
      options: visibilityOptions,
    },
    {
      name: 'orderingMode',
      type: 'select',
      required: true,
      defaultValue: 'chronological',
      options: ['chronological', 'manual'],
    },
    { name: 'heroMedia', type: 'relationship', relationTo: 'media-assets' },
    {
      name: 'postgresQueryScope',
      type: 'json',
      admin: {
        description:
          'Canonical timeline query boundary. PostgreSQL remains the source of truth before any optional graph projection.',
      },
    },
    ...seoFields(),
    ...structuredDataSourceFields(),
    ...knowledgeGraphProjectionFields(),
    ...importExportHookFields(),
    ...publicRenderHookFields('timeline'),
    ...milestoneSixPresentationHookFields(),
    ...retentionFields(),
  ],
  indexes: [{ fields: ['publication', 'slug'], unique: true }],
}

export const TimelineMemberships: CollectionConfig = {
  slug: 'timeline-memberships',
  admin: { useAsTitle: 'membershipKey', group: 'Calendar' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data?.timeline && data?.event) {
          const timeline = typeof data.timeline === 'string' ? data.timeline : data.timeline.value
          const event = typeof data.event === 'string' ? data.event : data.event.value
          data.membershipKey = `${timeline}:${event}`
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'timeline',
      type: 'relationship',
      relationTo: 'timelines',
      required: true,
      index: true,
    },
    {
      name: 'event',
      type: 'relationship',
      relationTo: 'events',
      required: true,
      index: true,
    },
    {
      name: 'membershipKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
    { name: 'displayTitle', type: 'text' },
    { name: 'displaySummary', type: 'textarea' },
    { name: 'eraLabel', type: 'text' },
    { name: 'position', type: 'number', defaultValue: 0 },
    { name: 'displayStartsAt', type: 'date' },
    { name: 'displayEndsAt', type: 'date' },
    { name: 'renderVariant', type: 'text' },
  ],
}

export const Sources: CollectionConfig = {
  slug: 'sources',
  admin: { useAsTitle: 'title', group: 'Publishing' },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    ...siteScopeFields(),
    { name: 'title', type: 'text', required: true },
    { name: 'publisher', type: 'text' },
    { name: 'authors', type: 'json' },
    { name: 'url', type: 'text', required: true, unique: true },
    { name: 'publishedAt', type: 'date' },
    { name: 'accessedAt', type: 'date' },
    {
      name: 'sourceType',
      type: 'select',
      required: true,
      options: ['article', 'book', 'report', 'dataset', 'interview', 'website', 'other'],
    },
    { name: 'excerpt', type: 'textarea' },
    { name: 'quoteMetadata', type: 'json' },
    {
      name: 'archiveMetadata',
      type: 'json',
      admin: { description: 'Placeholder for future archive capture.' },
    },
    { name: 'credibilityNotes', type: 'textarea', access: { read: staffOnly } },
    { name: 'editorialNotes', type: 'textarea', access: { read: staffOnly } },
    { name: 'reuseNotes', type: 'textarea' },
  ],
}

export const Albums: CollectionConfig = {
  slug: 'albums',
  admin: { useAsTitle: 'title', group: 'Media' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  fields: [
    ...ownerFields(),
    { name: 'kind', type: 'select', required: true, options: ['album', 'portfolio'] },
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, validate: canonicalSlug },
    { name: 'canonicalPath', type: 'text', required: true, unique: true },
    { name: 'description', type: 'textarea' },
    { name: 'cover', type: 'relationship', relationTo: 'media-assets' },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'public',
      options: visibilityOptions,
    },
    {
      name: 'items',
      type: 'array',
      fields: [
        { name: 'media', type: 'relationship', relationTo: 'media-assets', required: true },
        { name: 'displayOrder', type: 'number', required: true, defaultValue: 0 },
        { name: 'caption', type: 'textarea' },
        { name: 'altText', type: 'text' },
        { name: 'credits', type: 'text' },
        { name: 'license', type: 'text' },
      ],
    },
    {
      name: 'originalDownloadPolicy',
      type: 'select',
      required: true,
      defaultValue: 'allowed',
      options: ['allowed', 'members', 'disallowed'],
    },
    {
      name: 'exifPolicy',
      type: 'select',
      required: true,
      defaultValue: 'strip',
      options: ['strip', 'private', 'display'],
    },
    {
      name: 'commentsPolicy',
      type: 'select',
      required: true,
      defaultValue: 'open',
      options: ['open', 'members', 'closed'],
    },
    {
      name: 'moderationState',
      type: 'select',
      required: true,
      defaultValue: 'clear',
      options: moderationStateOptions,
    },
    { name: 'exportRequestedAt', type: 'date' },
    ...retentionFields(),
  ],
  indexes: [{ fields: ['publication', 'slug'], unique: true }],
}

export const MediaUsages: CollectionConfig = {
  slug: 'media-usages',
  admin: { useAsTitle: 'usageKey', group: 'Media' },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    {
      name: 'media',
      type: 'relationship',
      relationTo: 'media-assets',
      required: true,
      index: true,
    },
    {
      name: 'usedBy',
      type: 'relationship',
      relationTo: [
        'content',
        'albums',
        'discussions',
        'discussion-posts',
        'events',
        'timelines',
        'email-messages',
      ] as never,
      required: true,
      index: true,
    },
    { name: 'usageKey', type: 'text', required: true, unique: true, index: true },
    {
      name: 'purpose',
      type: 'select',
      required: true,
      options: ['hero', 'inline', 'cover', 'attachment', 'avatar', 'thumbnail', 'newsletter'],
    },
    { name: 'replaceGlobally', type: 'checkbox', defaultValue: false },
  ],
}
