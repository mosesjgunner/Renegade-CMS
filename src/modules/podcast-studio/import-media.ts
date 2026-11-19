/* eslint-disable @typescript-eslint/no-explicit-any -- media persistence spans polymorphic Payload collections. */
/**
 * POD-02 (POD-REQ-06, POD-REQ-07): podcast import completion.
 *
 * - `migrateEpisodeEnclosure` is the directly-callable core of the media
 *   migration: it fetches one imported episode's remote enclosure through
 *   the SSRF-safe external boundary, verifies byte length + sha256, stores
 *   the bytes in site-scoped media storage, and only then re-points the
 *   episode's `audio` at the local media-asset. The Payload task
 *   `podcast-import-media` (src/modules/media/tasks.ts) is a thin wrapper.
 * - Storage decision: bytes land through the same blob/asset model
 *   `uploadMedia` uses (MediaStorage.put + media-blobs dedupe by
 *   site+checksum + media-assets create), NOT through upload sessions.
 *   `finalizeUploadSession` is owner-bound interactive chunked upload
 *   machinery — it requires a staff user who owns the session — so it
 *   cannot serve a background worker with no session owner. The blob
 *   checksum dedupe gives the same no-duplicate-bytes guarantee.
 * - `reconcileClaimedImportShows` re-runs feed sync for claimed-import
 *   shows; a local user edit flips the show to local ownership (collection
 *   hook in src/collections/MediaPublishing.ts) and reconciliation then
 *   skips it, because `importPodcastFeed` only runs for claimed shows.
 * - `buildMovedFeedRedirect` generates the new-feed toolkit artifact for a
 *   show moving feeds, in or out.
 */
import { createHash } from 'node:crypto'

import { loadConfig, type AppConfig } from '../core/config'
import { safeFetch, type Lookup } from '../core/external-boundary'
import {
  importPodcastFeed,
  PODCAST_IMPORT_WRITE_CONTEXT,
  type MediaPublishingStore,
} from '../media/publishing'
import { inspectAudioMetadata, inspectMedia, mediaObjectKey, mediaStorage } from '../media/storage'

type Doc = Record<string, any>
const relationId = (value: unknown) =>
  typeof value === 'string' ? value : String((value as Doc)?.id ?? '')

/** Hard cap for one enclosure migration (512 MiB); counted while streaming. */
export const PODCAST_ENCLOSURE_MAX_BYTES = 512 * 1024 * 1024

const ALLOWED_ENCLOSURE_CONTENT_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/flac',
  'application/octet-stream',
] as const

export type PodcastMediaMigrationState =
  | 'not-requested'
  | 'pending'
  | 'fetching'
  | 'verifying'
  | 'done'
  | 'failed'

export type PodcastMediaMigrationResult = {
  episodeId: string
  state: PodcastMediaMigrationState
  completed: boolean
  mediaAssetId?: string
  checksum?: string
  bytes?: number
  error?: string
  alreadyMigrated?: boolean
}

export type PodcastMediaMigrationOptions = {
  fetcher?: typeof fetch
  resolve?: Lookup
  allowPrivate?: boolean
  config?: AppConfig
  maxBytes?: number
  timeoutMs?: number
}

const importContext = { [PODCAST_IMPORT_WRITE_CONTEXT]: true }

async function setMigrationState(
  store: MediaPublishingStore,
  episodeId: string,
  data: Doc,
): Promise<void> {
  await store.update({
    collection: 'podcast-episodes',
    id: episodeId,
    data,
    overrideAccess: true,
    context: importContext,
  })
}

async function failMigration(
  store: MediaPublishingStore,
  episodeId: string,
  error: string,
): Promise<PodcastMediaMigrationResult> {
  await setMigrationState(store, episodeId, {
    mediaMigrationState: 'failed',
    mediaMigrationError: error.slice(0, 500),
  }).catch(() => undefined)
  return { episodeId, state: 'failed', completed: false, error }
}

/** Reads a response body counting bytes; aborts as soon as the cap is exceeded. */
async function readBoundedBody(response: Response, cap: number): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > cap)
      throw new Error(`Podcast enclosure exceeds the ${cap}-byte migration cap.`)
    return bytes
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > cap) {
      await reader.cancel().catch(() => undefined)
      throw new Error(`Podcast enclosure exceeds the ${cap}-byte migration cap.`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

/**
 * Migrates one imported episode's enclosure into local media. Per-item
 * failures are recorded on the episode (state `failed` + visible error)
 * and returned, never thrown, so one corrupt enclosure cannot fail its
 * neighbours; only fetch/network errors rethrow, so the queue task's
 * retry/backoff engages for transient failures. Idempotent: an episode
 * already `done` whose local asset still matches its recorded checksum
 * (and the feed's declared length) is a no-op.
 */
export async function migrateEpisodeEnclosure(
  store: MediaPublishingStore,
  episodeId: string,
  options: PodcastMediaMigrationOptions = {},
): Promise<PodcastMediaMigrationResult> {
  const episode = await store.findByID({
    collection: 'podcast-episodes',
    id: episodeId,
    depth: 0,
    overrideAccess: true,
  })
  if (!episode) throw new Error('Podcast episode not found for media migration.')
  const siteId = relationId(episode.site)
  if (!siteId) throw new Error('Podcast episode has no site scope for media migration.')

  if (episode.mediaMigrationState === 'done' && episode.audio) {
    const asset = await store
      .findByID({
        collection: 'media-assets',
        id: relationId(episode.audio),
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (
      asset &&
      episode.mediaChecksum &&
      asset.checksum === `sha256:${episode.mediaChecksum}` &&
      (!episode.enclosureBytes || Number(asset.sizeBytes) === Number(episode.enclosureBytes))
    ) {
      return {
        episodeId,
        state: 'done',
        completed: true,
        mediaAssetId: relationId(asset),
        checksum: String(episode.mediaChecksum),
        bytes: Number(asset.sizeBytes),
        alreadyMigrated: true,
      }
    }
  }

  const enclosureUrl = typeof episode.externalUrl === 'string' ? episode.externalUrl : ''
  if (!enclosureUrl)
    return failMigration(store, episodeId, 'Episode has no remote enclosure URL to migrate.')

  await setMigrationState(store, episodeId, {
    mediaMigrationState: 'fetching',
    mediaMigrationError: null,
  })

  const cap = options.maxBytes ?? PODCAST_ENCLOSURE_MAX_BYTES
  let bytes: Uint8Array
  try {
    const response = await safeFetch(
      enclosureUrl,
      { headers: { accept: 'audio/*' } },
      {
        fetcher: options.fetcher,
        resolve: options.resolve,
        allowPrivate: options.allowPrivate,
        allowHttp: options.allowPrivate,
        allowedContentTypes: [...ALLOWED_ENCLOSURE_CONTENT_TYPES],
        maxBytes: cap,
        timeoutMs: options.timeoutMs ?? 5 * 60_000,
      },
    )
    if (!response.ok) throw new Error(`Enclosure fetch returned ${response.status}.`)
    bytes = await readBoundedBody(response, cap)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Enclosure fetch failed.'
    await failMigration(store, episodeId, message)
    throw error
  }

  await setMigrationState(store, episodeId, { mediaMigrationState: 'verifying' })
  const checksum = createHash('sha256').update(bytes).digest('hex')
  const declaredBytes = Number(episode.enclosureBytes || 0)
  if (declaredBytes > 0 && bytes.byteLength !== declaredBytes) {
    return failMigration(
      store,
      episodeId,
      `Enclosure length mismatch: the feed declares ${declaredBytes} bytes but the fetched enclosure is ${bytes.byteLength} bytes. The episode was not re-pointed at the corrupt bytes.`,
    )
  }

  let inspection
  try {
    inspection = inspectMedia(bytes)
  } catch (error) {
    return failMigration(
      store,
      episodeId,
      error instanceof Error ? error.message : 'Fetched enclosure is not supported media.',
    )
  }
  const declaredMime = String(episode.enclosureMimeType ?? '')
  let mimeType: string = inspection.mimeType
  let extension: string = inspection.extension
  if (inspection.kind !== 'audio') {
    // An .m4a enclosure sniffs as a generic MP4 container; the feed's
    // declared audio type is the truthful label for that container.
    if (inspection.mimeType === 'video/mp4' && declaredMime === 'audio/mp4') {
      mimeType = 'audio/mp4'
      extension = 'm4a'
    } else {
      return failMigration(
        store,
        episodeId,
        `Fetched enclosure is ${inspection.mimeType}, not audio media.`,
      )
    }
  }

  const config = options.config ?? loadConfig()
  const storage = mediaStorage(config)
  const prefixedChecksum = `sha256:${checksum}`
  const scope = {
    site: siteId,
    publication: episode.publication ?? null,
    space: episode.space ?? null,
  }
  const knownBlobs = await store
    .find({
      collection: 'media-blobs',
      where: {
        and: [{ site: { equals: siteId } }, { checksum: { equals: prefixedChecksum } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Doc[] }))
  let blob = knownBlobs.docs[0]
  if (!blob) {
    const key = mediaObjectKey(siteId, extension)
    await storage.put(key, bytes, mimeType)
    try {
      blob = await store.create({
        collection: 'media-blobs',
        data: {
          ...scope,
          checksum: prefixedChecksum,
          storageKey: key,
          storageProvider: storage.provider,
          mimeType,
          sizeBytes: bytes.byteLength,
          state: 'ready',
        },
        overrideAccess: true,
      })
    } catch (error) {
      await storage.remove(key).catch(() => undefined)
      throw error
    }
  } else {
    const existingBytes = await storage.get(String(blob.storageKey)).catch(() => undefined)
    if (!existingBytes) await storage.put(String(blob.storageKey), bytes, mimeType)
  }

  const knownAssets = await store
    .find({
      collection: 'media-assets',
      where: {
        and: [{ site: { equals: siteId } }, { originalBlob: { equals: relationId(blob) } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Doc[] }))
  let asset = knownAssets.docs[0]
  if (!asset) {
    // Metadata extraction is best-effort decoration; it must never fail a
    // migration whose bytes already verified.
    const audioMetadata = (() => {
      try {
        return inspectAudioMetadata(bytes)
      } catch {
        return undefined
      }
    })()
    asset = await store.create({
      collection: 'media-assets',
      data: {
        ...scope,
        owner: episode.owner ?? null,
        title: String(episode.title ?? 'Imported episode audio'),
        kind: 'audio',
        storageLocation: String(blob.storageKey),
        storageProvider: storage.provider,
        originalBlob: relationId(blob),
        originalFilename:
          enclosureUrl.split('/').pop()?.split('?')[0]?.slice(0, 255) || 'episode-audio',
        mimeType,
        sizeBytes: bytes.byteLength,
        checksum: prefixedChecksum,
        durationSeconds: audioMetadata?.durationSeconds,
        audioMetadata: audioMetadata ? { ...audioMetadata, checksum: prefixedChecksum } : null,
      },
      overrideAccess: true,
    })
  }

  await setMigrationState(store, episodeId, {
    audio: relationId(asset),
    mediaMigrationState: 'done',
    mediaMigrationError: null,
    mediaChecksum: checksum,
    enclosureBytes: bytes.byteLength,
    enclosureMimeType: mimeType,
  })
  return {
    episodeId,
    state: 'done',
    completed: true,
    mediaAssetId: relationId(asset),
    checksum,
    bytes: bytes.byteLength,
  }
}

/**
 * Enqueues the `podcast-import-media` Payload task for one episode,
 * deduplicated against a still-active job for the same episode (the
 * media-variant queue pattern). A previously errored or completed job
 * does not block a fresh enqueue, so a rerun can always re-drive a
 * failed migration.
 */
export async function queuePodcastImportMediaTask(
  payload: MediaPublishingStore & {
    jobs: { queue: (args: any) => Promise<{ id: string | number }> }
  },
  episodeId: string,
): Promise<{ id: string; queued: boolean }> {
  const idempotencyKey = `podcast-import-media:${episodeId}`
  const existing = await payload
    .find({
      collection: 'payload-jobs',
      where: {
        and: [
          { taskSlug: { equals: 'podcast-import-media' } },
          { 'input.idempotencyKey': { equals: idempotencyKey } },
        ],
      },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Doc[] }))
  const active = existing.docs.find((job) => !job.hasError && !job.completedAt)
  if (active) return { id: String(active.id), queued: false }
  const job = await payload.jobs.queue({
    task: 'podcast-import-media',
    queue: 'media',
    input: { episodeId, idempotencyKey },
  } as never)
  return { id: String(job.id), queued: true }
}

export type ReconcileClaimedImportShowsOptions = PodcastMediaMigrationOptions & {
  /** Run enclosure migration inline instead of enqueueing the queue task. */
  inline?: boolean
  /** Set false to sync metadata only. Defaults to true: reconciliation completes imports. */
  migrateRemoteMedia?: boolean
}

/**
 * Reconciliation loop (POD-REQ-07): re-runs feed sync for every
 * claimed-import show on a site. Shows whose ownership has flipped to
 * local — by a user edit, see the podcast-episodes hook — are no longer
 * claimed, so they are skipped here and `importPodcastFeed` would refuse
 * them anyway. Shows without a recorded external feed URL are reported
 * as skipped, never silently dropped.
 */
export async function reconcileClaimedImportShows(
  payload: MediaPublishingStore & {
    jobs: { queue: (args: any) => Promise<{ id: string | number }> }
  },
  siteId: string,
  options: ReconcileClaimedImportShowsOptions = {},
) {
  const shows = await payload.find({
    collection: 'podcast-shows',
    where: {
      and: [{ site: { equals: siteId } }, { importOwnership: { equals: 'claimed-import' } }],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const results: Doc[] = []
  for (const show of shows.docs) {
    const showId = relationId(show)
    if (!show.externalFeedUrl) {
      results.push({
        showId,
        skipped: true,
        reason: 'Claimed-import show has no external feed URL recorded.',
      })
      continue
    }
    // Per-show isolation: one unreachable or unclaimed feed must not stop
    // the remaining shows from reconciling; the failure is reported in
    // that show's result row instead.
    try {
      const result = await importPodcastFeed(payload, {
        siteId,
        showId,
        feedUrl: String(show.externalFeedUrl),
        fetcher: options.fetcher,
        resolve: options.resolve,
        allowPrivate: options.allowPrivate,
        migrateRemoteMedia: options.migrateRemoteMedia ?? true,
        enqueueMediaMigration: options.inline
          ? undefined
          : async (episodeId) => {
              await queuePodcastImportMediaTask(payload, episodeId)
            },
        runMediaMigration: options.inline
          ? (episodeId) => migrateEpisodeEnclosure(payload, episodeId, options)
          : undefined,
      })
      results.push({ showId, ...result })
    } catch (error) {
      results.push({
        showId,
        error: error instanceof Error ? error.message : 'Feed reconciliation failed.',
      })
    }
  }
  return { shows: results.length, results }
}

const xmlEscape = (value: unknown) =>
  String(value ?? '').replace(
    /[<>&'"]/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character]!,
  )

/**
 * New-feed toolkit (POD-REQ-07): the migration guidance artifact for a
 * show moving to a new feed URL, in or out of Renegade. Returns text
 * only — nothing is stored. `redirectDocument` is served at the OLD feed
 * URL when a true HTTP 301 is not available: it carries
 * `itunes:new-feed-url` and, critically, `podcast:locked` = "no" (a
 * locked feed tells clients not to follow a move). `checklist` is the
 * per-show human runbook, including the preferred 301 path.
 */
export function buildMovedFeedRedirect(
  show: { title: string; slug?: string; externalFeedUrl?: string; lockedOwnerEmail?: string },
  newFeedUrl: string,
): { redirectDocument: string; checklist: string; newFeedUrl: string } {
  let parsed: URL
  try {
    parsed = new URL(newFeedUrl)
  } catch {
    throw new Error('New feed URL is invalid.')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new Error('New feed URL must be an unauthenticated HTTP(S) URL.')
  const title = show.title || 'This podcast'
  const oldFeedUrl = show.externalFeedUrl || ''
  const redirectDocument =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom">` +
    `<channel><title>${xmlEscape(title)}</title><link>${xmlEscape(newFeedUrl)}</link>` +
    `<description>${xmlEscape(`${title} has moved. The new feed is ${newFeedUrl} — podcast apps should update automatically; if yours does not, subscribe to the new feed URL.`)}</description>` +
    (oldFeedUrl
      ? `<atom:link href="${xmlEscape(oldFeedUrl)}" rel="self" type="application/rss+xml"/>`
      : '') +
    `<atom:link href="${xmlEscape(newFeedUrl)}" rel="alternate" type="application/rss+xml"/>` +
    `<itunes:new-feed-url>${xmlEscape(newFeedUrl)}</itunes:new-feed-url>` +
    `<podcast:locked${show.lockedOwnerEmail ? ` owner="${xmlEscape(show.lockedOwnerEmail)}"` : ''}>no</podcast:locked>` +
    `</channel></rss>\n`
  const checklist = [
    `# Feed move checklist — ${title}`,
    '',
    `New feed URL: ${newFeedUrl}`,
    oldFeedUrl ? `Old feed URL: ${oldFeedUrl}` : 'Old feed URL: (record it before you start)',
    '',
    '1. Publish the new feed and confirm every episode enclosure resolves from it.',
    '2. Confirm the new feed keeps the same per-episode GUIDs, so subscribers do not see duplicate episodes.',
    '3. Preferred: configure the old host to answer the old feed URL with an HTTP 301 redirect to the new feed URL.',
    '4. If a 301 is not available, serve the generated redirect document at the old feed URL instead. It carries `itunes:new-feed-url` and `podcast:locked` set to "no" — a locked feed tells clients not to follow a move, so never move a feed while it is locked.',
    '5. Keep the old feed URL answering (301 or the redirect document) for at least 30 days; directories and apps poll on their own schedules.',
    '6. Update the feed URL in every directory listing (Apple Podcasts, Spotify, Podcast Index) and confirm each one shows the new URL.',
    '7. Announce the move in an episode and in the show notes; some apps require a manual re-subscribe despite the redirect.',
    '8. Only after the old feed has been quiet for a full directory cycle, retire the old host.',
    '',
  ].join('\n')
  return { redirectDocument, checklist, newFeedUrl }
}
