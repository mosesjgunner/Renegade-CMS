import { randomUUID } from 'crypto'
import type { CollectionConfig } from 'payload'
import {
  canonicalSlug,
  ownerFields,
  seoFields,
  structuredDataSourceFields,
} from './canonical-shared'
import { searchProjectionHooks } from '../modules/public/search-projection'

const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))
const scoped = (canonicalContentType?: string) => [
  ...ownerFields(),
  { name: 'title', type: 'text' as const, required: true },
  { name: 'slug', type: 'text' as const, required: true, validate: canonicalSlug },
  {
    name: 'content',
    type: 'relationship' as const,
    relationTo: 'content' as const,
    required: false,
    index: true,
    ...(canonicalContentType
      ? { filterOptions: { contentType: { equals: canonicalContentType } } }
      : {}),
    admin: {
      description:
        'Canonical editorial record. Revisions, preview, scheduling, and publication remain owned by the shared content workflow.',
    },
  },
  { name: 'canonicalPath', type: 'text' as const },
  { name: 'description', type: 'textarea' as const },
  {
    name: 'status',
    type: 'select' as const,
    required: true,
    defaultValue: 'draft',
    options: ['draft', 'scheduled', 'published', 'updated', 'unavailable'],
  },
  { name: 'publishedAt', type: 'date' as const },
  ...seoFields(),
  ...structuredDataSourceFields(),
]
const collection = (slug: string, fields: CollectionConfig['fields']): CollectionConfig => ({
  slug,
  admin: { useAsTitle: 'title', group: 'Media publishing' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  fields,
  hooks: searchProjectionHooks(slug),
})

export const Books = collection('books', [
  ...scoped(),
  {
    name: 'visibility',
    type: 'select',
    required: true,
    defaultValue: 'public',
    options: ['public', 'unlisted', 'members', 'private'],
  },
  { name: 'isbn', type: 'text' },
  { name: 'purchaseLinks', type: 'json' },
  { name: 'downloadLinks', type: 'json' },
  { name: 'cover', type: 'relationship', relationTo: 'media-assets' },
  { name: 'serializedRelease', type: 'checkbox', defaultValue: false },
  { name: 'relatedMedia', type: 'relationship', relationTo: 'media-assets', hasMany: true },
])
export const BookParts = collection('book-parts', [
  { name: 'book', type: 'relationship', relationTo: 'books' as never, required: true, index: true },
  { name: 'title', type: 'text', required: true },
  { name: 'displayOrder', type: 'number', required: true },
])
export const BookChapters: CollectionConfig = {
  ...collection('book-chapters', [
    {
      name: 'book',
      type: 'relationship',
      relationTo: 'books' as never,
      required: true,
      index: true,
    },
    { name: 'part', type: 'relationship', relationTo: 'book-parts' as never },
    { name: 'content', type: 'relationship', relationTo: 'content' },
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, validate: canonicalSlug },
    { name: 'canonicalPath', type: 'text', required: true, unique: true },
    { name: 'displayOrder', type: 'number', required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: ['draft', 'review', 'scheduled', 'published', 'updated', 'archived'],
    },
    { name: 'publishedAt', type: 'date' },
    { name: 'releaseAt', type: 'date' },
    { name: 'preview', type: 'checkbox', defaultValue: false },
    { name: 'footnotes', type: 'json' },
  ]),
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        if (
          operation !== 'update' ||
          !previousDoc?.canonicalPath ||
          previousDoc.canonicalPath === doc.canonicalPath
        )
          return doc
        const book = await req.payload.findByID({
          collection: 'books',
          id: typeof doc.book === 'string' ? doc.book : doc.book?.id,
          depth: 0,
          overrideAccess: true,
        } as never)
        const scopedBook = book as unknown as { site?: string | { id?: string } }
        const site = typeof scopedBook.site === 'string' ? scopedBook.site : scopedBook.site?.id
        if (!site) return doc
        const exists = await req.payload.find({
          collection: 'public-redirects',
          where: {
            and: [{ site: { equals: site } }, { fromPath: { equals: previousDoc.canonicalPath } }],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        } as never)
        if (!exists.docs.length)
          await req.payload.create({
            collection: 'public-redirects',
            data: {
              site,
              fromPath: previousDoc.canonicalPath,
              toPath: doc.canonicalPath,
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
}
export const BookEditions = collection('book-editions', [
  { name: 'book', type: 'relationship', relationTo: 'books' as never, required: true, index: true },
  { name: 'title', type: 'text', required: true },
  { name: 'isbn', type: 'text' },
  { name: 'format', type: 'select', options: ['hardcover', 'paperback', 'ebook', 'audiobook'] },
  { name: 'publishedAt', type: 'date' },
  { name: 'download', type: 'relationship', relationTo: 'media-assets' },
])
export const PodcastShows: CollectionConfig = {
  ...collection('podcast-shows', [
    ...scoped(),
    { name: 'language', type: 'text', defaultValue: 'en' },
    { name: 'explicit', type: 'checkbox', defaultValue: false },
    { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true },
    { name: 'rssEnabled', type: 'checkbox', defaultValue: false },
    { name: 'externalFeedUrl', type: 'text' },
    {
      name: 'importOwnership',
      type: 'select',
      defaultValue: 'local',
      options: ['local', 'claimed-import'],
    },
    { name: 'importSourceChecksum', type: 'text' },
    { name: 'artwork', type: 'relationship', relationTo: 'media-assets' },
    { name: 'hosts', type: 'relationship', relationTo: 'authors', hasMany: true },
    { name: 'authors', type: 'relationship', relationTo: 'authors', hasMany: true },
    { name: 'body', type: 'textarea' },
  ]),
  hooks: {
    beforeChange: [
      async ({ data, originalDoc }) => {
        if (
          data &&
          data.slug &&
          (!data.canonicalPath || (originalDoc && originalDoc.slug !== data.slug))
        ) {
          data.canonicalPath = `/podcasts/${data.slug}`
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        if (!previousDoc?.canonicalPath || !doc?.canonicalPath) return doc
        if (previousDoc.canonicalPath === doc.canonicalPath) return doc
        const siteId = typeof doc.site === 'string' ? doc.site : doc.site?.id
        if (!siteId) return doc
        const exists = await req.payload
          .find({
            collection: 'public-redirects',
            where: {
              and: [
                { site: { equals: siteId } },
                { fromPath: { equals: previousDoc.canonicalPath } },
              ],
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          } as never)
          .catch(() => ({ docs: [] }))
        if (!exists.docs.length) {
          await req.payload.create({
            collection: 'public-redirects',
            data: {
              site: siteId,
              fromPath: previousDoc.canonicalPath,
              toPath: doc.canonicalPath,
              match: 'exact',
              statusCode: '308',
              preserveQuery: true,
              enabled: true,
            },
            overrideAccess: true,
          } as never)
        }
        return doc
      },
      ...searchProjectionHooks('podcast-shows').afterChange,
    ],
    afterDelete: searchProjectionHooks('podcast-shows').afterDelete,
  },
}
export const PodcastSeasons = collection('podcast-seasons', [
  {
    name: 'show',
    type: 'relationship',
    relationTo: 'podcast-shows' as never,
    required: true,
    index: true,
  },
  { name: 'title', type: 'text', required: true },
  { name: 'number', type: 'number', required: true },
])
export const PodcastEpisodes: CollectionConfig = {
  ...collection('podcast-episodes', [
    ...scoped(),
    {
      name: 'show',
      type: 'relationship',
      relationTo: 'podcast-shows' as never,
      required: true,
      index: true,
    },
    { name: 'season', type: 'relationship', relationTo: 'podcast-seasons' as never },
    { name: 'seasonNumber', type: 'number' },
    { name: 'audio', type: 'relationship', relationTo: 'media-assets', required: true },
    { name: 'artwork', type: 'relationship', relationTo: 'media-assets' },
    { name: 'explicit', type: 'checkbox', defaultValue: false },
    { name: 'language', type: 'text' },
    { name: 'guid', type: 'text', unique: true, index: true, admin: { readOnly: true } },
    { name: 'downloadableFiles', type: 'relationship', relationTo: 'media-assets', hasMany: true },
    { name: 'credits', type: 'textarea' },
    { name: 'rights', type: 'json' },
    { name: 'externalUrl', type: 'text' },
    { name: 'providerIdentity', type: 'text', unique: true, index: true },
    { name: 'episodeNumber', type: 'number' },
    { name: 'showNotes', type: 'json' },
    { name: 'body', type: 'textarea' },
    { name: 'enclosureBytes', type: 'number', min: 0 },
    { name: 'enclosureMimeType', type: 'text' },
    { name: 'importSourceChecksum', type: 'text' },
    { name: 'authors', type: 'relationship', relationTo: 'authors', hasMany: true },
    { name: 'guests', type: 'relationship', relationTo: 'authors', hasMany: true },
    { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true },
    { name: 'chapters', type: 'json' },
    { name: 'transcript', type: 'relationship', relationTo: 'transcript-revisions' as never },
  ]),
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        if (!data) return data
        if (originalDoc?.guid) {
          data.guid = originalDoc.guid
        } else if (!data.guid) {
          const showId =
            typeof data.show === 'string'
              ? data.show
              : (data.show as { id?: string } | null | undefined)?.id
          data.guid = `urn:renegade:podcast:${showId ?? 'show'}:${randomUUID()}`
        }
        if (data.slug && (!data.canonicalPath || (originalDoc && originalDoc.slug !== data.slug))) {
          data.canonicalPath = `/podcasts/episodes/${data.slug}`
        }
        if ((!data.enclosureBytes || !data.enclosureMimeType) && data.audio && req?.payload) {
          try {
            const audioId =
              typeof data.audio === 'string' ? data.audio : (data.audio as { id?: string })?.id
            if (audioId) {
              const asset = await req.payload.findByID({
                collection: 'media-assets',
                id: audioId,
                depth: 0,
              })
              if (asset) {
                if (!data.enclosureBytes && asset.sizeBytes)
                  data.enclosureBytes = Number(asset.sizeBytes)
                if (!data.enclosureMimeType && asset.mimeType)
                  data.enclosureMimeType = String(asset.mimeType)
              }
            }
          } catch {
            // Ignore asset lookup failure
          }
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        if (!previousDoc?.canonicalPath || !doc?.canonicalPath) return doc
        if (previousDoc.canonicalPath === doc.canonicalPath) return doc
        let siteId = typeof doc.site === 'string' ? doc.site : doc.site?.id
        if (!siteId && doc.show) {
          const showDoc = (await req.payload
            .findByID({
              collection: 'podcast-shows',
              id: typeof doc.show === 'string' ? doc.show : doc.show?.id,
              depth: 0,
              overrideAccess: true,
            } as never)
            .catch(() => null)) as { site?: string | { id?: string } } | null
          siteId = typeof showDoc?.site === 'string' ? showDoc.site : showDoc?.site?.id
        }
        if (!siteId) return doc
        const exists = await req.payload
          .find({
            collection: 'public-redirects',
            where: {
              and: [
                { site: { equals: siteId } },
                { fromPath: { equals: previousDoc.canonicalPath } },
              ],
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          } as never)
          .catch(() => ({ docs: [] }))
        if (!exists.docs.length) {
          await req.payload.create({
            collection: 'public-redirects',
            data: {
              site: siteId,
              fromPath: previousDoc.canonicalPath,
              toPath: doc.canonicalPath,
              match: 'exact',
              statusCode: '308',
              preserveQuery: true,
              enabled: true,
            },
            overrideAccess: true,
          } as never)
        }
        return doc
      },
      ...searchProjectionHooks('podcast-episodes').afterChange,
    ],
    afterDelete: searchProjectionHooks('podcast-episodes').afterDelete,
  },
}
export const VideoChannels = collection('video-channels', [
  ...scoped(),
  { name: 'provider', type: 'text', required: true },
  { name: 'externalId', type: 'text', required: true },
  { name: 'lastSyncedAt', type: 'date' },
  { name: 'syncClaimed', type: 'checkbox', defaultValue: false },
])
export const VideoPlaylists = collection('video-playlists', [
  ...scoped(),
  { name: 'channel', type: 'relationship', relationTo: 'video-channels' as never, required: true },
  { name: 'externalId', type: 'text', required: true },
])
export const Videos: CollectionConfig = {
  ...collection('videos', [
    ...scoped('video'),
    { name: 'channel', type: 'relationship', relationTo: 'video-channels' as never },
    { name: 'playlist', type: 'relationship', relationTo: 'video-playlists' as never },
    { name: 'provider', type: 'text', required: true, defaultValue: 'native' },
    { name: 'externalId', type: 'text' },
    { name: 'providerIdentity', type: 'text', unique: true, index: true },
    { name: 'embedUrl', type: 'text' },
    { name: 'body', type: 'textarea' },
    { name: 'creators', type: 'relationship', relationTo: 'authors', hasMany: true },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'public',
      options: ['public', 'unlisted', 'members', 'private'],
    },
    { name: 'rights', type: 'json' },
    { name: 'sourceAsset', type: 'relationship', relationTo: 'media-assets' },
    { name: 'videoAsset', type: 'relationship', relationTo: 'video-assets' as never },
    { name: 'nativeMedia', type: 'relationship', relationTo: 'media-assets' },
    { name: 'poster', type: 'relationship', relationTo: 'media-assets' },
    { name: 'thumbnail', type: 'relationship', relationTo: 'media-assets' },
    {
      name: 'captions',
      type: 'relationship',
      relationTo: 'video-captions' as never,
      hasMany: true,
    },
    {
      name: 'availability',
      type: 'select',
      required: true,
      defaultValue: 'available',
      options: ['available', 'unavailable', 'removed'],
    },
    { name: 'providerSourceChecksum', type: 'text' },
    { name: 'transcript', type: 'relationship', relationTo: 'transcript-revisions' as never },
    { name: 'chapters', type: 'json' },
    { name: 'derivesFrom', type: 'relationship', relationTo: 'videos' as never },
    {
      name: 'distributionClips',
      type: 'json',
      admin: { description: 'Clip intents consumed by the existing distribution system.' },
    },
  ]),
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        if (data?.slug && (!data.canonicalPath || originalDoc?.slug !== data.slug))
          data.canonicalPath = `/videos/${data.slug}`
        if (data?.status === 'published' && data.provider === 'native') {
          const videoAssetId =
            typeof data.videoAsset === 'string'
              ? data.videoAsset
              : (data.videoAsset as { id?: string } | undefined)?.id
          if (!videoAssetId) throw new Error('Native video publication requires a video asset.')
          const videoAsset = (await req.payload.findByID({
            collection: 'video-assets' as never,
            id: videoAssetId,
            depth: 0,
            overrideAccess: true,
          } as never)) as unknown as Record<string, unknown>
          if (videoAsset.processingState !== 'ready' && !Array.isArray(videoAsset.lastGoodOutputs))
            throw new Error('Video processing must have a ready or last-good playable output.')
        }
        return data
      },
    ],
    ...searchProjectionHooks('videos'),
  },
}

export const VideoAssets: CollectionConfig = {
  ...collection('video-assets', [
    ...ownerFields(),
    { name: 'title', type: 'text', required: true },
    {
      name: 'sourceAsset',
      type: 'relationship',
      relationTo: 'media-assets',
      required: true,
      index: true,
    },
    {
      name: 'processingState',
      type: 'select',
      required: true,
      defaultValue: 'uploaded',
      options: ['uploaded', 'queued', 'probing', 'processing', 'ready', 'failed', 'cancelled'],
    },
    { name: 'recipeKey', type: 'text', required: true, defaultValue: 'web-video-v1' },
    { name: 'recipeVersion', type: 'number', required: true, defaultValue: 1 },
    { name: 'metadata', type: 'json' },
    { name: 'outputs', type: 'json', admin: { readOnly: true } },
    { name: 'lastGoodOutputs', type: 'json', admin: { readOnly: true } },
    { name: 'progress', type: 'number', defaultValue: 0, min: 0, max: 100 },
    { name: 'attempts', type: 'number', defaultValue: 0, min: 0 },
    { name: 'heartbeatAt', type: 'date' },
    { name: 'failure', type: 'json' },
    { name: 'cancelRequested', type: 'checkbox', defaultValue: false },
  ]),
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        if (
          operation === 'create' &&
          (!doc.processingState || doc.processingState === 'uploaded')
        ) {
          const { queueVideoProcessing } = await import('../modules/media/video-workflow')
          await queueVideoProcessing(req.payload, String(doc.id)).catch(async (error) => {
            await req.payload.update({
              collection: 'video-assets' as never,
              id: doc.id,
              overrideAccess: true,
              req,
              data: {
                processingState: 'failed',
                failure: {
                  message: error instanceof Error ? error.message : 'Unable to queue video.',
                  retryable: true,
                },
              } as never,
            } as never)
          })
        }
        return doc
      },
    ],
  },
}

export const VideoCaptions = collection('video-captions', [
  { name: 'title', type: 'text', required: true },
  {
    name: 'video',
    type: 'relationship',
    relationTo: 'videos' as never,
    required: true,
    index: true,
  },
  { name: 'asset', type: 'relationship', relationTo: 'media-assets', required: true },
  { name: 'language', type: 'text', required: true },
  { name: 'label', type: 'text', required: true },
  { name: 'default', type: 'checkbox', defaultValue: false },
  {
    name: 'kind',
    type: 'select',
    required: true,
    defaultValue: 'subtitles',
    options: ['subtitles', 'captions'],
  },
  { name: 'validation', type: 'json', required: true },
  { name: 'transcript', type: 'relationship', relationTo: 'transcript-revisions' as never },
])
export const Interviews = collection('interviews', [
  ...scoped(),
  { name: 'guests', type: 'relationship', relationTo: 'authors', hasMany: true },
  { name: 'hosts', type: 'relationship', relationTo: 'authors', hasMany: true },
  { name: 'media', type: 'relationship', relationTo: 'media-assets' },
  { name: 'transcript', type: 'relationship', relationTo: 'transcript-revisions' as never },
  { name: 'quotes', type: 'json' },
  { name: 'sources', type: 'relationship', relationTo: 'sources', hasMany: true },
])
export const Livestreams = collection('livestreams', [
  ...scoped(),
  { name: 'startsAt', type: 'date' },
  { name: 'embedUrl', type: 'text' },
  { name: 'reminderHook', type: 'json' },
  { name: 'replay', type: 'relationship', relationTo: 'videos' as never },
  { name: 'transcript', type: 'relationship', relationTo: 'transcript-revisions' as never },
  { name: 'campaign', type: 'relationship', relationTo: 'content' },
])
export const TranscriptRevisions = collection('transcript-revisions', [
  { name: 'title', type: 'text', required: true },
  { name: 'media', type: 'relationship', relationTo: 'media-assets', required: true, index: true },
  { name: 'version', type: 'number', required: true },
  { name: 'source', type: 'select', required: true, options: ['provider', 'manual', 'ai-cleanup'] },
  { name: 'sourceRevision', type: 'relationship', relationTo: 'transcript-revisions' as never },
  { name: 'segments', type: 'json', required: true },
  { name: 'checksum', type: 'text', required: true },
  { name: 'immutable', type: 'checkbox', defaultValue: true },
])
export const MediaJobs = collection('media-jobs', [
  { name: 'title', type: 'text', required: true },
  {
    name: 'kind',
    type: 'select',
    required: true,
    options: ['upload', 'import', 'derivative', 'video', 'transcribe', 'tts', 'publisher-read'],
  },
  {
    name: 'status',
    type: 'select',
    required: true,
    defaultValue: 'queued',
    options: ['queued', 'running', 'cancelled', 'retrying', 'failed', 'completed'],
  },
  { name: 'progress', type: 'number', defaultValue: 0 },
  { name: 'idempotencyKey', type: 'text', required: true, unique: true },
  { name: 'failure', type: 'json' },
  { name: 'input', type: 'json' },
  { name: 'output', type: 'json' },
])
export const TtsOutputs = collection('tts-outputs', [
  { name: 'title', type: 'text', required: true },
  { name: 'content', type: 'relationship', relationTo: 'content', required: true },
  { name: 'sourceRevision', type: 'relationship', relationTo: 'revision-records' },
  { name: 'mode', type: 'select', required: true, options: ['tts', 'publisher-read'] },
  { name: 'audio', type: 'relationship', relationTo: 'media-assets' },
  { name: 'voiceSettings', type: 'json' },
  { name: 'licensedOutputMetadata', type: 'json' },
  { name: 'status', type: 'select', required: true, options: ['processing', 'ready', 'failed'] },
])
export const GraphicDocuments = collection('graphic-documents', [
  ...ownerFields(),
  { name: 'title', type: 'text', required: true },
  { name: 'sourceMedia', type: 'relationship', relationTo: 'media-assets', required: true },
  { name: 'sourceRevision', type: 'text', required: true },
  { name: 'layers', type: 'json', required: true },
  { name: 'history', type: 'json', required: true, defaultValue: [] },
  { name: 'brandKit', type: 'relationship', relationTo: 'brands' },
  { name: 'template', type: 'text' },
  {
    name: 'layoutVariant',
    type: 'text',
    admin: { description: 'Registered approved variant key; reserved for Prompt 14 targeting.' },
  },
])
export const MediaDerivatives = collection('media-derivatives', [
  { name: 'title', type: 'text', required: true },
  {
    name: 'document',
    type: 'relationship',
    relationTo: 'graphic-documents' as never,
    required: true,
  },
  { name: 'sourceMedia', type: 'relationship', relationTo: 'media-assets', required: true },
  { name: 'asset', type: 'relationship', relationTo: 'media-assets' },
  {
    name: 'preset',
    type: 'select',
    options: ['hero', 'og', 'square', 'portrait', 'story', 'newsletter', 'thumbnail'],
  },
  { name: 'recipe', type: 'json', required: true },
  {
    name: 'status',
    type: 'select',
    options: ['pending', 'approved', 'superseded', 'failed'],
    defaultValue: 'pending',
  },
  { name: 'usageReferences', type: 'json', defaultValue: [] },
])
export const EditSessions = collection('edit-sessions', [
  { name: 'title', type: 'text', required: true },
  {
    name: 'document',
    type: 'relationship',
    relationTo: 'graphic-documents' as never,
    required: true,
  },
  {
    name: 'status',
    type: 'select',
    options: ['active', 'cancelled', 'committed'],
    defaultValue: 'active',
  },
  { name: 'clientMutationId', type: 'text' },
])
export const QuickCaptureDrafts = collection('quick-capture-drafts', [
  { name: 'title', type: 'text', required: true },
  { name: 'content', type: 'relationship', relationTo: 'content' },
  { name: 'clientMutationId', type: 'text', required: true, unique: true },
  {
    name: 'offlineState',
    type: 'select',
    options: ['queued', 'synced', 'conflict'],
    defaultValue: 'queued',
  },
  { name: 'media', type: 'relationship', relationTo: 'media-assets', hasMany: true },
  { name: 'requestedReviewAt', type: 'date' },
])
