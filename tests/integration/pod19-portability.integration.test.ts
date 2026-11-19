/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-19 portability (POD-REQ-41/42) against real Payload + Postgres:
 * a produced show (artwork, two published episodes — one members-only —
 * chapters, a transcript revision, a studio session, an edit project)
 * exports to a bundle; the bundle's manifest verifies, its public feed
 * validates with the POD-01 validator, the full feed carries the
 * members-only episode while the public feed does not, and no
 * credential-shaped material appears anywhere in the bundle.
 *
 * The bundle + a fixture marker are written to scratch/pod19/ — the
 * POD-19 restore-proof script (scripts/pod19-restore-proof.sh) and the
 * scratch-DB import suite consume them. Fixtures stay in the shared
 * acceptance DB/media dir (the POD suites' pattern) precisely so the
 * platform backup leg can dump them.
 *
 * Also proven here (POD-19 security fix): the public transcript
 * (HTML/JSON/SRT) and chapters routes answer 404 for the members-only
 * episode while serving the public episode — before the fix they
 * served members-only content anonymously.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { validatePodcastFeed } from '../../src/modules/media/publishing'
import { mediaStorage } from '../../src/modules/media/storage'
import { parseProjectBundleManifest } from '../../src/modules/podcast-studio/contracts/bundle'
import { createProjectFromRecording } from '../../src/modules/podcast-studio/edit/projects-service'
import {
  exportShowBundle,
  type ExportShowBundleResult,
} from '../../src/modules/podcast-studio/portability'
import { createSession } from '../../src/modules/podcast-studio/session-engine'
import { createStudioSessionRecord } from '../../src/modules/podcast-studio/sessions'
import { GET as chaptersGet } from '../../src/app/(frontend)/podcasts/episodes/[slug]/chapters.json/route'
import { GET as transcriptGet } from '../../src/app/(frontend)/podcasts/episodes/[slug]/transcript/route'
import { GET as transcriptJsonGet } from '../../src/app/(frontend)/podcasts/episodes/[slug]/transcript.json/route'
import { GET as transcriptSrtGet } from '../../src/app/(frontend)/podcasts/episodes/[slug]/transcript.srt/route'
import { seed } from '../../src/scripts/seed'

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const wavBytes = (fill: number, dataSize = 800) => {
  const bytes = new Uint8Array(44 + dataSize).fill(fill)
  const view = new DataView(bytes.buffer)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0)
  view.setUint32(4, 36 + dataSize, true)
  bytes.set([0x57, 0x41, 0x56, 0x45], 8)
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 16000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  bytes.set([0x64, 0x61, 0x74, 0x61], 36)
  view.setUint32(40, dataSize, true)
  return bytes
}
const pngBytes = (fill: number) => {
  const bytes = new Uint8Array(256).fill(fill)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  return bytes
}

const SCRATCH = path.resolve('scratch/pod19')
const BUNDLE_DIR = path.join(SCRATCH, 'bundle')

let payload: Payload
let site: any
const runId = randomUUID().slice(0, 8)

let show: any
let publicEpisode: any
let membersEpisode: any
let exported: ExportShowBundleResult

const PUBLIC_AUDIO = wavBytes(31)
const MEMBERS_AUDIO = wavBytes(47)
const SEGMENTS = [
  { startSeconds: 0, endSeconds: 2.5, text: 'Hello from POD-19.', speaker: 'Host' },
  { startSeconds: 2.5, endSeconds: 5, text: 'Portability works.', speaker: 'Host' },
]
const CHAPTERS = [
  { startTime: 0, title: 'Open' },
  { startTime: 120, title: 'Deep dive' },
]

async function makeAsset(label: string, bytes: Uint8Array, mimeType: string, kind: string) {
  const storage = mediaStorage(loadConfig())
  const key = `${site.id}/${randomUUID()}.bin`
  await storage.put(key, bytes, mimeType)
  const checksum = `sha256:${sha256(bytes)}:${randomUUID().slice(0, 8)}`
  const blob = await payload.create({
    collection: 'media-blobs',
    data: {
      site: site.id,
      storageKey: key,
      storageProvider: 'local',
      mimeType,
      sizeBytes: bytes.byteLength,
      checksum,
      state: 'ready',
    },
    overrideAccess: true,
  } as never)
  const asset = await payload.create({
    collection: 'media-assets',
    data: {
      site: site.id,
      title: `POD-19 ${label} ${runId}`,
      kind,
      storageProvider: 'local',
      originalBlob: blob.id,
      storageLocation: key,
      mimeType,
      sizeBytes: bytes.byteLength,
      checksum,
      durationSeconds: 5,
    } as any,
    overrideAccess: true,
  } as never)
  return asset
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  const siteResult = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'demo-publication' } },
    limit: 1,
    overrideAccess: true,
  } as never)
  site = siteResult.docs[0]
  expect(site).toBeTruthy()

  const artwork = await makeAsset('artwork', pngBytes(9), 'image/png', 'image')
  const publicAudio = await makeAsset('public-audio', PUBLIC_AUDIO, 'audio/wav', 'audio')
  const membersAudio = await makeAsset('members-audio', MEMBERS_AUDIO, 'audio/wav', 'audio')

  show = await payload.create({
    collection: 'podcast-shows',
    data: {
      site: site.id,
      title: `POD-19 Portability Show ${runId}`,
      slug: `pod19-show-${runId}`,
      description: 'POD-19 fixture show for bundle + backup proofs.',
      rssEnabled: true,
      feedVisibility: 'public',
      lockedOwnerEmail: 'host@example.test',
      persons: [{ name: 'POD-19 Host', role: 'host', group: 'Hosts' }],
      artwork: artwork.id,
      status: 'published',
      publishedAt: new Date(Date.now() - 7_200_000).toISOString(),
    } as any,
    overrideAccess: true,
  } as never)

  const revision = await payload.create({
    collection: 'transcript-revisions',
    data: {
      title: `POD-19 transcript ${runId}`,
      media: publicAudio.id,
      version: 1,
      source: 'manual',
      segments: SEGMENTS,
      checksum: sha256(new TextEncoder().encode(JSON.stringify(SEGMENTS))),
      reviewState: 'reviewed',
    } as any,
    overrideAccess: true,
  } as never)

  publicEpisode = await payload.create({
    collection: 'podcast-episodes',
    data: {
      site: site.id,
      show: show.id,
      title: 'POD-19 Public Episode',
      slug: `pod19-public-${runId}`,
      description: 'Public episode.',
      audio: publicAudio.id,
      chapters: CHAPTERS,
      transcript: revision.id,
      mediaChecksum: sha256(PUBLIC_AUDIO),
      mediaMigrationState: 'done',
      productionState: 'published',
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    } as any,
    overrideAccess: true,
  } as never)

  membersEpisode = await payload.create({
    collection: 'podcast-episodes',
    data: {
      site: site.id,
      show: show.id,
      title: 'POD-19 Members Episode',
      slug: `pod19-members-${runId}`,
      description: 'Members-only episode.',
      audio: membersAudio.id,
      chapters: CHAPTERS,
      mediaChecksum: sha256(MEMBERS_AUDIO),
      mediaMigrationState: 'done',
      membersOnly: true,
      productionState: 'published',
      status: 'published',
      publishedAt: new Date(Date.now() - 1_800_000).toISOString(),
    } as any,
    overrideAccess: true,
  } as never)

  const session = createSession({
    showId: String(show.id),
    showTitle: String(show.title),
  })
  await createStudioSessionRecord(payload as never, {
    siteId: String(site.id),
    showId: String(show.id),
    title: `POD-19 session ${runId}`,
    session,
  })

  const recording = await payload.create({
    collection: 'podcast-recordings',
    data: {
      site: site.id,
      show: show.id,
      episode: publicEpisode.id,
      state: 'finalized',
      manifest: {
        version: 1,
        sessionId: `sess-pod19-${runId}`,
        createdAt: new Date().toISOString(),
        sampleRate: 48000,
        tracks: [
          {
            trackId: 'program',
            role: 'program',
            channels: 2,
            channelLayout: 'stereo',
            durationSec: 300,
            checksumSha256: 'b'.repeat(64),
            mediaAssetId: String(publicAudio.id),
            syncEvents: [{ type: 'head', trackSamples: 0, timelineSamples: 0 }],
          },
        ],
      },
      markers: [],
      playedClipLog: [],
      trackAssets: [],
      finalizedAt: new Date().toISOString(),
    } as any,
    overrideAccess: true,
  } as never)
  await createProjectFromRecording(payload as never, {
    siteId: String(site.id),
    showId: String(show.id),
    recordingId: String(recording.id),
    title: `POD-19 edit ${runId}`,
  })

  await rm(BUNDLE_DIR, { recursive: true, force: true })
  await mkdir(SCRATCH, { recursive: true })
  exported = await exportShowBundle(payload as never, String(show.id), BUNDLE_DIR, {
    config: loadConfig(),
  })

  const reloadedShow = await payload.findByID({
    collection: 'podcast-shows',
    id: show.id,
    depth: 0,
    overrideAccess: true,
  } as never)
  await writeFile(
    path.join(SCRATCH, 'fixture.json'),
    JSON.stringify(
      {
        runId,
        siteId: String(site.id),
        siteSlug: String(site.slug),
        showId: String(show.id),
        showSlug: String(show.slug),
        showTitle: String(show.title),
        podcastGuidValue: String((reloadedShow as any).podcastGuidValue ?? ''),
        publicEpisodeSlug: String(publicEpisode.slug),
        publicEpisodeGuid: String(publicEpisode.guid),
        membersEpisodeSlug: String(membersEpisode.slug),
        membersEpisodeGuid: String(membersEpisode.guid),
        enclosureSha256: sha256(PUBLIC_AUDIO),
        membersEnclosureSha256: sha256(MEMBERS_AUDIO),
        segments: SEGMENTS,
        chapters: CHAPTERS,
      },
      null,
      2,
    ),
  )
}, 180_000)

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('POD-19 portability bundle', () => {
  it('exports every promised component with a verifying manifest', async () => {
    const manifest = parseProjectBundleManifest(
      JSON.parse(await readFile(path.join(BUNDLE_DIR, 'manifest.json'), 'utf8')),
    )
    expect(manifest.show.id).toBe(String(show.id))
    const paths = manifest.contents.map((entry) => entry.path)
    for (const expected of [
      'show.json',
      'feed.xml',
      'feed-full.xml',
      'feeds.opml',
      'media-manifest.json',
      `episodes/${publicEpisode.slug}.json`,
      `episodes/${membersEpisode.slug}.json`,
      `transcripts/${publicEpisode.slug}.json`,
      `transcripts/${publicEpisode.slug}.srt`,
      `chapters/${publicEpisode.slug}.json`,
    ]) {
      expect(paths).toContain(expected)
    }
    expect(paths.some((entry) => entry.startsWith('sessions/'))).toBe(true)
    expect(paths.some((entry) => entry.startsWith('rundowns/'))).toBe(true)
    expect(paths.some((entry) => entry.startsWith('edls/'))).toBe(true)
    expect(paths.some((entry) => entry.startsWith('media/'))).toBe(true)
    // Every listed checksum verifies against the bytes on disk.
    for (const entry of manifest.contents) {
      const bytes = await readFile(path.join(BUNDLE_DIR, entry.path))
      expect(sha256(bytes)).toBe(entry.checksumSha256)
    }
    const readme = await readFile(path.join(BUNDLE_DIR, 'README.md'), 'utf8')
    expect(readme).toContain('manifest.json')
    expect(readme).toContain('moved-feed')
    expect(exported.counts).toMatchObject({ episodes: 2, sessions: 1, editProjects: 1 })
  })

  it('carries a validating public feed and a full feed with the members-only episode', async () => {
    const feed = await readFile(path.join(BUNDLE_DIR, 'feed.xml'), 'utf8')
    expect(() => validatePodcastFeed(feed)).not.toThrow()
    expect(feed).toContain(String(publicEpisode.guid))
    expect(feed).not.toContain(String(membersEpisode.guid))
    const full = await readFile(path.join(BUNDLE_DIR, 'feed-full.xml'), 'utf8')
    expect(full).toContain(String(membersEpisode.guid))
    const showDoc = JSON.parse(await readFile(path.join(BUNDLE_DIR, 'show.json'), 'utf8'))
    expect(showDoc.podcastGuidValue).toBeTruthy()
    const episodeDoc = JSON.parse(
      await readFile(path.join(BUNDLE_DIR, 'episodes', `${publicEpisode.slug}.json`), 'utf8'),
    )
    expect(episodeDoc.guid).toBe(String(publicEpisode.guid))
    expect(episodeDoc.mediaChecksum).toBe(sha256(PUBLIC_AUDIO))
    expect(episodeDoc.chapters).toEqual(CHAPTERS)
    expect(episodeDoc.transcriptSegments).toEqual(SEGMENTS)
    const mediaManifest = JSON.parse(
      await readFile(path.join(BUNDLE_DIR, 'media-manifest.json'), 'utf8'),
    )
    const audioEntry = mediaManifest.media.find(
      (entry: any) => entry.role === 'episode-audio' && entry.episodeSlug === publicEpisode.slug,
    )
    expect(audioEntry.bundlePath).toBeTruthy()
    expect(audioEntry.checksumSha256).toBe(sha256(PUBLIC_AUDIO))
  })

  it('contains no credential-shaped material anywhere', async () => {
    const files: string[] = []
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) await walk(full)
        else files.push(full)
      }
    }
    await walk(BUNDLE_DIR)
    const all = (
      await Promise.all(files.map((file) => readFile(file, 'utf8').catch(() => '')))
    ).join('\n')
    expect(all).not.toMatch(/streamCredentialEncrypted|tokenHash|signallingTokenHash/)
    const showDoc = JSON.parse(await readFile(path.join(BUNDLE_DIR, 'show.json'), 'utf8'))
    expect(showDoc.streamCredentialEnvName).toBeUndefined()
    expect(showDoc.streamCredentialEncrypted).toBeUndefined()
  })
})

describe('POD-19 members-only public serialisations (security fix)', () => {
  const call = async (handler: any, slug: string) =>
    handler(new Request(`http://localhost:3000/podcasts/episodes/${slug}/x`), {
      params: Promise.resolve({ slug }),
    })
  it('404s transcripts + chapters for the members-only episode, serves the public one', async () => {
    for (const handler of [transcriptGet, transcriptJsonGet, transcriptSrtGet, chaptersGet]) {
      const members = await call(handler, String(membersEpisode.slug))
      expect(members.status).toBe(404)
      const body = await members.text()
      expect(body).not.toContain('Hello from POD-19')
      const pub = await call(handler, String(publicEpisode.slug))
      expect(pub.status).toBe(200)
    }
    const transcript = await call(transcriptJsonGet, String(publicEpisode.slug))
    expect(await transcript.text()).toContain('Hello from POD-19')
  })
})
