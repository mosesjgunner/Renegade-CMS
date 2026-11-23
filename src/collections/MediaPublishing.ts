import { randomUUID } from 'crypto'
import type { Access, CollectionConfig, CollectionSlug, Where } from 'payload'
import {
  operatorSiteCreateAccess,
  operatorSiteReadAccess,
  operatorSiteUpdateAccess,
  operatorRelatedSiteAccess,
  operatorAllSitesAccess,
  resolveOperatorGrantContext,
} from '../modules/operations/operator-grants'
import {
  canonicalSlug,
  ownerFields,
  seoFields,
  structuredDataSourceFields,
} from './canonical-shared'
import {
  assertPodcastValueSplits,
  podcastChannelGuid,
  PODCAST_IMPORT_WRITE_CONTEXT,
} from '../modules/media/publishing'
import { loadConfig } from '../modules/core/config'
import { searchProjectionHooks } from '../modules/public/search-projection'
import { transactionPayload } from '../modules/core/transaction-payload'
import {
  assignRecordSemanticPath,
  assertRecordSemanticPath,
  recordPublishedPathHistory,
  routeTemplatesForPayloadSite,
} from '../modules/public/semantic-url-service'
import { resolvePublicUrl } from '../modules/public/semantic-url'
import { parseLiveRoomBinding } from '../modules/podcast-studio/live/live-room'
import { parseStreamProfile } from '../modules/podcast-studio/live/stream-profile'

const relationId = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id: unknown }).id)
      : ''

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
  access: mediaCollectionAccess(slug, fields),
  fields,
  hooks: searchProjectionHooks(slug),
})

function mediaCollectionAccess(
  slug: string,
  fields: CollectionConfig['fields'],
): NonNullable<CollectionConfig['access']> {
  const parents: Record<string, [string, CollectionSlug]> = {
    'book-parts': ['book.site', 'books'],
    'book-chapters': ['book.site', 'books'],
    'book-editions': ['book.site', 'books'],
    'podcast-seasons': ['show.site', 'podcast-shows'],
    'video-captions': ['video.site', 'videos'],
    'transcript-revisions': ['media.site', 'media-assets'],
    'tts-outputs': ['content.site', 'content'],
    'media-derivatives': ['document.site', 'graphic-documents'],
    'edit-sessions': ['document.site', 'graphic-documents'],
    'quick-capture-drafts': ['content.site', 'content'],
  }
  const hasSite = fields.some((field) => 'name' in field && field.name === 'site')
  const access = hasSite
    ? {
        create: operatorSiteCreateAccess,
        read: operatorSiteReadAccess,
        update: operatorSiteUpdateAccess,
        delete: operatorSiteReadAccess,
      }
    : parents[slug]
      ? operatorRelatedSiteAccess(...parents[slug])
      : slug === 'media-jobs'
        ? {
            create: (async (args) => {
              const grant = await resolveOperatorGrantContext(
                args.req.payload,
                args.req.user,
                args.req,
              )
              if (!grant.authorized) return false
              if (grant.isGlobalOwner) return true
              const siteId = relationId(
                (
                  (args.data as Record<string, unknown> | undefined)?.input as
                    | Record<string, unknown>
                    | undefined
                )?.siteId,
              )
              if (!siteId) return grant.authorized
              return grant.authorizedSiteIds.includes(siteId)
            }) as Access,
            read: (async (args) => {
              const grant = await resolveOperatorGrantContext(
                args.req.payload,
                args.req.user,
                args.req,
              )
              if (!grant.authorized) return false
              if (grant.isGlobalOwner) return true
              if (args.id) {
                const job = await args.req.payload.findByID({
                  collection: 'media-jobs',
                  id: args.id,
                  depth: 0,
                  overrideAccess: true,
                })
                const siteId = relationId(
                  (job?.input as Record<string, unknown> | undefined)?.siteId,
                )
                if (siteId) return grant.authorizedSiteIds.includes(siteId)
              }
              return true
            }) as Access,
            update: (async ({ req }) => {
              const grant = await resolveOperatorGrantContext(req.payload, req.user, req)
              return grant.authorized
            }) as Access,
            delete: (async ({ req }) => {
              const grant = await resolveOperatorGrantContext(req.payload, req.user, req)
              return grant.authorized
            }) as Access,
          }
        : {
            create: () => false,
            update: () => false,
            delete: () => false,
            read: operatorAllSitesAccess,
          }
  const status = fields.find((field) => 'name' in field && field.name === 'status')
  const publicStatus =
    status?.type === 'select' &&
    status.options.some(
      (option) => (typeof option === 'string' ? option : option.value) === 'published',
    )
  const visible = fields.some((field) => 'name' in field && field.name === 'visibility')
  const published: Where | undefined = publicStatus
    ? {
        and: [
          { status: { in: ['published', 'updated'] } },
          ...(visible ? [{ visibility: { equals: 'public' } }] : []),
          ...(slug === 'book-chapters'
            ? [
                { 'book.status': { in: ['published', 'updated'] } },
                { 'book.visibility': { equals: 'public' } },
              ]
            : []),
        ],
      }
    : undefined
  const read: Access = async (args) => {
    const scoped = await access.read(args)
    if (scoped === true) return true
    if (!published) return scoped
    return scoped ? { or: [scoped, published] } : published
  }
  return { ...access, read }
}

const booksSearchHooks = searchProjectionHooks('books')
export const Books: CollectionConfig = {
  ...collection('books', [
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
  ]),
  hooks: {
    ...booksSearchHooks,
    beforeValidate: [
      async ({ data, originalDoc, req, context }) => {
        data = (await assignRecordSemanticPath({
          payload: req.payload,
          collection: 'books',
          data: data as Record<string, unknown> | null | undefined,
          originalDoc: originalDoc as Record<string, unknown> | null | undefined,
          allowCanonicalPathChange: context?.semanticRouteChange === true,
        })) as typeof data
        await assertRecordSemanticPath({
          payload: req.payload,
          collection: 'books',
          data: data as Record<string, unknown> | null | undefined,
          originalDoc: originalDoc as Record<string, unknown> | null | undefined,
        })
        return data
      },
    ],
    afterChange: [
      ...booksSearchHooks.afterChange,
      async ({ doc, previousDoc, operation, req }) => {
        await recordPublishedPathHistory({
          collection: 'books',
          doc: doc as unknown as Record<string, unknown>,
          previousDoc: previousDoc as unknown as Record<string, unknown>,
          operation: operation as 'create' | 'update',
          payload: req.payload,
        })
        return doc
      },
    ],
  },
  indexes: [{ fields: ['site', 'canonicalPath'] }],
}
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
    {
      name: 'openStudio',
      type: 'ui',
      admin: {
        components: {
          Field: '@/modules/admin/OpenStudioField#OpenStudioField',
        },
      },
    },
    ...scoped(),
    { name: 'language', type: 'text', defaultValue: 'en' },
    { name: 'explicit', type: 'checkbox', defaultValue: false },
    { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true },
    { name: 'rssEnabled', type: 'checkbox', defaultValue: false },
    { name: 'externalFeedUrl', type: 'text' },
    {
      name: 'feedVisibility',
      type: 'select',
      required: true,
      defaultValue: 'public',
      options: ['public', 'members'],
      admin: {
        description:
          'POD-03: a members show has no public feed — episodes are served only through per-member token feeds to members holding the show entitlement. A public show may still flag individual episodes membersOnly.',
      },
    },
    {
      name: 'guestConsentPolicy',
      type: 'select',
      required: true,
      defaultValue: 'warn',
      options: ['off', 'warn', 'block'],
      admin: {
        description:
          'POD-04: how the guest book treats an appearance with no consent record when the guest is admitted (POD-10 consumes assertGuestAdmissionReady): off = never flagged, warn = flagged but admitted, block = admission refused until consent is recorded.',
      },
    },
    {
      name: 'recordingRetentionDays',
      type: 'number',
      admin: {
        description:
          'POD-09 storage policy: days raw multitrack recordings are retained after the bound episode is published. Empty = the default 30 days. Unpublished episodes\u2019 raw tracks are always retained.',
      },
    },
    {
      name: 'requiredEntitlement',
      type: 'json',
      admin: {
        description:
          'POD-03 entitlement binding for member feeds, following the commerce pattern: { "resource": "…", "capability": "…" } a subscription plan must grant. Leave empty to use the default binding — resource "podcast-show:<show id>", capability "listen".',
      },
      validate: (value: unknown) => {
        if (value == null) return true
        if (typeof value !== 'object' || Array.isArray(value))
          return 'Use a resource and capability object.'
        const policy = value as Record<string, unknown>
        return (
          (typeof policy.resource === 'string' &&
            Boolean(policy.resource.trim()) &&
            typeof policy.capability === 'string' &&
            Boolean(policy.capability.trim())) ||
          'Provide a nonempty resource and capability.'
        )
      },
    },
    {
      name: 'importOwnership',
      type: 'select',
      defaultValue: 'local',
      options: ['local', 'claimed-import'],
    },
    { name: 'importSourceChecksum', type: 'text' },
    {
      name: 'ownershipChangedAt',
      type: 'date',
      admin: {
        readOnly: true,
        description:
          'When a local edit last took ownership of this show away from a claimed feed import (POD-02). Subsequent feed syncs skip a locally owned show.',
      },
    },
    { name: 'artwork', type: 'relationship', relationTo: 'media-assets' },
    { name: 'hosts', type: 'relationship', relationTo: 'authors', hasMany: true },
    { name: 'authors', type: 'relationship', relationTo: 'authors', hasMany: true },
    { name: 'body', type: 'textarea' },
    {
      name: 'podcastGuidValue',
      type: 'text',
      index: true,
      admin: {
        readOnly: true,
        description:
          'Channel podcast:guid (UUIDv5), generated once from the canonical feed URL and persisted so slug renames never change it.',
      },
    },
    {
      name: 'lockedOwnerEmail',
      type: 'text',
      admin: {
        description: 'Owner email emitted as the podcast:locked owner attribute when set.',
      },
    },
    {
      name: 'directoryOwnerEmail',
      type: 'email',
      admin: {
        description:
          'Optional directory-verification email (POD-RC-01). When set, this address is published in the feed as <itunes:owner><itunes:email> so directories such as Apple Podcasts and Spotify can send you an ownership-verification message. It is PUBLIC — anyone who downloads the feed can see it — so use an address you are comfortable exposing. It is a separate setting from the podcast:locked owner email above, and it is never filled in from your account email automatically. Leave it empty to publish no owner email.',
      },
    },
    {
      name: 'medium',
      type: 'select',
      defaultValue: 'podcast',
      options: [
        'podcast',
        'podcastL',
        'podcastM',
        'music',
        'musicL',
        'video',
        'videoL',
        'film',
        'filmL',
        'audiobook',
        'audiobookL',
        'newsletter',
        'newsletterL',
        'blog',
        'blogL',
      ],
      admin: { description: 'Podcasting 2.0 podcast:medium value for the channel.' },
    },
    {
      name: 'funding',
      type: 'json',
      admin: {
        description: 'podcast:funding config: { "url": "https://…", "label": "Support the show" }.',
      },
    },
    {
      name: 'value',
      type: 'json',
      admin: {
        description:
          'podcast:value config: { "type": "lightning", "method": "keysend", "suggested": "0.00000005", "recipients": [{ "name": "…", "type": "node", "address": "…", "split": 90 }] }. Recipient splits must sum to 100; enforced at save.',
      },
    },
    {
      name: 'persons',
      type: 'json',
      admin: {
        description:
          'Channel podcast:person list: [{ "name": "…", "role": "host", "group": "Hosts", "href": "https://…", "img": "https://…" }]. Authors records carry no role/group, so the channel person list lives here; hosts/authors relationships remain the fallback source.',
      },
    },
    {
      name: 'exportProfile',
      type: 'json',
      admin: {
        description:
          'POD-13 per-show export profile: { filenameTemplate, titleTemplate, artistTemplate, albumTemplate, descriptionTemplate, mp3BitrateKbps, opusBitrateKbps } with {show-title}/{show-slug}/{episode-title}/{episode-slug}/{episode-number}/{date} tokens. Empty = the POD-13 defaults in src/modules/podcast-studio/render/render.ts.',
      },
    },
    {
      name: 'streamProfile',
      type: 'json',
      admin: {
        description:
          'POD-16 Icecast stream profile — normally edited in the Studio\u2019s live settings form (use Open Studio above); edit the JSON here only for advanced use. Shape: { "sourceUrl": "https://icecast…/mount", "bitrateKbps": 128, "title": "…", "enabled": true, "nowPlayingEnabled": true }. NEVER put the source password in this JSON — credentials live in the credential fields below and are refused here.',
      },
      validate: (value: unknown) => {
        if (value == null) return true
        try {
          parseStreamProfile(value)
          return true
        } catch (error) {
          return error instanceof Error ? error.message : 'Invalid stream profile.'
        }
      },
    },
    {
      name: 'streamCredentialEnvName',
      type: 'text',
      admin: {
        description:
          'POD-16 ADVANCED override: name of the environment variable holding the Icecast source password (env-referenced credential — the value itself never enters the database). Takes precedence over the encrypted credential. The primary path is the Studio live settings form\u2019s source password, stored encrypted — use this env reference only when the password must stay in the server environment.',
      },
    },
    {
      name: 'streamCredentialEncrypted',
      type: 'text',
      access: { read: () => false },
      admin: {
        hidden: true,
        description:
          'POD-16: AES-256-GCM envelope of the Icecast source password, written only by the live service. Never returned by the API (field read access is off) and never logged.',
      },
    },
  ]),
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        if (data) {
          if (data.value) {
            assertPodcastValueSplits(data.value as never)
          }
          if (
            data.funding &&
            typeof data.funding === 'object' &&
            !(data.funding as { url?: unknown }).url
          ) {
            throw new Error('Podcast funding requires a URL.')
          }
          if (!data.podcastGuidValue && !originalDoc?.podcastGuidValue) {
            const slug = data.slug ?? originalDoc?.slug
            if (slug) {
              data.podcastGuidValue = podcastChannelGuid(
                new URL(`/podcasts/${String(slug)}/feed.xml`, loadConfig().appUrl).toString(),
              )
            }
          }
        }
        if (
          data &&
          data.slug &&
          (!data.canonicalPath || (originalDoc && originalDoc.slug !== data.slug))
        ) {
          const siteId = relationId(data.site ?? originalDoc?.site)
          const templates = await routeTemplatesForPayloadSite(req.payload, siteId)
          data.canonicalPath = resolvePublicUrl(
            { kind: 'podcast', slug: String(data.slug) },
            templates,
          )
        }
        await assertRecordSemanticPath({
          payload: req.payload,
          collection: 'podcast-shows',
          data: data as Record<string, unknown> | null | undefined,
          originalDoc: originalDoc as Record<string, unknown> | null | undefined,
        })
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
    {
      // Not required: an episode legitimately exists before its audio does —
      // a claimed-import episode awaiting enclosure migration (POD-02) and a
      // scheduled/live episode awaiting its recording (POD-01 liveItem) both
      // have no local audio yet. POD-02 finding: with `required: true` the
      // importer could not create episodes against real Payload at all.
      name: 'audio',
      type: 'relationship',
      relationTo: 'media-assets',
    },
    { name: 'artwork', type: 'relationship', relationTo: 'media-assets' },
    { name: 'explicit', type: 'checkbox', defaultValue: false },
    {
      name: 'membersOnly',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'POD-03: members-only episodes are absent from the public feed entirely and are served only through entitled members\u2019 token feeds. Episodes of a members-visibility show are members-only regardless of this flag.',
      },
    },
    {
      name: 'productionState',
      type: 'select',
      required: true,
      defaultValue: 'idea',
      options: [
        'idea',
        'scripted',
        'scheduled-record',
        'recorded',
        'editing',
        'review',
        'scheduled',
        'published',
        'withdrawn',
      ],
      admin: {
        description:
          'POD-04 production lifecycle (POD-REQ-09), driven by the guarded state machine in src/modules/podcast-studio/production.ts — transitions through that module keep the public status in sync (published → status published, withdrawn → status unavailable, scheduled → status scheduled, everything else → draft). Direct edits here bypass the guards (approval, audio) and are not the supported path.',
      },
    },
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
    {
      name: 'mediaMigrationState',
      type: 'select',
      defaultValue: 'not-requested',
      options: ['not-requested', 'pending', 'fetching', 'verifying', 'done', 'failed'],
      admin: {
        readOnly: true,
        description:
          'POD-02 enclosure migration state for imported episodes: pending → fetching → verifying → done, or failed with the reason in mediaMigrationError.',
      },
    },
    {
      name: 'mediaMigrationError',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'Why the last enclosure migration attempt failed, when it did.',
      },
    },
    {
      name: 'mediaChecksum',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'SHA-256 (hex) of the migrated enclosure bytes, verified before re-pointing.',
      },
    },
    { name: 'authors', type: 'relationship', relationTo: 'authors', hasMany: true },
    { name: 'guests', type: 'relationship', relationTo: 'authors', hasMany: true },
    { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true },
    { name: 'chapters', type: 'json' },
    { name: 'transcript', type: 'relationship', relationTo: 'transcript-revisions' as never },
    {
      name: 'liveState',
      type: 'select',
      defaultValue: 'none',
      options: ['none', 'scheduled', 'live', 'ended'],
      admin: {
        description:
          'Podcasting 2.0 live state: scheduled/live episodes emit podcast:liveItem instead of a regular item; ended converts to a normal item once a recording (audio) exists.',
      },
    },
    { name: 'liveStartAt', type: 'date' },
    { name: 'liveEndAt', type: 'date' },
    { name: 'liveStreamUrl', type: 'text' },
    {
      name: 'liveRoom',
      type: 'json',
      admin: {
        description:
          'Canonical Community Rooms reference. Use { "roomId": "<room conversation ID>", "access": "public" | "members" }.',
      },
      validate: (value: unknown) => {
        if (value == null) return true
        try {
          parseLiveRoomBinding(value)
          return true
        } catch (error) {
          return error instanceof Error ? error.message : 'Invalid live room binding.'
        }
      },
    },
    {
      name: 'persons',
      type: 'json',
      admin: {
        description:
          'Optional per-episode podcast:person override: [{ "name": "…", "role": "guest", "group": "Guests", "href": "https://…", "img": "https://…" }]. Default: show hosts as hosts plus episode guests as guests.',
      },
    },
    {
      name: 'renderProvenance',
      type: 'json',
      admin: {
        readOnly: true,
        description:
          'POD-13 render provenance for the currently attached master: { renderId, edlHash, edlVersion, recipe, profile, loudnessTarget, measurements, chaptersSource, renderedAt, jobId }. Written by the render service when a master attaches; the episode GUID is never touched by a render.',
      },
    },
    {
      name: 'video',
      type: 'relationship',
      relationTo: 'media-assets',
      admin: {
        readOnly: true,
        description:
          'POD-17 video render of this episode (MP4). Written only by the POD-17 video attach from a probe-verified render; the feed publishes a video enclosure only when videoProvenance carries the passed probe for these bytes.',
      },
    },
    {
      name: 'videoProvenance',
      type: 'json',
      admin: {
        readOnly: true,
        description:
          'POD-17 video render provenance: { kind, mode (camera|slideshow), assetId, probe: { passed, durationSec, width, height, videoCodec, audioCodec, checksumSha256 }, audioDurationSec, durationDeltaSec, renderedAt }. Written by the video attach; the episode GUID and audio are never touched by a video render.',
      },
    },
    {
      name: 'promotion',
      type: 'json',
      admin: {
        description:
          'POD-18 promotion state (shared systems): { socialOptIn (per-episode opt-in, default OFF), socialDraftId, socialStatus, socialEnqueuedAt, socialError, newsletterDraftId, newsletterComposedAt }. socialOptIn is set by staff; the rest is written by src/modules/podcast-studio/promotion.ts. Social status is the social system\u2019s own state, read back — never a copy of provider credentials.',
      },
    },
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
          const siteId = relationId(data.site ?? originalDoc?.site)
          const templates = await routeTemplatesForPayloadSite(req.payload, siteId)
          data.canonicalPath = resolvePublicUrl(
            { kind: 'podcast-episode', slug: String(data.slug) },
            templates,
          )
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
        await assertRecordSemanticPath({
          payload: req.payload,
          collection: 'podcast-episodes',
          data: data as Record<string, unknown> | null | undefined,
          originalDoc: originalDoc as Record<string, unknown> | null | undefined,
        })
        return data
      },
    ],
    afterChange: [
      // POD-02 (POD-REQ-07): a genuine user edit to a claimed-import
      // episode takes ownership of the whole show — importOwnership flips
      // to 'local', the transition is stamped and logged, and subsequent
      // feed syncs skip the show (importPodcastFeed refuses non-claimed
      // shows). The importer's and migration worker's own writes carry
      // the PODCAST_IMPORT_WRITE_CONTEXT request context and never flip.
      async ({ doc, previousDoc, req }) => {
        if (!previousDoc) return doc
        if ((req.context as Record<string, unknown> | undefined)?.[PODCAST_IMPORT_WRITE_CONTEXT])
          return doc
        const comparable = (value: unknown) => JSON.stringify(value ?? null)
        const changed = (
          [
            'title',
            'description',
            'body',
            'showNotes',
            'slug',
            'episodeNumber',
            'seasonNumber',
            'chapters',
            'explicit',
          ] as const
        ).some(
          (field) =>
            comparable((doc as Record<string, unknown>)[field]) !==
            comparable((previousDoc as Record<string, unknown>)[field]),
        )
        const audioChanged =
          relationId((doc as Record<string, unknown>).audio) !==
          relationId((previousDoc as Record<string, unknown>).audio)
        if (!changed && !audioChanged) return doc
        const showId = relationId((doc as Record<string, unknown>).show)
        if (!showId) return doc
        try {
          const show = (await req.payload.findByID({
            collection: 'podcast-shows',
            id: showId,
            depth: 0,
            overrideAccess: true,
          } as never)) as unknown as Record<string, unknown> | null
          if (show?.importOwnership === 'claimed-import') {
            const ownershipChangedAt = new Date().toISOString()
            await req.payload.update({
              collection: 'podcast-shows',
              id: showId,
              data: { importOwnership: 'local', ownershipChangedAt },
              overrideAccess: true,
              context: { [PODCAST_IMPORT_WRITE_CONTEXT]: true },
            } as never)
            console.log(
              JSON.stringify({
                event: 'podcast.import.ownership-taken',
                showId,
                episodeId: String((doc as Record<string, unknown>).id),
                ownershipChangedAt,
              }),
            )
          }
        } catch (error) {
          // An ownership bookkeeping failure must not fail the user's edit,
          // but it must never be silent either.
          console.error(
            JSON.stringify({
              event: 'podcast.import.ownership-flip-failed',
              showId,
              episodeId: String((doc as Record<string, unknown>).id),
              error: error instanceof Error ? error.message : String(error),
            }),
          )
        }
        return doc
      },
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
/**
 * POD-03 (POD-REQ-08): per-member podcast feed tokens. Only the
 * SHA-256 hash of a token is stored — the raw token exists solely in
 * the issue/rotation API response. All writes go through the
 * member-feeds service (overrideAccess); the Payload API surface is
 * read-only for global owners so a hash can never leak or be planted
 * through REST/GraphQL.
 */
export const PodcastFeedTokens: CollectionConfig = {
  slug: 'podcast-feed-tokens',
  admin: { useAsTitle: 'id', group: 'Media publishing', hidden: true },
  access: {
    create: () => false,
    update: () => false,
    delete: () => false,
    read: async ({ req }) =>
      (await resolveOperatorGrantContext(req.payload, req.user, req)).isGlobalOwner,
  },
  fields: [
    {
      name: 'member',
      type: 'relationship',
      relationTo: 'members',
      required: true,
      index: true,
    },
    {
      name: 'show',
      type: 'relationship',
      relationTo: 'podcast-shows' as never,
      required: true,
      index: true,
    },
    {
      name: 'tokenHash',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'SHA-256 (hex) of the feed token. The raw token is never stored.',
      },
    },
    { name: 'revokedAt', type: 'date' },
    { name: 'lastUsedAt', type: 'date' },
  ],
}
/**
 * POD-04 (POD-REQ-10): the guest book. A guest is production data — a
 * person a show works with repeatedly — distinct from the `authors`
 * records the feed's podcast:person path reads (episode.guests →
 * authors stays exactly as POD-01 left it). A guest MAY link to an
 * author record via `author` when the same person also appears in
 * feeds; the link is informational and nothing reads it automatically.
 *
 * All writes go through src/modules/podcast-studio/production.ts
 * (overrideAccess, after the staff API's operator site check); the
 * Payload API surface is read-only for global owners, following the
 * podcast-feed-tokens pattern.
 */
const podcastProductionReadAccess: NonNullable<CollectionConfig['access']> = {
  create: () => false,
  update: () => false,
  delete: () => false,
  read: async ({ req }) =>
    (await resolveOperatorGrantContext(req.payload, req.user, req)).isGlobalOwner,
}

export const PodcastGuests: CollectionConfig = {
  slug: 'podcast-guests',
  admin: { useAsTitle: 'name', group: 'Media publishing' },
  access: podcastProductionReadAccess,
  fields: [
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      required: true,
      index: true,
    },
    { name: 'name', type: 'text', required: true },
    { name: 'email', type: 'text' },
    {
      name: 'contact',
      type: 'json',
      admin: {
        description: 'Other contact handles: { "phone": "…", "social": "…", "agent": "…" }.',
      },
    },
    { name: 'bio', type: 'textarea' },
    {
      name: 'links',
      type: 'json',
      admin: {
        description: 'Guest links: [{ "label": "Website", "url": "https://…" }].',
      },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
      admin: {
        description:
          'Optional link to the authors record for the same person (the feed podcast:person source). Informational only.',
      },
    },
  ],
}
/**
 * POD-04 (POD-REQ-10): one guest's appearance on one episode — prep
 * notes, planned questions, and the consent record for that appearance
 * (consentAt/consentBy/consentScope/releaseUrl). Consent is recorded
 * per appearance, never assumed from a past appearance.
 */
export const PodcastGuestAppearances: CollectionConfig = {
  slug: 'podcast-guest-appearances',
  admin: { useAsTitle: 'id', group: 'Media publishing', hidden: true },
  access: podcastProductionReadAccess,
  fields: [
    {
      name: 'guest',
      type: 'relationship',
      relationTo: 'podcast-guests' as never,
      required: true,
      index: true,
    },
    {
      name: 'episode',
      type: 'relationship',
      relationTo: 'podcast-episodes' as never,
      required: true,
      index: true,
    },
    { name: 'role', type: 'text', defaultValue: 'guest' },
    { name: 'prepNotes', type: 'textarea' },
    {
      name: 'questions',
      type: 'json',
      admin: { description: 'Planned questions: ["…", "…"].' },
    },
    { name: 'consentAt', type: 'date' },
    { name: 'consentBy', type: 'text' },
    { name: 'consentScope', type: 'text' },
    { name: 'releaseUrl', type: 'text' },
  ],
}
/**
 * POD-04 (POD-REQ-09): the minimal podcast episode approval record.
 *
 * Workflow #19's approval machinery (EditorialWorkflow.decideReview,
 * driven through src/modules/editorial/persistence.ts) is bound to
 * article/content bundles loaded by article id — it hydrates a workflow
 * from a content record and has no primitive that records an approval
 * against an arbitrary record such as a podcast episode. Rather than
 * fake a content bundle for every episode, POD-04 records approvals
 * here: one row per decision, latest decision wins, and the publish
 * transition in production.ts refuses to publish without a latest
 * decision of `approved`. Stated plainly per the POD-04 brief: this is
 * a new minimal record, not a reuse of Workflow #19.
 */
export const PodcastEpisodeApprovals: CollectionConfig = {
  slug: 'podcast-episode-approvals',
  admin: { useAsTitle: 'id', group: 'Media publishing', hidden: true },
  access: podcastProductionReadAccess,
  fields: [
    {
      name: 'episode',
      type: 'relationship',
      relationTo: 'podcast-episodes' as never,
      required: true,
      index: true,
    },
    {
      name: 'approver',
      type: 'text',
      required: true,
      admin: {
        description: 'Payload user id of the staff member who recorded the decision.',
      },
    },
    {
      name: 'decision',
      type: 'select',
      required: true,
      options: ['approved', 'rejected', 'changes-requested'],
    },
    { name: 'note', type: 'textarea' },
    { name: 'decidedAt', type: 'date', required: true },
  ],
}
/**
 * POD-05 (POD-REQ-11): Podcast Studio sessions. One row per studio
 * session; the full POD-00 StudioSession document lives in
 * `sessionData` (validated through the POD-00 parser on every save by
 * src/modules/podcast-studio/sessions.ts) and `state` mirrors the
 * document's desk state for cheap listing. Site-scoped through the
 * row's own `site` (copied from the owning show at creation), with
 * the standard operator site access used by the other media
 * collections; the studio API additionally checks the operator grant
 * against the show's site before any read/write.
 */
export const PodcastStudioSessions: CollectionConfig = {
  slug: 'podcast-studio-sessions',
  admin: { useAsTitle: 'title', group: 'Media publishing' },
  access: {
    create: operatorSiteCreateAccess,
    read: operatorSiteReadAccess,
    update: operatorSiteUpdateAccess,
    delete: operatorSiteReadAccess,
  },
  fields: [
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      required: true,
      index: true,
    },
    {
      name: 'show',
      type: 'relationship',
      relationTo: 'podcast-shows' as never,
      required: true,
      index: true,
    },
    { name: 'title', type: 'text', required: true },
    {
      name: 'state',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: ['draft', 'ready', 'live', 'paused', 'recording', 'stopped', 'ended'],
      admin: {
        description:
          'Desk state mirrored from the session document (draft/ready/live/paused/recording/stopped/ended). Driven through the studio API, not by direct edits.',
      },
    },
    {
      name: 'sessionData',
      type: 'json',
      required: true,
      admin: {
        description:
          'The POD-00 StudioSession document (rundown, cartwall, mixer snapshot, chapters, log, plus preserved extension fields). Validated by the POD-00 parser on every save.',
      },
    },
    {
      name: 'schemaVersion',
      type: 'number',
      required: true,
      defaultValue: 1,
      admin: { description: 'StudioSession schema version (1 = POD-00 session v1).' },
    },
    { name: 'startedAt', type: 'date' },
    { name: 'lastSavedAt', type: 'date' },
  ],
}
/**
 * POD-09 (POD-REQ-19, POD-REQ-20): finalized multitrack recordings.
 * One row per finalized recording session: the POD-00 TrackManifest
 * (json), the live markers + POD-08 played-clip log captured for
 * POD-12, the per-track media assets the finalizer registered, and the
 * retention snapshot (the show's resolved storage policy + the
 * computed retainUntil; null retainUntil = retained indefinitely —
 * see src/modules/podcast-studio/recording/storage-policy.ts).
 *
 * All writes go through the recording finalizer / cleanup core
 * (overrideAccess); the Payload API surface is read-only for global
 * owners, following the podcast production pattern.
 */
export const PodcastRecordings: CollectionConfig = {
  slug: 'podcast-recordings',
  admin: { useAsTitle: 'id', group: 'Media publishing', hidden: true },
  access: podcastProductionReadAccess,
  fields: [
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      required: true,
      index: true,
    },
    {
      name: 'show',
      type: 'relationship',
      relationTo: 'podcast-shows' as never,
      required: true,
      index: true,
    },
    {
      name: 'session',
      type: 'relationship',
      relationTo: 'podcast-studio-sessions' as never,
      index: true,
      admin: {
        description: 'The POD-05 studio session record this recording was finalized from.',
      },
    },
    {
      name: 'episode',
      type: 'relationship',
      relationTo: 'podcast-episodes' as never,
      index: true,
      admin: {
        description:
          'Optional episode binding: when set, finalize moves the episode production state to "recorded" through the POD-04 state machine.',
      },
    },
    {
      name: 'state',
      type: 'select',
      required: true,
      defaultValue: 'recording',
      options: ['recording', 'finalizing', 'finalized', 'degraded', 'failed', 'expired'],
      admin: {
        description:
          'finalized = every track assembled clean; degraded = at least one track carries a visible error/gap (see manifest + errorMessage); expired = raw tracks removed by the retention cleanup.',
      },
    },
    {
      name: 'manifest',
      type: 'json',
      admin: {
        description:
          'The POD-00 TrackManifest (validated) plus per-track extension fields: gaps, drift report, degraded flag, errors, mediaAssetId per track.',
      },
    },
    {
      name: 'markers',
      type: 'json',
      admin: { description: 'Live recording markers (POD-09 recording state) for POD-12.' },
    },
    {
      name: 'playedClipLog',
      type: 'json',
      admin: { description: 'The POD-08 played-clip log snapshot for POD-12/POD-16.' },
    },
    {
      name: 'sessionLog',
      type: 'json',
      admin: {
        description: 'Session log entries carried with the recording (errors stay visible here).',
      },
    },
    {
      name: 'trackAssets',
      type: 'json',
      admin: {
        description: 'Per-track media assets: [{ trackId, mediaAssetId, checksumSha256 }].',
      },
    },
    {
      name: 'conformReports',
      type: 'json',
      admin: {
        description:
          'POD-11 guest conform reports, upserted by track: [{ inviteId, trackId, state, source, rateCorrection (POD-00 EDL artefact for POD-12), report, conformedChecksumSha256 }].',
      },
    },
    {
      name: 'retentionPolicy',
      type: 'json',
      admin: {
        description:
          'Resolved retention policy snapshot: { mode: "until-published-plus-days", daysAfterPublish }.',
      },
    },
    {
      name: 'retainUntil',
      type: 'date',
      admin: {
        description:
          'Raw tracks are cleanup-eligible after this instant; empty = retained indefinitely (episode unpublished or unbound).',
      },
    },
    { name: 'finalizedAt', type: 'date' },
    { name: 'errorMessage', type: 'textarea' },
  ],
}
/**
 * POD-12 (POD-REQ-26, POD-REQ-27): edit projects. One row per project:
 * the binding to the POD-09 recording it was built from (session +
 * episode relations carried alongside), and the project document as
 * json — the POD-00 EDL plus the bounded in-document version history
 * (autosave appends a full-EDL snapshot per save; restore is a pure
 * function of the stored document — see
 * src/modules/podcast-studio/edit/project.ts for the rationale).
 * Writes go through the edit project service (overrideAccess),
 * following the POD-05 studio-session pattern.
 */
export const PodcastEditProjects: CollectionConfig = {
  slug: 'podcast-edit-projects',
  admin: { useAsTitle: 'title', group: 'Media publishing' },
  access: {
    create: operatorSiteCreateAccess,
    read: operatorSiteReadAccess,
    update: operatorSiteUpdateAccess,
    delete: operatorSiteReadAccess,
  },
  fields: [
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      required: true,
      index: true,
    },
    {
      name: 'show',
      type: 'relationship',
      relationTo: 'podcast-shows' as never,
      required: true,
      index: true,
    },
    {
      name: 'session',
      type: 'relationship',
      relationTo: 'podcast-studio-sessions' as never,
      index: true,
      admin: {
        description: 'The POD-05 studio session record the source recording came from, when any.',
      },
    },
    {
      name: 'recording',
      type: 'relationship',
      relationTo: 'podcast-recordings' as never,
      index: true,
      admin: {
        description: 'The POD-09 recording this project was created from, when any.',
      },
    },
    {
      name: 'episode',
      type: 'relationship',
      relationTo: 'podcast-episodes' as never,
      index: true,
      admin: {
        description:
          'Optional episode binding: chapters/transcript seed from the episode canonical lists at creation.',
      },
    },
    { name: 'title', type: 'text', required: true },
    {
      name: 'projectData',
      type: 'json',
      required: true,
      admin: {
        description:
          'The POD-12 edit project document: { version, title, recordingId, sessionId, episodeId, edl (POD-00 schema), versions[] (bounded autosave history) }. The EDL is validated by the POD-00 parser on every save.',
      },
    },
    {
      name: 'schemaVersion',
      type: 'number',
      required: true,
      defaultValue: 1,
      admin: { description: 'Edit project schema version (1 = POD-12 project v1).' },
    },
    { name: 'lastSavedAt', type: 'date' },
  ],
}
/**
 * POD-13 (POD-REQ-28, POD-REQ-29): render records. One row per
 * (project, EDL hash, profile, range) render — the row's unique
 * `idempotencyKey` is what makes task retries and re-queues safe:
 * a completed render is returned, never re-rendered or duplicated.
 * The row carries the full render report (loudness measurements,
 * pass-1 loudnorm values, filter graph, named approximations) and
 * the registered output media assets. Failed renders keep the row
 * with state `failed` and the named error (plus gate measurements
 * when the loudness gate refused the master) — failure is a visible
 * record, never a silent partial master. All writes go through
 * src/modules/podcast-studio/render/render-service.ts
 * (overrideAccess), following the podcast production pattern.
 */
export const PodcastRenders: CollectionConfig = {
  slug: 'podcast-renders',
  admin: { useAsTitle: 'id', group: 'Media publishing', hidden: true },
  access: podcastProductionReadAccess,
  fields: [
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      required: true,
      index: true,
    },
    {
      name: 'show',
      type: 'relationship',
      relationTo: 'podcast-shows' as never,
      required: true,
      index: true,
    },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'podcast-edit-projects' as never,
      required: true,
      index: true,
    },
    {
      name: 'episode',
      type: 'relationship',
      relationTo: 'podcast-episodes' as never,
      index: true,
    },
    {
      name: 'profile',
      type: 'select',
      required: true,
      defaultValue: 'master',
      options: ['master', 'preview', 'clip', 'audiogram'],
    },
    {
      name: 'state',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: ['queued', 'rendering', 'completed', 'failed'],
    },
    {
      name: 'idempotencyKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        description:
          'SHA-256 over project id + EDL hash + profile + range. One completed render per key.',
      },
    },
    { name: 'edlHash', type: 'text', index: true },
    { name: 'edlVersion', type: 'number' },
    {
      name: 'range',
      type: 'json',
      admin: {
        description:
          'Timeline window for preview/clip/audiogram profiles: { startSec, durationSec }.',
      },
    },
    {
      name: 'report',
      type: 'json',
      admin: {
        description:
          'The render report: loudness target, loudnorm pass-1 measurements, verified measurements (ebur128 + PCM cross-check), gate verdict, filter graph, named POD-07→ffmpeg approximations.',
      },
    },
    {
      name: 'outputs',
      type: 'json',
      admin: {
        description:
          'Registered outputs: { wavMaster?, mp3?, opus?, chaptersJson?, audiogramMp4? } each { mediaAssetId, filename, mimeType, sizeBytes, checksumSha256, durationSec? }.',
      },
    },
    { name: 'errorMessage', type: 'textarea' },
    { name: 'jobId', type: 'text' },
    { name: 'startedAt', type: 'date' },
    { name: 'finishedAt', type: 'date' },
  ],
}
/**
 * POD-14 (POD-REQ-31): post-production assist drafts. One row per
 * generated draft (chapter suggestions, show-note draft, summary,
 * highlight candidates, audiogram media draft) attached to an
 * episode. A draft changes NOTHING on the episode until a human
 * accepts it through intelligence/service.ts `acceptAssistDraft` —
 * acceptance is the only write path from a draft to the episode.
 * All writes go through the service (overrideAccess).
 */
export const PodcastAssistDrafts: CollectionConfig = {
  slug: 'podcast-assist-drafts',
  admin: { useAsTitle: 'title', group: 'Media publishing', hidden: true },
  access: podcastProductionReadAccess,
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'episode',
      type: 'relationship',
      relationTo: 'podcast-episodes' as never,
      required: true,
      index: true,
    },
    {
      name: 'show',
      type: 'relationship',
      relationTo: 'podcast-shows' as never,
      index: true,
    },
    { name: 'site', type: 'relationship', relationTo: 'sites', index: true },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: ['chapters', 'show-notes', 'summary', 'highlight', 'audiogram'],
    },
    {
      name: 'state',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: ['draft', 'accepted', 'discarded'],
    },
    {
      name: 'payload',
      type: 'json',
      admin: {
        description:
          'The draft body: chapters list / show-notes+summary / highlight clip definitions / audiogram media reference, plus provenance (basis, enhancedBy, acceptedBy/acceptedAt).',
      },
    },
    {
      name: 'createdBy',
      type: 'text',
      admin: {
        description: 'Who or what produced the draft: a staff user id or a job label.',
      },
    },
  ],
}
/**
 * POD-10 (POD-REQ-21): guest invites. One row per invite: purpose-bound
 * (guest-invite), bound to exactly one studio session, expiring and
 * revocable. ONLY SHA-256 hashes of the invite token and of the
 * post-join signalling credential are stored — raw tokens exist solely
 * in the issue/join responses. The lobby state machine lives in
 * src/modules/podcast-studio/guests/lobby.ts; all writes go through
 * guests/service.ts (overrideAccess), following the feed-token pattern.
 */
export const PodcastGuestInvites: CollectionConfig = {
  slug: 'podcast-guest-invites',
  admin: { useAsTitle: 'id', group: 'Media publishing', hidden: true },
  access: podcastProductionReadAccess,
  fields: [
    { name: 'purpose', type: 'text', required: true, defaultValue: 'guest-invite' },
    {
      name: 'session',
      type: 'relationship',
      relationTo: 'podcast-studio-sessions' as never,
      required: true,
      index: true,
    },
    {
      name: 'show',
      type: 'relationship',
      relationTo: 'podcast-shows' as never,
      index: true,
    },
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      index: true,
    },
    {
      name: 'guest',
      type: 'relationship',
      relationTo: 'podcast-guests' as never,
      index: true,
      admin: {
        description:
          'Optional guest-book link. When set, admission runs the POD-04 consent gate for this guest.',
      },
    },
    {
      name: 'tokenHash',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'SHA-256 (hex) of the single-use invite token. The raw token is never stored.',
      },
    },
    {
      name: 'signallingTokenHash',
      type: 'text',
      index: true,
      admin: {
        readOnly: true,
        description:
          'SHA-256 (hex) of the post-join signalling credential, issued once at join. Never stored raw.',
      },
    },
    {
      name: 'state',
      type: 'select',
      required: true,
      defaultValue: 'invited',
      options: ['invited', 'preflight', 'waiting', 'admitted', 'dropped', 'left'],
    },
    { name: 'displayName', type: 'text' },
    {
      name: 'headphones',
      type: 'select',
      options: ['headphones', 'no-headphones-fallback'],
    },
    { name: 'stripId', type: 'text' },
    { name: 'expiresAt', type: 'date' },
    { name: 'revokedAt', type: 'date' },
    { name: 'joinedAt', type: 'date' },
    { name: 'admittedAt', type: 'date' },
    { name: 'dropReason', type: 'text' },
  ],
}
/**
 * POD-10 (POD-REQ-22): the durable signalling message log. Guest and
 * host exchange offer/answer/ice-candidate/bye (+ control messages)
 * through authenticated HTTP long-poll endpoints that read/write this
 * table — there is no WebSocket server in the repo, and the team SSE
 * realtime layer requires an account guests do not have. The service
 * validates token + admission state per message; media negotiation
 * for a non-admitted guest is refused in the signalling core.
 */
export const PodcastSignallingMessages: CollectionConfig = {
  slug: 'podcast-signalling-messages',
  admin: { useAsTitle: 'id', group: 'Media publishing', hidden: true },
  access: podcastProductionReadAccess,
  fields: [
    {
      name: 'session',
      type: 'relationship',
      relationTo: 'podcast-studio-sessions' as never,
      required: true,
      index: true,
    },
    {
      name: 'invite',
      type: 'relationship',
      relationTo: 'podcast-guest-invites' as never,
      required: true,
      index: true,
    },
    {
      name: 'sender',
      type: 'select',
      required: true,
      options: ['guest', 'host'],
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: ['offer', 'answer', 'ice-candidate', 'bye', 'hello', 'preflight', 'talkback'],
    },
    {
      name: 'payload',
      type: 'json',
      admin: { description: 'SDP / ICE candidate / control payload for the message type.' },
    },
  ],
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
        if (data?.slug && (!data.canonicalPath || originalDoc?.slug !== data.slug)) {
          const templates = await routeTemplatesForPayloadSite(
            req.payload,
            relationId(data.site ?? originalDoc?.site),
          )
          data.canonicalPath = resolvePublicUrl(
            { kind: 'video', slug: String(data.slug) },
            templates,
          )
        }
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
        await assertRecordSemanticPath({
          payload: req.payload,
          collection: 'videos',
          data: data as Record<string, unknown> | null | undefined,
          originalDoc: originalDoc as Record<string, unknown> | null | undefined,
        })
        return data
      },
    ],
    ...searchProjectionHooks('videos'),
    afterChange: [
      ...searchProjectionHooks('videos').afterChange,
      async ({ doc, previousDoc, operation, req }) => {
        await recordPublishedPathHistory({
          collection: 'videos',
          doc: doc as unknown as Record<string, unknown>,
          previousDoc: previousDoc as unknown as Record<string, unknown>,
          operation: operation as 'create' | 'update',
          payload: req.payload,
        })
        return doc
      },
    ],
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
          await queueVideoProcessing(transactionPayload(req.payload, req), String(doc.id)).catch(
            async (error) => {
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
            },
          )
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
  {
    name: 'reviewState',
    type: 'select',
    options: ['draft', 'reviewed'],
    index: true,
    admin: {
      description:
        'POD-14: provider-generated revisions land as drafts and are never served until an explicit accept marks them reviewed and links them from the episode. Rows created before POD-14 have no value and are treated as reviewed (they were linked by hand).',
    },
  },
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
