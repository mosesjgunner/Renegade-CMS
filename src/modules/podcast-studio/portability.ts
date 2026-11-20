/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
/**
 * POD-19 (POD-REQ-41/42): the Podcast Studio portability bundle.
 *
 * One show exports to a self-describing bundle directory:
 *
 *   manifest.json        POD-00 ProjectBundleManifest v1 — every content
 *                        file with its SHA-256 (the checksums manifest).
 *   README.md            human map of every file + restore instructions.
 *   show.json            show metadata (credential material NEVER included:
 *                        no stream credential envelope/env name, no tokens).
 *   feed.xml             the current public feed (POD-01 builder output).
 *   feed-full.xml        the owner's full feed incl. members-only items.
 *   feeds.opml           OPML subscription list for the show's feed.
 *   episodes/<slug>.json episode metadata incl. GUID + chapters + persons.
 *   transcripts/<slug>.json / .srt   current transcript revision serialised
 *                        from the one segment source (POD-01 formats).
 *   chapters/<slug>.json Podcasting 2.0 chapters JSON.
 *   sessions/<id>.json   POD-05 studio session documents (POD-00 schema).
 *   rundowns/<id>.opml   per-session rundown OPML (POD-05).
 *   edls/<id>.json       POD-12 edit-project documents (EDL inside).
 *   media/<assetId>.<ext> media bytes WITHIN the size policy (below);
 *                        larger files are manifest-only entries in
 *                        media-manifest.json with checksum + size +
 *                        storage key so an operator can copy them
 *                        out-of-band and import can verify them.
 *   artwork/…            show + episode artwork (media policy applies).
 *
 * MEDIA SIZE POLICY (stated, POD-REQ-41): a media file is copied into
 * the bundle when it is ≤ 100 MiB AND the running total of copied media
 * stays ≤ 1 GiB. Anything larger is manifest-only. Rationale: bundles
 * stay shippable as one directory/zip for the 1–2 GB-class installs
 * Renegade targets; masters larger than the policy ride the platform
 * backup (docs/podcast-studio/BACKUP.md), not the portability bundle.
 *
 * SECRETS: the bundle NEVER contains stream credentials (envelope or
 * env-var name), member-feed tokens or their hashes, guest invite
 * tokens/hashes, signalling credentials, or TURN credentials. The show's
 * stream PROFILE (URLs/bitrates — public-shaped data) is exported; the
 * credential must be re-entered on the target install (README says so).
 * A defence-in-depth redaction pass drops any key matching the secret
 * pattern from exported JSON documents.
 *
 * IMPORT restores into a target site on (possibly) a fresh database:
 * checksums are verified before anything is written; GUIDs (channel
 * podcastGuidValue + per-episode guid), chapters, transcripts,
 * production states and enclosure checksums are preserved; media blobs
 * dedupe by (site, checksum) exactly like POD-02 imports; session/EDL
 * documents are restored with show/episode/asset ids remapped through
 * the manifest's idMapping. A feed-URL change after import is handled
 * by the POD-02 moved-feed machinery (buildMovedFeedRedirect) — the
 * README spells out the steps.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { loadConfig, type AppConfig } from '../core/config'
import { podcastTranscriptJson, podcastTranscriptSrt } from '../media/publishing'
import { mediaStorage } from '../media/storage'
import { mediaStorageKey } from '../media/workflow'
import {
  parseProjectBundleManifest,
  type ProjectBundleContent,
  type ProjectBundleManifest,
} from './contracts/bundle'
import { renderPodcastFeed } from './feed-build'
import { rundownToOpml } from './opml'

export const PODCAST_BUNDLE_FORMAT = 'renegade-podcast-show-bundle'
export const PODCAST_BUNDLE_MEDIA_FILE_MAX_BYTES = 100 * 1024 * 1024
export const PODCAST_BUNDLE_MEDIA_TOTAL_MAX_BYTES = 1024 * 1024 * 1024

export class PodcastPortabilityError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'PodcastPortabilityError'
    this.code = code
  }
}

const sha256Hex = (bytes: Uint8Array | string) =>
  createHash('sha256')
    .update(bytes as any)
    .digest('hex')

const relationId = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id: unknown }).id ?? '')
      : ''

/** Defence-in-depth: no exported JSON may carry credential-shaped keys. */
const SECRET_KEY = /(secret|password|credential|token|private.?key|api.?key|hash)/i
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SECRET_KEY.test(key))
      .map(([key, nested]) => [key, redactSecrets(nested)]),
  )
}

const pick = (doc: any, fields: readonly string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    if (doc?.[field] !== undefined && doc?.[field] !== null) out[field] = doc[field]
  }
  return out
}

/** Show fields that travel. Credential + token material is excluded by construction. */
export const BUNDLE_SHOW_FIELDS = [
  'title',
  'slug',
  'description',
  'body',
  'language',
  'explicit',
  'rssEnabled',
  'externalFeedUrl',
  'feedVisibility',
  'guestConsentPolicy',
  'recordingRetentionDays',
  'requiredEntitlement',
  'importOwnership',
  'podcastGuidValue',
  'lockedOwnerEmail',
  'directoryOwnerEmail',
  'medium',
  'funding',
  'value',
  'persons',
  'exportProfile',
  'streamProfile',
  'status',
  'publishedAt',
] as const

/** Episode fields that travel (relationships are remapped on import). */
export const BUNDLE_EPISODE_FIELDS = [
  'title',
  'slug',
  'description',
  'body',
  'language',
  'explicit',
  'membersOnly',
  'productionState',
  'guid',
  'episodeNumber',
  'seasonNumber',
  'showNotes',
  'credits',
  'rights',
  'externalUrl',
  'providerIdentity',
  'enclosureBytes',
  'enclosureMimeType',
  'mediaChecksum',
  'mediaMigrationState',
  'chapters',
  'persons',
  'liveState',
  'liveStartAt',
  'liveEndAt',
  'liveStreamUrl',
  'status',
  'publishedAt',
] as const

export type BundleMediaEntry = {
  assetId: string
  kind: string
  role: 'episode-audio' | 'episode-artwork' | 'episode-video' | 'show-artwork' | 'downloadable'
  episodeSlug?: string
  mimeType: string
  sizeBytes: number
  /** SHA-256 hex of the bytes (without any storage-level suffix). */
  checksumSha256: string
  /** Bundle-relative path when the bytes are in the bundle; null when manifest-only. */
  bundlePath: string | null
  /** Source storage key, for out-of-band copy of manifest-only files. */
  storageKey: string | null
}

export type ExportShowBundleResult = {
  bundleDir: string
  manifest: ProjectBundleManifest
  media: BundleMediaEntry[]
  counts: { episodes: number; sessions: number; editProjects: number; transcripts: number }
}

export type ExportShowBundleOptions = {
  config?: AppConfig
  origin?: string
  mediaFileMaxBytes?: number
  mediaTotalMaxBytes?: number
  exportedAt?: string
}

const extensionFor = (mimeType: string): string => {
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  return map[mimeType] ?? 'bin'
}

async function writeBundleFile(
  bundleDir: string,
  relative: string,
  bytes: Uint8Array | string,
  contents: ProjectBundleContent[],
  kind: string,
  id: string,
): Promise<void> {
  const data = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes
  const target = path.join(bundleDir, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, data)
  contents.push({ kind, id, path: relative, checksumSha256: sha256Hex(data) })
}

export async function exportShowBundle(
  payload: any,
  showId: string,
  bundleDir: string,
  options: ExportShowBundleOptions = {},
): Promise<ExportShowBundleResult> {
  const config = options.config ?? loadConfig()
  const origin = options.origin ?? config.appUrl
  const storage = mediaStorage(config)
  const fileMax = options.mediaFileMaxBytes ?? PODCAST_BUNDLE_MEDIA_FILE_MAX_BYTES
  const totalMax = options.mediaTotalMaxBytes ?? PODCAST_BUNDLE_MEDIA_TOTAL_MAX_BYTES

  const show = await payload
    .findByID({ collection: 'podcast-shows', id: showId, depth: 2, overrideAccess: true } as never)
    .catch(() => null)
  if (!show) {
    throw new PodcastPortabilityError('bundle-show-not-found', `Podcast show not found: ${showId}`)
  }
  const siteId = relationId(show.site)

  const episodesResult = await payload.find({
    collection: 'podcast-episodes',
    where: { show: { equals: showId } },
    limit: 0,
    pagination: false,
    depth: 2,
    sort: 'publishedAt',
    overrideAccess: true,
  } as never)
  const episodes: any[] = episodesResult.docs ?? []

  const sessionsResult = await payload.find({
    collection: 'podcast-studio-sessions',
    where: { show: { equals: showId } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  } as never)
  const sessions: any[] = sessionsResult.docs ?? []

  const projectsResult = await payload.find({
    collection: 'podcast-edit-projects',
    where: { show: { equals: showId } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  } as never)
  const projects: any[] = projectsResult.docs ?? []

  await mkdir(bundleDir, { recursive: true })
  const contents: ProjectBundleContent[] = []
  const media: BundleMediaEntry[] = []
  let copiedMediaBytes = 0

  // -- media (dedupe by asset id; one entry per asset however often used)
  const seenAssets = new Set<string>()
  const exportAsset = async (
    asset: any,
    role: BundleMediaEntry['role'],
    episodeSlug?: string,
  ): Promise<void> => {
    const assetId = relationId(asset) || String(asset?.id ?? '')
    if (!assetId || seenAssets.has(assetId)) return
    seenAssets.add(assetId)
    const mimeType = String(asset.mimeType ?? 'application/octet-stream')
    const sizeBytes = Number(asset.sizeBytes ?? 0)
    const storageKey = await mediaStorageKey(payload, asset).catch(() => undefined)
    let bundlePath: string | null = null
    let checksumSha256 = ''
    const bytes = storageKey ? await storage.get(storageKey).catch(() => undefined) : undefined
    if (bytes) {
      checksumSha256 = sha256Hex(bytes)
      if (bytes.byteLength <= fileMax && copiedMediaBytes + bytes.byteLength <= totalMax) {
        bundlePath = `media/${assetId}.${extensionFor(mimeType)}`
        copiedMediaBytes += bytes.byteLength
        await writeBundleFile(bundleDir, bundlePath, bytes, contents, 'media', assetId)
      }
    }
    if (!checksumSha256) {
      // Fall back to the recorded asset checksum (strip storage suffixes).
      checksumSha256 = String(asset.checksum ?? '')
        .replace(/^sha256:/, '')
        .split(':')[0]
    }
    media.push({
      assetId,
      kind: String(asset.kind ?? ''),
      role,
      ...(episodeSlug ? { episodeSlug } : {}),
      mimeType,
      sizeBytes: bytes ? bytes.byteLength : sizeBytes,
      checksumSha256,
      bundlePath,
      storageKey: storageKey ?? null,
    })
  }

  if (show.artwork) await exportAsset(show.artwork, 'show-artwork')
  for (const episode of episodes) {
    if (episode.audio) await exportAsset(episode.audio, 'episode-audio', String(episode.slug))
    if (episode.artwork) await exportAsset(episode.artwork, 'episode-artwork', String(episode.slug))
    if (episode.video) await exportAsset(episode.video, 'episode-video', String(episode.slug))
    for (const file of Array.isArray(episode.downloadableFiles) ? episode.downloadableFiles : []) {
      await exportAsset(file, 'downloadable', String(episode.slug))
    }
  }

  // -- show.json
  const showDoc: Record<string, unknown> = {
    ...pick(show, BUNDLE_SHOW_FIELDS),
    id: String(show.id),
    siteId,
    artworkAssetId: show.artwork ? relationId(show.artwork) : null,
    categoryTitles: (Array.isArray(show.categories) ? show.categories : []).map((c: any) =>
      String(c?.title ?? c?.name ?? ''),
    ),
    hostNames: (Array.isArray(show.hosts) ? show.hosts : []).map((a: any) =>
      String(a?.displayName ?? a?.name ?? ''),
    ),
  }
  await writeBundleFile(
    bundleDir,
    'show.json',
    JSON.stringify(redactSecrets(showDoc), null, 2),
    contents,
    'show',
    String(show.id),
  )

  // -- feeds (current public + owner's full)
  const published = episodes.filter((episode) =>
    ['published', 'updated'].includes(String(episode.status)),
  )
  const feedOptions = {
    origin,
    feedPath: `/podcasts/${show.slug}/feed.xml`,
    showPath: `/podcasts/${show.slug}`,
  }
  await writeBundleFile(
    bundleDir,
    'feed.xml',
    renderPodcastFeed(show, published, { ...feedOptions, includeMembersOnly: false }),
    contents,
    'feed',
    String(show.id),
  )
  await writeBundleFile(
    bundleDir,
    'feed-full.xml',
    renderPodcastFeed(show, published, { ...feedOptions, includeMembersOnly: true }),
    contents,
    'feed-full',
    String(show.id),
  )
  const feedUrl = new URL(feedOptions.feedPath, origin).toString()
  const opml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n` +
    `    <title>${String(show.title ?? show.slug)} — feeds</title>\n  </head>\n  <body>\n` +
    `    <outline text="${String(show.title ?? show.slug)}" title="${String(show.title ?? show.slug)}" type="rss" xmlUrl="${feedUrl}" htmlUrl="${new URL(feedOptions.showPath, origin).toString()}"/>\n` +
    `  </body>\n</opml>\n`
  await writeBundleFile(bundleDir, 'feeds.opml', opml, contents, 'opml', String(show.id))

  // -- episodes, transcripts, chapters
  let transcriptCount = 0
  for (const episode of episodes) {
    const slug = String(episode.slug)
    const episodeDoc: Record<string, unknown> = {
      ...pick(episode, BUNDLE_EPISODE_FIELDS),
      id: String(episode.id),
      showId: String(show.id),
      audioAssetId: episode.audio ? relationId(episode.audio) : null,
      artworkAssetId: episode.artwork ? relationId(episode.artwork) : null,
      videoAssetId: episode.video ? relationId(episode.video) : null,
      downloadableAssetIds: (Array.isArray(episode.downloadableFiles)
        ? episode.downloadableFiles
        : []
      ).map((file: any) => relationId(file)),
      guestNames: (Array.isArray(episode.guests) ? episode.guests : []).map((a: any) =>
        String(a?.displayName ?? a?.name ?? ''),
      ),
      authorNames: (Array.isArray(episode.authors) ? episode.authors : []).map((a: any) =>
        String(a?.displayName ?? a?.name ?? ''),
      ),
    }
    await writeBundleFile(
      bundleDir,
      `episodes/${slug}.json`,
      JSON.stringify(redactSecrets(episodeDoc), null, 2),
      contents,
      'episode',
      String(episode.id),
    )
    if (Array.isArray(episode.chapters) && episode.chapters.length) {
      await writeBundleFile(
        bundleDir,
        `chapters/${slug}.json`,
        JSON.stringify({ version: '1.2.0', chapters: episode.chapters }, null, 2),
        contents,
        'chapters',
        String(episode.id),
      )
    }
    if (episode.transcript) {
      // Segments come straight off the populated transcript revision —
      // NOT via the public loadEpisodeTranscript, which (POD-19 fix)
      // refuses members-only episodes; an owner's export must carry
      // their transcripts too.
      const revision = episode.transcript as any
      const rawSegments: any[] = Array.isArray(revision?.segments) ? revision.segments : []
      const segments = rawSegments.map((segment: any) => ({
        startSeconds: Number(segment.startSeconds ?? segment.startTime ?? 0),
        endSeconds: Number(segment.endSeconds ?? segment.endTime ?? 0),
        text: String(segment.text ?? segment.body ?? ''),
        ...(segment.speaker ? { speaker: String(segment.speaker) } : {}),
      }))
      if (segments.length) {
        transcriptCount += 1
        await writeBundleFile(
          bundleDir,
          `transcripts/${slug}.json`,
          JSON.stringify(podcastTranscriptJson(segments), null, 2),
          contents,
          'transcript',
          String(episode.id),
        )
        await writeBundleFile(
          bundleDir,
          `transcripts/${slug}.srt`,
          podcastTranscriptSrt(segments),
          contents,
          'transcript-srt',
          String(episode.id),
        )
        // Raw segments ride the episode JSON too so import restores the
        // revision losslessly (the serialisations above are for humans
        // and other tools).
        const episodeJsonPath = path.join(bundleDir, 'episodes', `${slug}.json`)
        const parsed = JSON.parse(await readFile(episodeJsonPath, 'utf8'))
        parsed.transcriptSegments = segments
        await writeFile(episodeJsonPath, JSON.stringify(parsed, null, 2))
        const entry = contents.find((c) => c.kind === 'episode' && c.id === String(episode.id))
        if (entry) entry.checksumSha256 = sha256Hex(await readFile(episodeJsonPath))
      }
    }
  }

  // -- sessions + rundowns + EDLs
  for (const record of sessions) {
    const sessionDoc = (record as any).sessionData
    if (!sessionDoc) continue
    await writeBundleFile(
      bundleDir,
      `sessions/${record.id}.json`,
      JSON.stringify(redactSecrets(sessionDoc), null, 2),
      contents,
      'session',
      String(record.id),
    )
    try {
      await writeBundleFile(
        bundleDir,
        `rundowns/${record.id}.opml`,
        rundownToOpml(sessionDoc as never),
        contents,
        'rundown-opml',
        String(record.id),
      )
    } catch {
      // A session document that cannot serialise a rundown still exports
      // its JSON above; the rundown is a convenience projection.
    }
  }
  for (const project of projects) {
    const projectDoc = (project as any).projectData
    if (!projectDoc) continue
    await writeBundleFile(
      bundleDir,
      `edls/${project.id}.json`,
      JSON.stringify(
        redactSecrets({
          title: project.title,
          episodeId: (project as any).episode ? relationId((project as any).episode) : null,
          sessionId: (project as any).session ? relationId((project as any).session) : null,
          recordingId: (project as any).recording ? relationId((project as any).recording) : null,
          projectData: projectDoc,
        }),
        null,
        2,
      ),
      contents,
      'edl',
      String(project.id),
    )
  }

  // -- media manifest (every asset; bundlePath null = copy out-of-band)
  await writeBundleFile(
    bundleDir,
    'media-manifest.json',
    JSON.stringify({ version: 1, media }, null, 2),
    contents,
    'media-manifest',
    String(show.id),
  )

  const manifest: ProjectBundleManifest = {
    version: 1,
    bundleId: randomUUID(),
    createdAt: options.exportedAt ?? new Date().toISOString(),
    show: { id: String(show.id), title: String(show.title ?? show.slug) },
    contents,
    permissionsManifest: [
      {
        role: 'owner',
        capabilities: ['export', 'import', 'publish'],
      },
    ],
  }
  // Validate our own manifest against the POD-00 contract before writing.
  parseProjectBundleManifest(manifest)
  await writeFile(path.join(bundleDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  await writeFile(path.join(bundleDir, 'README.md'), bundleReadme(show, media, manifest))

  return {
    bundleDir,
    manifest,
    media,
    counts: {
      episodes: episodes.length,
      sessions: sessions.length,
      editProjects: projects.length,
      transcripts: transcriptCount,
    },
  }
}

function bundleReadme(
  show: any,
  media: BundleMediaEntry[],
  manifest: ProjectBundleManifest,
): string {
  const manifestOnly = media.filter((entry) => !entry.bundlePath)
  return `# ${show.title ?? show.slug} — Renegade Podcast Studio show bundle

Exported ${manifest.createdAt} · bundle id ${manifest.bundleId} · format:
POD-00 ProjectBundleManifest v1 (\`manifest.json\` is the checksums
manifest — every content file below is listed there with its SHA-256;
import verifies all of them before writing anything).

## Files

- \`manifest.json\` — bundle manifest + per-file SHA-256 checksums.
- \`show.json\` — show metadata incl. the channel \`podcast:guid\`
  (\`podcastGuidValue\`) and feed config. NO credentials: the stream
  credential, member-feed tokens, guest invites and TURN credentials
  are never exported. Re-enter the stream credential on the target
  install after import.
- \`feed.xml\` — the show's current public feed at export time.
- \`feed-full.xml\` — the owner's full feed, including members-only
  episodes (their enclosures point at the source install; the bundle's
  media files are the portable copy).
- \`feeds.opml\` — OPML subscription entry for the feed.
- \`episodes/<slug>.json\` — one file per episode: metadata, GUID,
  chapters, persons, production state, enclosure checksum, and the
  current transcript's timed segments (\`transcriptSegments\`).
- \`transcripts/<slug>.json\` / \`.srt\` — the transcript in Podcast
  JSON and SubRip serialisations (same segment source).
- \`chapters/<slug>.json\` — Podcasting 2.0 chapters JSON per episode.
- \`sessions/<id>.json\` — studio session documents (POD-00 session
  schema: rundown, cartwall, mixer snapshot, chapters, log).
- \`rundowns/<id>.opml\` — each session's rundown as OPML.
- \`edls/<id>.json\` — edit projects: the POD-00 EDL document plus its
  title and source bindings.
- \`media/<assetId>.<ext>\` — media bytes for files inside the size
  policy (≤ ${PODCAST_BUNDLE_MEDIA_FILE_MAX_BYTES / (1024 * 1024)} MiB per
  file, ≤ ${PODCAST_BUNDLE_MEDIA_TOTAL_MAX_BYTES / (1024 * 1024 * 1024)} GiB
  total per bundle).
- \`media-manifest.json\` — every media asset of the show: checksum,
  size, MIME type, and either its bundle path or (for manifest-only
  files) the source storage key to copy out-of-band.
${manifestOnly.length ? `\n## Manifest-only media (copy these out-of-band before import)\n\n${manifestOnly.map((entry) => `- ${entry.assetId} (${entry.role}, ${entry.sizeBytes} bytes, sha256 ${entry.checksumSha256}) — source storage key: ${entry.storageKey ?? 'unknown'}`).join('\n')}\n` : ''}
## Restore

1. On the target install, pick (or create) the site the show belongs to.
2. Run the operator CLI:
   \`npx tsx src/scripts/podcast-studio-bundle.ts import --bundle <dir> --site <siteId>\`
   (or call \`importShowBundle\` from \`src/modules/podcast-studio/portability.ts\`).
3. Import verifies every checksum in \`manifest.json\` first, then
   recreates media (deduped by checksum), the show (channel GUID
   preserved), episodes (episode GUIDs, chapters, transcripts,
   production states and enclosure checksums preserved), sessions and
   edit projects with ids remapped to the new install.
4. Re-enter secrets on the target: stream credential, member-feed
   tokens (members re-issue), guest invites (re-issue), TURN config
   (environment). None of them travel in this bundle, by design.

## If the feed URL changes

The channel GUID and episode GUIDs do NOT change when a show moves —
that is what they are for. To move podcatchers to the new feed URL,
publish the POD-02 moved-feed redirect document at the OLD feed URL
(\`buildMovedFeedRedirect\` in \`src/modules/podcast-studio/import-media.ts\`
emits the \`podcast:locked\`-aware \`itunes:new-feed-url\` document plus a
per-show checklist; see \`docs/podcast-studio/IMPORT_EXPORT.md\`).
`
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type ImportShowBundleResult = {
  showId: string
  showSlug: string
  slugAdjusted: boolean
  episodes: number
  sessions: number
  editProjects: number
  mediaImported: number
  mediaManifestOnly: string[]
  idMapping: Record<string, string>
  warnings: string[]
}

async function readJsonFile<T>(bundleDir: string, relative: string): Promise<T> {
  return JSON.parse(await readFile(path.join(bundleDir, relative), 'utf8')) as T
}

/** Deep-remap string values that are known source ids to their target ids. */
function remapIds(value: unknown, idMapping: Record<string, string>): unknown {
  if (typeof value === 'string') return idMapping[value] ?? value
  if (Array.isArray(value)) return value.map((entry) => remapIds(entry, idMapping))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      remapIds(nested, idMapping),
    ]),
  )
}

export async function importShowBundle(
  payload: any,
  bundleDir: string,
  input: { siteId: string; config?: AppConfig },
): Promise<ImportShowBundleResult> {
  const config = input.config ?? loadConfig()
  const storage = mediaStorage(config)
  const warnings: string[] = []

  // 1. Manifest + checksum verification BEFORE any write.
  const manifest = parseProjectBundleManifest(
    await readJsonFile(bundleDir, 'manifest.json'),
  ) as ProjectBundleManifest
  for (const content of manifest.contents) {
    const bytes = await readFile(path.join(bundleDir, content.path)).catch(() => null)
    if (!bytes) {
      throw new PodcastPortabilityError(
        'bundle-file-missing',
        `Bundle file listed in the manifest is missing: ${content.path}`,
      )
    }
    if (sha256Hex(bytes) !== content.checksumSha256) {
      throw new PodcastPortabilityError(
        'bundle-checksum-mismatch',
        `Bundle checksum mismatch: ${content.path}`,
      )
    }
  }

  const showDoc = await readJsonFile<Record<string, any>>(bundleDir, 'show.json')
  const mediaManifest = await readJsonFile<{ media: BundleMediaEntry[] }>(
    bundleDir,
    'media-manifest.json',
  )
  const idMapping: Record<string, string> = {}
  const mediaManifestOnly: string[] = []

  // 2. Media: recreate blobs + assets for in-bundle files (dedupe by
  //    (site, checksum) — the POD-02 pattern); manifest-only files are
  //    reported, never silently dropped.
  let mediaImported = 0
  for (const entry of mediaManifest.media) {
    if (!entry.bundlePath) {
      mediaManifestOnly.push(entry.assetId)
      continue
    }
    const bytes = await readFile(path.join(bundleDir, entry.bundlePath))
    if (sha256Hex(bytes) !== entry.checksumSha256) {
      throw new PodcastPortabilityError(
        'bundle-media-checksum-mismatch',
        `Media checksum mismatch for asset ${entry.assetId}`,
      )
    }
    const recordedChecksum = `sha256:${entry.checksumSha256}`
    const existing = await payload.find({
      collection: 'media-blobs',
      where: {
        and: [{ site: { equals: input.siteId } }, { checksum: { equals: recordedChecksum } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    let assetId: string
    if (existing.docs?.length) {
      const assets = await payload.find({
        collection: 'media-assets',
        where: { originalBlob: { equals: existing.docs[0].id } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      assetId = String(assets.docs[0].id)
    } else {
      const key = `${input.siteId}/${randomUUID()}.${extensionFor(entry.mimeType)}`
      await storage.put(key, bytes, entry.mimeType)
      const blob = await payload.create({
        collection: 'media-blobs',
        data: {
          site: input.siteId,
          storageKey: key,
          storageProvider: 'local',
          mimeType: entry.mimeType,
          sizeBytes: bytes.byteLength,
          checksum: recordedChecksum,
          state: 'ready',
        },
        overrideAccess: true,
      } as never)
      const asset = await payload.create({
        collection: 'media-assets',
        data: {
          site: input.siteId,
          title: `Imported ${entry.role} ${entry.assetId.slice(0, 8)}`,
          kind: entry.kind || (entry.mimeType.startsWith('audio') ? 'audio' : 'image'),
          storageProvider: 'local',
          originalBlob: blob.id,
          storageLocation: key,
          mimeType: entry.mimeType,
          sizeBytes: bytes.byteLength,
          checksum: recordedChecksum,
        } as any,
        overrideAccess: true,
      } as never)
      assetId = String(asset.id)
    }
    idMapping[entry.assetId] = assetId
    mediaImported += 1
  }

  // 3. Show (slug collision on the target site → suffix, GUID preserved).
  let slug = String(showDoc.slug)
  let slugAdjusted = false
  const clash = await payload.find({
    collection: 'podcast-shows',
    where: {
      and: [{ site: { equals: input.siteId } }, { slug: { equals: slug } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (clash.docs?.length) {
    slug = `${slug}-imported`
    slugAdjusted = true
  }
  const showData: Record<string, unknown> = {
    ...pick(showDoc, BUNDLE_SHOW_FIELDS),
    site: input.siteId,
    slug,
  }
  if (showDoc.artworkAssetId && idMapping[String(showDoc.artworkAssetId)]) {
    showData.artwork = idMapping[String(showDoc.artworkAssetId)]
  }
  const newShow = await payload.create({
    collection: 'podcast-shows',
    data: showData as any,
    overrideAccess: true,
  } as never)
  idMapping[String(showDoc.id)] = String(newShow.id)

  // 4. Episodes (+ transcript revisions).
  const episodeFiles = (await readdir(path.join(bundleDir, 'episodes'))).filter((name) =>
    name.endsWith('.json'),
  )
  let episodeCount = 0
  const episodeIdBySlug = new Map<string, string>()
  for (const file of episodeFiles.sort()) {
    const episodeDoc = await readJsonFile<Record<string, any>>(bundleDir, `episodes/${file}`)
    const data: Record<string, unknown> = {
      ...pick(episodeDoc, BUNDLE_EPISODE_FIELDS),
      site: input.siteId,
      show: String(newShow.id),
    }
    if (episodeDoc.audioAssetId && idMapping[String(episodeDoc.audioAssetId)]) {
      data.audio = idMapping[String(episodeDoc.audioAssetId)]
    } else if (episodeDoc.audioAssetId) {
      warnings.push(
        `Episode ${episodeDoc.slug}: audio asset ${episodeDoc.audioAssetId} is manifest-only; episode imported without audio.`,
      )
    }
    if (episodeDoc.artworkAssetId && idMapping[String(episodeDoc.artworkAssetId)]) {
      data.artwork = idMapping[String(episodeDoc.artworkAssetId)]
    }
    if (episodeDoc.videoAssetId && idMapping[String(episodeDoc.videoAssetId)]) {
      data.video = idMapping[String(episodeDoc.videoAssetId)]
    }
    const created = await payload.create({
      collection: 'podcast-episodes',
      data: data as any,
      overrideAccess: true,
    } as never)
    idMapping[String(episodeDoc.id)] = String(created.id)
    episodeIdBySlug.set(String(episodeDoc.slug), String(created.id))
    episodeCount += 1

    const segments = Array.isArray(episodeDoc.transcriptSegments)
      ? episodeDoc.transcriptSegments
      : []
    if (segments.length) {
      const audioAssetId = data.audio ? String(data.audio) : ''
      if (!audioAssetId) {
        warnings.push(
          `Episode ${episodeDoc.slug}: transcript not restored — transcript revisions require a media asset and the episode's audio is manifest-only.`,
        )
      } else {
        const revision = await payload.create({
          collection: 'transcript-revisions',
          data: {
            title: `${episodeDoc.title} — transcript (imported)`,
            media: audioAssetId,
            version: 1,
            source: 'manual',
            segments,
            checksum: sha256Hex(JSON.stringify(segments)),
            reviewState: 'reviewed',
          } as any,
          overrideAccess: true,
        } as never)
        await payload.update({
          collection: 'podcast-episodes',
          id: created.id,
          data: { transcript: revision.id },
          overrideAccess: true,
        } as never)
      }
    }
  }

  // 5. Sessions + edit projects with id remapping.
  let sessionCount = 0
  const sessionsDir = path.join(bundleDir, 'sessions')
  const sessionFiles = await readdir(sessionsDir).catch(() => [] as string[])
  for (const file of sessionFiles.filter((name) => name.endsWith('.json')).sort()) {
    const sessionDoc = (await readJsonFile<any>(bundleDir, `sessions/${file}`)) as any
    const remapped = remapIds(sessionDoc, idMapping) as any
    if (remapped && typeof remapped === 'object') remapped.showId = String(newShow.id)
    const created = await payload.create({
      collection: 'podcast-studio-sessions',
      data: {
        site: input.siteId,
        show: String(newShow.id),
        title: String(
          remapped?.title ?? remapped?.showTitle ?? showDoc.title ?? 'Imported session',
        ),
        state: ['draft', 'ready', 'live', 'paused', 'recording', 'stopped', 'ended'].includes(
          String(remapped?.state),
        )
          ? String(remapped.state)
          : 'draft',
        sessionData: remapped,
        schemaVersion: 1,
        startedAt: new Date().toISOString(),
        lastSavedAt: new Date().toISOString(),
      } as any,
      overrideAccess: true,
    } as never)
    idMapping[file.replace(/\.json$/, '')] = String(created.id)
    sessionCount += 1
  }

  let projectCount = 0
  const edlsDir = path.join(bundleDir, 'edls')
  const edlFiles = await readdir(edlsDir).catch(() => [] as string[])
  for (const file of edlFiles.filter((name) => name.endsWith('.json')).sort()) {
    const entry = await readJsonFile<Record<string, any>>(bundleDir, `edls/${file}`)
    const projectData = remapIds(entry.projectData, idMapping) as any
    await payload.create({
      collection: 'podcast-edit-projects',
      data: {
        site: input.siteId,
        show: String(newShow.id),
        title: String(entry.title ?? 'Imported edit project'),
        projectData,
        schemaVersion: 1,
        lastSavedAt: new Date().toISOString(),
        ...(entry.episodeId && idMapping[String(entry.episodeId)]
          ? { episode: idMapping[String(entry.episodeId)] }
          : {}),
      } as any,
      overrideAccess: true,
    } as never)
    projectCount += 1
  }

  return {
    showId: String(newShow.id),
    showSlug: slug,
    slugAdjusted,
    episodes: episodeCount,
    sessions: sessionCount,
    editProjects: projectCount,
    mediaImported,
    mediaManifestOnly,
    idMapping,
    warnings,
  }
}
