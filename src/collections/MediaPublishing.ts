import type { CollectionConfig } from 'payload'
import {
  canonicalSlug,
  ownerFields,
  seoFields,
  structuredDataSourceFields,
} from './canonical-shared'

const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))
const scoped = () => [
  ...ownerFields(),
  { name: 'title', type: 'text' as const, required: true },
  { name: 'slug', type: 'text' as const, required: true, validate: canonicalSlug },
  { name: 'content', type: 'relationship' as const, relationTo: 'content' as const, index: true },
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
export const PodcastShows = collection('podcast-shows', [
  ...scoped(),
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
])
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
export const PodcastEpisodes = collection('podcast-episodes', [
  ...scoped(),
  {
    name: 'show',
    type: 'relationship',
    relationTo: 'podcast-shows' as never,
    required: true,
    index: true,
  },
  { name: 'season', type: 'relationship', relationTo: 'podcast-seasons' as never },
  { name: 'audio', type: 'relationship', relationTo: 'media-assets' },
  { name: 'externalUrl', type: 'text' },
  { name: 'providerIdentity', type: 'text', unique: true, index: true },
  { name: 'episodeNumber', type: 'number' },
  { name: 'showNotes', type: 'json' },
  { name: 'enclosureBytes', type: 'number', min: 0 },
  { name: 'enclosureMimeType', type: 'text' },
  { name: 'importSourceChecksum', type: 'text' },
  { name: 'guests', type: 'relationship', relationTo: 'authors', hasMany: true },
  { name: 'chapters', type: 'json' },
  { name: 'transcript', type: 'relationship', relationTo: 'transcript-revisions' as never },
])
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
export const Videos = collection('videos', [
  ...scoped(),
  { name: 'channel', type: 'relationship', relationTo: 'video-channels' as never },
  { name: 'playlist', type: 'relationship', relationTo: 'video-playlists' as never },
  { name: 'provider', type: 'text', required: true },
  { name: 'externalId', type: 'text', required: true },
  { name: 'providerIdentity', type: 'text', required: true, unique: true, index: true },
  { name: 'embedUrl', type: 'text' },
  { name: 'nativeMedia', type: 'relationship', relationTo: 'media-assets' },
  { name: 'thumbnail', type: 'relationship', relationTo: 'media-assets' },
  { name: 'captions', type: 'relationship', relationTo: 'media-assets', hasMany: true },
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
    options: ['upload', 'import', 'derivative', 'transcribe', 'tts', 'publisher-read'],
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
