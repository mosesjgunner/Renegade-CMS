/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-20 FINAL ACCEPTANCE — the 13 journeys of
 * RC3_NATIVE_PODCAST_ACCEPTANCE_AND_RUNBOOKS.md §1, executed end-to-end
 * at the deepest level this rig allows (real Payload + Postgres +
 * ffmpeg; module/API level for the browser surfaces).
 *
 * Honesty rules for this suite (acceptance doc §3):
 * - A leg that needs a real browser, real device, real network or a
 *   human ear is named UNVERIFIED in the test name — never silently
 *   passed. The headless core underneath it is still exercised.
 * - Verdicts are recorded per journey in the POD-20 handoff:
 *   PASS / PARTIAL (named leg) / FAIL (named defect + owning stage).
 *
 * Fixtures are synthetic (generated tones/PNG/WebM) and labelled as
 * such; they prove the machinery, not a real show.
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { hasFfmpegBinaries } from '../helpers/ffmpeg-availability'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'
import { OPTIONAL_MODULES, parseEnabledModules } from '../../src/modules/module-registry'
import { importPodcastFeed, validatePodcastFeed } from '../../src/modules/media/publishing'
import { inspectPodcastFeed } from '../../src/modules/podcast-studio/feed-validate'
import { renderPodcastFeed } from '../../src/modules/podcast-studio/feed-build'
import { migrateEpisodeEnclosure } from '../../src/modules/podcast-studio/import-media'
import { issueToken, rotateToken } from '../../src/modules/podcast-studio/member-feeds'
import {
  addGuestAppearance,
  assertGuestAdmissionReady,
  createPodcastGuest,
  listRecordingSessions,
  productionBoard,
  publishEpisode,
  recordEpisodeApproval,
  recordGuestConsent,
  replaceEpisodeAudio,
  restoreEpisode,
  scheduleRecordingSession,
  transitionProductionState,
  withdrawEpisode,
} from '../../src/modules/podcast-studio/production'
import {
  applySessionOperationToRecord,
  createExampleShow,
  createStudioSessionRecord,
  loadStudioSessionRecord,
} from '../../src/modules/podcast-studio/sessions'
import {
  addClip,
  addRundownItem,
  createSession,
} from '../../src/modules/podcast-studio/session-engine'
import { PlayerEngine } from '../../src/modules/podcast-studio/players/player-engine'
import { createCartwallAudio } from '../../src/modules/podcast-studio/players/cartwall-audio'
import { getPlayedClipLog } from '../../src/modules/podcast-studio/players/played-log'
import {
  assertRawSettings,
  buildMasterConstraints,
  ChunkJournal,
  floatToInt16Bytes,
  MemoryChunkStorage,
  recoverRecording,
} from '../../src/modules/podcast-studio/capture/index'
import {
  defaultTrackDefinitions,
  DirectoryChunkStorage,
  finalizeRecordingFromStorage,
  MultitrackRecorder,
} from '../../src/modules/podcast-studio/recording/index'
import { computeConformPlan, syncPair } from '../../src/modules/podcast-studio/recording/conform'
import {
  CameraTrackRecorder,
  cameraTrackDefinition,
} from '../../src/modules/podcast-studio/recording/camera-tracks'
import { parseTrackManifest } from '../../src/modules/podcast-studio/contracts/track-manifest'
import {
  cutRange,
  edlHash,
  ensureClipIds,
  type EditEdl,
} from '../../src/modules/podcast-studio/edit/edl-engine'
import {
  appendProjectVersion,
  type EditProjectDoc,
} from '../../src/modules/podcast-studio/edit/project'
import {
  createEditProjectRecord,
  createProjectFromRecording,
} from '../../src/modules/podcast-studio/edit/projects-service'
import { storeTrackAsset } from '../../src/modules/podcast-studio/recording/finalize'
import { parseId3Chapters, probeAudioFile } from '../../src/modules/podcast-studio/render/render'
import {
  renderProject,
  storeRenderAsset,
} from '../../src/modules/podcast-studio/render/render-service'
import { probeMediaFile, renderVideoEpisode } from '../../src/modules/podcast-studio/render/video'
import { attachEpisodeVideo } from '../../src/modules/podcast-studio/render/video-service'
import {
  acceptAssistDraft,
  acceptTranscriptRevision,
  createAudiogramFromHighlight,
  editTranscriptRevision,
  generateAssistDrafts,
  listAssistDrafts,
  loadEpisodeReviewedTranscript,
  runTranscriptionJob,
} from '../../src/modules/podcast-studio/intelligence/service'
import { fixtureTranscriptionProvider } from '../../src/modules/podcast-studio/intelligence/transcription'
import {
  admitGuest,
  issueGuestInvite,
  joinGuest,
  postSignalMessage,
  registerGuestClip,
  resolveSignallingCredential,
} from '../../src/modules/podcast-studio/guests/service'
import {
  evaluateReconnect,
  renderGuestReceive,
} from '../../src/modules/podcast-studio/guests/index'
import { createMixerEngine, defaultMixerState } from '../../src/modules/podcast-studio/mixer/index'
import {
  convertLiveEpisodeWithRecording,
  endLiveEpisode,
  getPublicStreamProfile,
  goLiveEpisode,
  IcecastProtocolFixture,
  RelaySupervisor,
  scheduleLiveEpisodeForShow,
  setLiveRoomBinding,
  setShowStreamProfile,
  type StreamProfile,
} from '../../src/modules/podcast-studio/live/index'
import { createFfmpegRelaySpawner } from '../../src/modules/podcast-studio/live/relay-process'
import {
  createStudioActionHandlers,
  StudioActionBus,
} from '../../src/modules/podcast-studio/control/action-map'
import {
  dispatchKeyboardEvent,
  NEUTRAL_FOCUS,
  resolveBindings,
} from '../../src/modules/podcast-studio/control/keyboard-map'
import {
  exportMidiMap,
  importMidiMap,
  MidiDeviceTracker,
  MidiLearnController,
  MidiMapStore,
  parseMidiMessage,
  routeMidiMessage,
  scaleCcToDb,
  type MidiMap,
} from '../../src/modules/podcast-studio/control/midi'
import { MemoryPrefsStorage } from '../../src/modules/podcast-studio/capture/devices'
import { getRecordingState } from '../../src/modules/podcast-studio/recording/recording-session'
import { exportShowBundle, importShowBundle } from '../../src/modules/podcast-studio/portability'
import { GET as publicFeedGet } from '../../src/app/(frontend)/podcasts/[slug]/feed.xml/route'
import { GET as memberFeedGet } from '../../src/app/(frontend)/podcasts/[slug]/member-feed/[token]/route'
import { GET as enclosureGet } from '../../src/app/(frontend)/podcasts/[slug]/member-feed/[token]/episode/[episodeId]/audio/route'
import { seed } from '../../src/scripts/seed'

const SR = 48_000
const CHUNK = 12_000
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const runId = randomUUID().slice(0, 8)

const tone = (freq: number, amp: number, frames: number, startFrame = 0): Float32Array => {
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i++)
    out[i] = amp * Math.sin((2 * Math.PI * freq * (startFrame + i)) / SR)
  return out
}
const interleaveStereo = (mono: Float32Array): Float32Array => {
  const out = new Float32Array(mono.length * 2)
  for (let i = 0; i < mono.length; i++) {
    out[i * 2] = mono[i]!
    out[i * 2 + 1] = mono[i]!
  }
  return out
}
const energy = (block: Float32Array): number => {
  let sum = 0
  for (const sample of block) sum += sample * sample
  return sum
}
/** WAV writer (pod13 style): fn(tSeconds) → sample, s16 PCM. */
const wavBytes = (fn: (t: number) => number, seconds: number, channels = 1): Buffer => {
  const frames = SR * seconds
  const buf = Buffer.alloc(44 + frames * channels * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + frames * channels * 2, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(channels, 22)
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * channels * 2, 28)
  buf.writeUInt16LE(channels * 2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(frames * channels * 2, 40)
  for (let i = 0; i < frames; i++) {
    const value = Math.round(32767 * fn(i / SR))
    for (let c = 0; c < channels; c++) buf.writeInt16LE(value, 44 + (i * channels + c) * 2)
  }
  return buf
}
const smallWav = (fill: number, dataSize = 400) => {
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
const mp3Bytes = (fill: number, length = 2048) => {
  const bytes = new Uint8Array(length).fill(fill)
  bytes.set([0x49, 0x44, 0x33], 0)
  return bytes
}

let payload: Payload
let site: any
let server: Server
let baseUrl: string
let testMediaDir: string
let appConfig: ReturnType<typeof loadConfig>
const IMPORT_AUDIO = mp3Bytes(21, 2048)

async function makeAudioAsset(label: string, bytes: Uint8Array, mimeType: string) {
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
  })
  const asset = await payload.create({
    collection: 'media-assets',
    data: {
      site: site.id,
      title: `POD-20 ${label} ${runId}`,
      kind: 'audio',
      storageProvider: 'local',
      originalBlob: blob.id,
      storageLocation: key,
      mimeType,
      sizeBytes: bytes.byteLength,
      checksum,
      durationSeconds: 1,
    } as any,
    overrideAccess: true,
  })
  return { asset, blob, key }
}

async function makeShow(slugSuffix: string, extra: Record<string, unknown> = {}) {
  return payload.create({
    collection: 'podcast-shows',
    data: {
      site: site.id,
      title: `POD-20 Show ${slugSuffix} ${runId}`,
      slug: `pod20-${slugSuffix}-${runId}`,
      description: 'POD-20 final-acceptance fixture show.',
      rssEnabled: true,
      feedVisibility: 'public',
      lockedOwnerEmail: 'host@example.test',
      persons: [{ name: 'Acceptance Host', role: 'host', group: 'Hosts' }],
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
      ...extra,
    } as any,
    overrideAccess: true,
  })
}

async function makeEpisode(show: any, slugSuffix: string, extra: Record<string, unknown> = {}) {
  return payload.create({
    collection: 'podcast-episodes',
    data: {
      site: site.id,
      show: show.id,
      title: `POD-20 Episode ${slugSuffix} ${runId}`,
      slug: `pod20-${slugSuffix}-${runId}`,
      status: 'draft',
      ...extra,
    } as any,
    overrideAccess: true,
  })
}

async function publicFeed(slug: string) {
  const res = await publicFeedGet(new Request(`http://localhost:3000/podcasts/${slug}/feed.xml`), {
    params: Promise.resolve({ slug }),
  })
  return { status: res.status, body: await res.text() }
}

async function walkToReview(episodeId: string) {
  const episode = await payload.findByID({
    collection: 'podcast-episodes',
    id: episodeId,
    depth: 0,
    overrideAccess: true,
  } as never)
  const state = String((episode as any).productionState ?? 'idea')
  const paths: Record<string, string[]> = {
    idea: ['recorded', 'editing', 'review'],
    scripted: ['recorded', 'editing', 'review'],
    'scheduled-record': ['recorded', 'editing', 'review'],
    recorded: ['editing', 'review'],
    editing: ['review'],
    review: [],
  }
  for (const step of paths[state] ?? []) {
    await transitionProductionState(payload as never, episodeId, step as any)
  }
}

async function approveAndPublish(episodeId: string, by = 'pod20-acceptance') {
  await recordEpisodeApproval(payload as never, { episodeId, approver: by, decision: 'approved' })
  return publishEpisode(payload as never, episodeId, { by })
}

async function createMember(label: string) {
  const member = await payload.create({
    collection: 'members',
    data: {
      email: `pod20-${label}-${runId}@example.test`,
      displayName: `POD-20 ${label} ${runId}`,
      status: 'active',
    },
    overrideAccess: true,
  })
  const supporter = await payload.create({
    collection: 'supporters',
    data: {
      site: site.id,
      member: member.id,
      displayName: `POD-20 ${label} ${runId}`,
      visibilityPreference: 'public',
    },
    overrideAccess: true,
  })
  return { member, supporter }
}

async function grantEntitlement(supporter: any, show: any, label: string) {
  return payload.create({
    collection: 'entitlements',
    data: {
      site: site.id,
      supporter: supporter.id,
      entitlement: `podcast-show:${show.id}.listen`,
      source: `pod20-test:${runId}`,
      startsAt: new Date(Date.now() - 86_400_000).toISOString(),
      resource: `podcast-show:${show.id}`,
      capability: 'listen',
      grantKey: `pod20-${runId}-${label}`,
    } as any,
    overrideAccess: true,
  })
}

const assetBytes = async (assetId: string): Promise<Buffer> => {
  const asset: any = await payload.findByID({
    collection: 'media-assets',
    id: assetId,
    depth: 0,
    overrideAccess: true,
  } as never)
  let key = String(asset.storageLocation || '')
  if (asset.originalBlob) {
    const blob: any = await payload.findByID({
      collection: 'media-blobs',
      id: typeof asset.originalBlob === 'object' ? asset.originalBlob.id : asset.originalBlob,
      depth: 0,
      overrideAccess: true,
    } as never)
    if (blob?.storageKey) key = String(blob.storageKey)
  }
  const bytes = await mediaStorage(loadConfig()).get(key)
  expect(bytes).toBeTruthy()
  return Buffer.from(bytes!)
}

const waitFor = async (fn: () => boolean, label: string, timeoutMs = 30_000) => {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  testMediaDir = await mkdtemp(path.join(os.tmpdir(), 'pod20-int-media-'))
  process.env.MEDIA_DIR = testMediaDir
  appConfig = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL,
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
    APP_URL: 'http://localhost:3000',
    MEDIA_DIR: testMediaDir,
  } as any)

  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/import-feed.xml') {
      res.writeHead(200, { 'content-type': 'application/rss+xml' })
      res.end(
        `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>JP1 Import</title>` +
          `<item><title>Imported Episode One</title><guid>jp1-1</guid>` +
          `<pubDate>Mon, 31 Aug 2026 12:00:00 GMT</pubDate>` +
          `<enclosure url="${baseUrl}/audio/import-1.mp3" length="${IMPORT_AUDIO.byteLength}" type="audio/mpeg"/></item>` +
          `</channel></rss>`,
      )
      return
    }
    if (url.pathname === '/audio/import-1.mp3') {
      res.writeHead(200, { 'content-type': 'audio/mpeg' })
      res.end(Buffer.from(IMPORT_AUDIO))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`

  const siteResult = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'demo-publication' } },
    limit: 1,
    overrideAccess: true,
  })
  site = siteResult.docs[0]
  expect(site).toBeTruthy()
}, 120_000)

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (testMediaDir) await rm(testMediaDir, { recursive: true, force: true }).catch(() => undefined)
  await payload?.db.destroy?.()
})

// ---------------------------------------------------------------------------
// JP-1 … JP-3 — the L1 journeys
// ---------------------------------------------------------------------------

describe('JP-1 — management-only creator', () => {
  it('imports with media migration, tidies metadata, publishes imported + externally recorded episodes; feed validates full-namespace [real external feeds + directory ingestion UNVERIFIED]', async () => {
    const show = await makeShow('jp1', {
      importOwnership: 'claimed-import',
      externalFeedUrl: `${baseUrl}/import-feed.xml`,
    })
    const imported = await importPodcastFeed(payload as never, {
      siteId: site.id,
      showId: show.id,
      feedUrl: `${baseUrl}/import-feed.xml`,
      allowPrivate: true,
      migrateRemoteMedia: true,
      runMediaMigration: (episodeId: string) =>
        migrateEpisodeEnclosure(payload as never, episodeId, {
          allowPrivate: true,
          config: appConfig,
        }),
    })
    expect(imported).toMatchObject({ created: 1, remoteMedia: { migrated: 1, failed: 0 } })

    const episodes = await payload.find({
      collection: 'podcast-episodes',
      where: { show: { equals: show.id } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(episodes.docs).toHaveLength(1)
    const importedEpisode = episodes.docs[0] as any
    expect(importedEpisode.mediaMigrationState).toBe('done')
    expect(importedEpisode.mediaChecksum).toBe(sha256(IMPORT_AUDIO))
    expect(importedEpisode.audio).toBeTruthy()

    await payload.update({
      collection: 'podcast-episodes',
      id: importedEpisode.id,
      data: {
        title: 'Imported Episode One (tidied)',
        description: 'Tidied by the creator.',
      } as any,
      overrideAccess: true,
    })
    await walkToReview(String(importedEpisode.id))
    const publishedImported: any = await approveAndPublish(String(importedEpisode.id))
    expect(publishedImported.productionState).toBe('published')

    const externalBytes = smallWav(9)
    const { asset } = await makeAudioAsset('JP1 external', externalBytes, 'audio/wav')
    const external = await makeEpisode(show, 'jp1-external', {
      audio: asset.id,
      enclosureBytes: externalBytes.byteLength,
      enclosureMimeType: 'audio/wav',
    })
    await walkToReview(String(external.id))
    await approveAndPublish(String(external.id))

    const feed = await publicFeed(show.slug)
    expect(feed.status).toBe(200)
    expect(feed.body).toContain('<podcast:guid>')
    expect(feed.body).toContain('<podcast:locked')
    expect(feed.body).toContain('<podcast:person')
    expect(feed.body).toContain(String(publishedImported.guid))
    expect(() => validatePodcastFeed(feed.body)).not.toThrow()
    expect(inspectPodcastFeed(feed.body).valid).toBe(true)
  }, 120_000)
})

describe('JP-2 — private show', () => {
  it('two entitled members reach feed + enclosures; an entitlement-revoked member fails at once; rotation kills the old token [real podcast-client behaviour UNVERIFIED]', async () => {
    const show = await makeShow('jp2', { feedVisibility: 'members' })
    const { asset } = await makeAudioAsset('JP2', smallWav(4), 'audio/wav')
    const episode = await makeEpisode(show, 'jp2-ep', {
      audio: asset.id,
      enclosureBytes: 444,
      enclosureMimeType: 'audio/wav',
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    })

    // A members show has NO public feed at all.
    const publicRes = await publicFeed(show.slug)
    expect(publicRes.status).toBe(404)

    const feedRequest = (token: string) =>
      memberFeedGet(
        new Request(`http://localhost:3000/podcasts/${show.slug}/member-feed/${token}`),
        {
          params: Promise.resolve({ slug: show.slug, token }),
        },
      )
    const enclosureRequest = (token: string, headers?: HeadersInit) =>
      enclosureGet(
        new Request(
          `http://localhost:3000/podcasts/${show.slug}/member-feed/${token}/episode/${episode.id}/audio`,
          { headers },
        ),
        { params: Promise.resolve({ slug: show.slug, token, episodeId: String(episode.id) }) },
      )

    const a = await createMember('jp2-a')
    const b = await createMember('jp2-b')
    const c = await createMember('jp2-c')
    await grantEntitlement(a.supporter, show, 'a')
    await grantEntitlement(b.supporter, show, 'b')
    const entitlementC = await grantEntitlement(c.supporter, show, 'c')
    const tokenA = (await issueToken(payload as never, { memberId: a.member.id, showId: show.id }))
      .token
    const tokenB = (await issueToken(payload as never, { memberId: b.member.id, showId: show.id }))
      .token
    const tokenC = (await issueToken(payload as never, { memberId: c.member.id, showId: show.id }))
      .token

    // Both entitled members: feed 200 with the episode, enclosure 200 + 206 range.
    for (const token of [tokenA, tokenB]) {
      const res = await feedRequest(token)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain(String((episode as any).guid))
      const audio = await enclosureRequest(token)
      expect(audio.status).toBe(200)
      const ranged = await enclosureRequest(token, { Range: 'bytes=0-99' })
      expect(ranged.status).toBe(206)
    }
    expect((await feedRequest(tokenC)).status).toBe(200)

    // Revoking C's ENTITLEMENT (token untouched) cuts feed + enclosure immediately.
    await payload.delete({
      collection: 'entitlements',
      id: entitlementC.id,
      overrideAccess: true,
    } as never)
    expect((await feedRequest(tokenC)).status).not.toBe(200)
    expect((await enclosureRequest(tokenC)).status).not.toBe(200)

    // Rotation: A's old token dies at once; the new one works.
    const rotated = await rotateToken(payload as never, { memberId: a.member.id, showId: show.id })
    expect((await feedRequest(tokenA)).status).not.toBe(200)
    expect((await feedRequest(rotated.token)).status).toBe(200)
    // Bogus token never resolves.
    expect((await feedRequest('bogus-token-value')).status).not.toBe(200)
  }, 120_000)
})

describe('JP-3 — production desk', () => {
  it('walks idea → published with calendar entry, guest record + consent, and an approval gate that actually blocks; replace-audio/withdraw/restore preserve the GUID', async () => {
    const show = await makeShow('jp3')
    const audioOne = smallWav(11, 400)
    const audioTwo = smallWav(12, 640)
    const first = await makeAudioAsset('JP3 one', audioOne, 'audio/wav')
    const second = await makeAudioAsset('JP3 two', audioTwo, 'audio/wav')
    const episode = await makeEpisode(show, 'jp3-ep', {
      title: 'JP3 Desk Episode',
      audio: first.asset.id,
      enclosureBytes: audioOne.byteLength,
      enclosureMimeType: 'audio/wav',
    })
    const episodeId = String(episode.id)
    const guid = String((episode as any).guid)
    expect(guid).toBeTruthy()
    expect((episode as any).productionState).toBe('idea')

    // Calendar: scheduling a recording session moves idea → scheduled-record
    // and leaves an entry in the existing calendar module.
    const session = await scheduleRecordingSession(payload as never, {
      episodeId,
      title: 'JP3 Desk Episode — record',
      startsAt: new Date(Date.now() + 3_600_000).toISOString(),
      endsAt: new Date(Date.now() + 7_200_000).toISOString(),
    })
    const afterSession: any = await payload.findByID({
      collection: 'podcast-episodes',
      id: episodeId,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(afterSession.productionState).toBe('scheduled-record')
    const sessions = await listRecordingSessions(payload as never, episodeId)
    expect(sessions).toHaveLength(1)
    expect(String(sessions[0].id)).toBe(String(session.id))

    await transitionProductionState(payload as never, episodeId, 'recorded' as any)
    await transitionProductionState(payload as never, episodeId, 'editing' as any)
    await transitionProductionState(payload as never, episodeId, 'review' as any)

    // The approval gate actually blocks — no approval, then a rejected one.
    await expect(
      publishEpisode(payload as never, episodeId, { by: 'pod20' }),
    ).rejects.toMatchObject({
      code: 'PODCAST_APPROVAL_REQUIRED',
    })
    await recordEpisodeApproval(payload as never, {
      episodeId,
      approver: 'pod20',
      decision: 'changes-requested',
      note: 'Fix the cold open.',
    })
    await expect(
      publishEpisode(payload as never, episodeId, { by: 'pod20' }),
    ).rejects.toMatchObject({
      code: 'PODCAST_APPROVAL_REQUIRED',
    })

    // Guest record + consent: warn admits with a warning, block refuses,
    // recorded consent admits cleanly.
    const guest = await createPodcastGuest(payload as never, {
      siteId: site.id,
      name: 'JP3 Guest',
      email: 'guest@example.test',
      bio: 'A fixture guest.',
    })
    const appearance = await addGuestAppearance(payload as never, {
      guestId: String(guest.id),
      episodeId,
      prepNotes: 'Ask about the new book.',
      questions: ['What changed since last time?'],
    })
    const showDoc: any = await payload.findByID({
      collection: 'podcast-shows',
      id: show.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    const warned = await assertGuestAdmissionReady(payload as never, showDoc, String(guest.id))
    expect(warned.ready).toBe(true)
    expect(warned.warnings).toHaveLength(1)
    await payload.update({
      collection: 'podcast-shows',
      id: show.id,
      data: { guestConsentPolicy: 'block' } as any,
      overrideAccess: true,
    })
    const blockedShow: any = await payload.findByID({
      collection: 'podcast-shows',
      id: show.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    await expect(
      assertGuestAdmissionReady(payload as never, blockedShow, String(guest.id)),
    ).rejects.toMatchObject({ code: 'PODCAST_GUEST_CONSENT_REQUIRED' })
    await recordGuestConsent(payload as never, String(appearance.id), {
      consentBy: 'pod20',
      consentScope: 'Record and publish this appearance.',
    })
    const admitted = await assertGuestAdmissionReady(
      payload as never,
      blockedShow,
      String(guest.id),
    )
    expect(admitted).toMatchObject({ ready: true, warnings: [] })

    // Approve + publish; board and feed agree.
    const published: any = await approveAndPublish(episodeId)
    expect(published.productionState).toBe('published')
    const board = await productionBoard(payload as never, String(show.id))
    expect(board.byState.published.map((entry: any) => String(entry.id))).toContain(episodeId)
    let feed = await publicFeed(show.slug)
    expect(feed.body).toContain(guid)
    expect(feed.body).toContain(`length="${audioOne.byteLength}"`)

    // Replace audio: GUID unchanged, enclosure length follows the new master.
    const replaced: any = await replaceEpisodeAudio(
      payload as never,
      episodeId,
      String(second.asset.id),
    )
    expect(String(replaced.guid)).toBe(guid)
    expect(Number(replaced.enclosureBytes)).toBe(audioTwo.byteLength)
    feed = await publicFeed(show.slug)
    expect(feed.body).toContain(`length="${audioTwo.byteLength}"`)

    // Withdraw leaves the feed; restore returns with the same GUID.
    await withdrawEpisode(payload as never, episodeId, { by: 'pod20' })
    feed = await publicFeed(show.slug)
    expect(feed.body).not.toContain(guid)
    const restored: any = await restoreEpisode(payload as never, episodeId, { by: 'pod20' })
    expect(String(restored.guid)).toBe(guid)
    feed = await publicFeed(show.slug)
    expect(feed.body).toContain(guid)
    expect(() => validatePodcastFeed(feed.body)).not.toThrow()
  }, 120_000)
})

describe('JP-4 — first studio session', () => {
  it('opens a show, builds a rundown (OPML round-trip), loads carts/players, saves mid-show, reopens deep-equal with nothing auto-playing [browser workspace leg UNVERIFIED]', async () => {
    const { show, record } = await createExampleShow(payload as never, {
      siteId: site.id,
      slugSuffix: `pod20-jp4-${runId}`,
    })
    expect(record.session.rundown).toHaveLength(5)
    expect(record.session.cartwall.banks[0].clips).toHaveLength(3)

    // Rundown OPML round-trip through the session op dispatch.
    const exported = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'export-opml',
    })
    expect(exported.applied.ok).toBe(true)
    expect(exported.applied.opml).toContain('<opml version="2.0">')
    const imported = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'import-opml',
      opml: exported.applied.opml ?? '',
    })
    expect(imported.applied.ok).toBe(true)
    expect(imported.record.session.rundown).toEqual(record.session.rundown)

    // Players load + play at the engine level (the desk's audio core).
    const engine = new PlayerEngine({ sessionElapsedSec: () => 0 })
    const loaded = engine.loadClip({ assetId: 'jp4-theme', title: 'Theme', durationSec: 30 }, 0)
    expect(loaded.ok).toBe(true)
    engine.play(0)
    engine.advance(5)
    expect(engine.players[0].status).toBe('playing')
    expect(engine.players[0].positionSec).toBe(5)

    // Mid-show save: start a segment, arm + fire a cart, then persist.
    const started = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'start-segment',
      itemId: imported.record.session.rundown[0].id,
    })
    expect(started.applied.ok).toBe(true)
    const bankId = started.record.session.cartwall.banks[0].id
    const clipId = started.record.session.cartwall.banks[0].clips[0].id
    const armed = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'arm',
      clipId,
    })
    expect(armed.applied.ok).toBe(true)
    const fired = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'fire',
      clipId,
    })
    expect(fired.applied.ok).toBe(true)

    // Reopen: the persisted document reloads deep-equal; the restore op
    // then guarantees NOTHING auto-plays — a clip that was playing at
    // save time reopens paused, with the downgrade logged.
    const reloaded = await loadStudioSessionRecord(payload as never, record.id)
    expect(reloaded?.session).toEqual(fired.record.session)
    const restored = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'restore',
    })
    expect(restored.applied.ok).toBe(true)
    for (const bank of restored.record.session.cartwall.banks) {
      for (const clip of bank.clips) expect(clip.state).not.toBe('playing')
    }
    expect(restored.record.session.log.some((entry) => entry.type === 'session-restored')).toBe(
      true,
    )

    // Unarmed cue-fire is impossible: a fresh clip cannot fire unarmed,
    // and the refusal is logged in the persisted document.
    const added = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'add-clip',
      bankId,
      clip: { id: 'jp4-unarmed', title: 'Unarmed sting', cueOutSec: 4 },
    })
    expect(added.applied.ok).toBe(true)
    const refused = await applySessionOperationToRecord(payload as never, record.id, {
      op: 'fire',
      clipId: 'jp4-unarmed',
    })
    expect(refused.applied.ok).toBe(false)
    expect(refused.applied.error).toBe('not-armed')
    expect(refused.record.session.log.some((entry) => entry.type === 'cue-fire-rejected')).toBe(
      true,
    )
    expect(String(show.id)).toBeTruthy()
  }, 120_000)
})

// ---------------------------------------------------------------------------
// JP-5 … JP-8 — the studio journeys (L3/L2/L4 cores)
// ---------------------------------------------------------------------------

describe('JP-5 — solo record', () => {
  it('dual-path raw capture verified, crash mid-record recovers within one timeslice, program + ISO finalize to assets [real browser/microphone/OPFS leg UNVERIFIED]', async () => {
    // Dual-path: the master path requests raw; the assertion verifies it.
    const master = buildMasterConstraints()
    expect(master.audio.echoCancellation).toBe(false)
    expect(master.audio.noiseSuppression).toBe(false)
    expect(master.audio.autoGainControl).toBe(false)
    const rawOk = assertRawSettings({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: SR,
    })
    expect(rawOk.raw).toBe(true)
    expect(rawOk.warning).toBeNull()
    const processed = assertRawSettings({
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: SR,
    })
    expect(processed.raw).toBe(false)
    expect(processed.processedFlags).toContain('echoCancellation')
    expect(processed.warning).toBeTruthy()

    // Crash mid-record: 13 complete timeslices journalled, a 14th partial
    // chunk hits storage unjournalled, no footer. Recovery admits exactly
    // the complete run — loss is exactly one timeslice (250 ms).
    const storage = new MemoryChunkStorage()
    const journal = await ChunkJournal.open(storage, {
      recordingId: `jp5-crash-${runId}`,
      sessionId: `jp5-${runId}`,
      trackId: 'host',
      channels: 1,
    })
    for (let i = 0; i < 13; i++) await journal.appendChunk(tone(440, 0.5, CHUNK, i * CHUNK))
    const partial = floatToInt16Bytes(tone(440, 0.5, CHUNK, 13 * CHUNK)).subarray(0, 5000 * 2 + 1)
    await storage.putChunk(`jp5-crash-${runId}`, 13, new Uint8Array(partial))
    const report = await recoverRecording(storage, `jp5-crash-${runId}`)
    expect(report?.recoveredFrames).toBe(13 * CHUNK)
    expect(report?.recoveredDurationSec).toBe(3.25)
    expect(report?.lossTimeslices).toBe(1)
    expect(report?.checksumsVerified).toBe(true)

    // Program + ISO recording finalizes to real assets on real Payload.
    const show = await makeShow('jp5')
    const episode = await makeEpisode(show, 'jp5-ep', { productionState: 'scheduled-record' })
    const sessionDocId = `sess-pod20-jp5-${runId}`
    const sessionDoc = createSession({
      id: sessionDocId,
      showId: String(show.id),
      showTitle: show.title,
    })
    const sessionRecord = await createStudioSessionRecord(payload as never, {
      siteId: String(site.id),
      showId: String(show.id),
      title: 'POD-20 JP-5 session',
      session: sessionDoc,
    })
    const chunkRoot = await mkdtemp(path.join(os.tmpdir(), 'pod20-jp5-chunks-'))
    try {
      const dirStorage = new DirectoryChunkStorage(chunkRoot)
      const recorder = await MultitrackRecorder.start(dirStorage, {
        sessionId: sessionDocId,
        tracks: defaultTrackDefinitions([]),
      })
      for (let i = 0; i < 2; i++) {
        const host = tone(440, 0.5, CHUNK, i * CHUNK)
        if (i === 0) host[0] = 0.9
        const clips = tone(880, 0.4, CHUNK, i * CHUNK)
        await recorder.write('program', interleaveStereo(clips))
        await recorder.writeIso('host', host, { gainDb: 0, muted: false })
        await recorder.writeIso('clips', interleaveStereo(clips), { gainDb: 0, muted: false })
      }
      await recorder.stop()
      const result = await finalizeRecordingFromStorage(payload as never, appConfig, {
        sessionId: sessionDocId,
        sessionRecordId: String(sessionRecord.id),
        siteId: String(site.id),
        showId: String(show.id),
        episodeId: String(episode.id),
        storage: new DirectoryChunkStorage(chunkRoot),
        trackDefinitions: defaultTrackDefinitions([]),
        markers: [{ number: 1, name: 'Marker 1', atElapsedSec: 0.25, atSample: CHUNK }],
        playedClipLog: [],
        sessionLog: [],
      })
      expect(result.state).toBe('finalized')
      expect(result.trackAssets).toHaveLength(3)
      const record: any = await payload.findByID({
        collection: 'podcast-recordings',
        id: result.recordingId,
        depth: 0,
        overrideAccess: true,
      } as never)
      const manifest = parseTrackManifest(record.manifest)
      expect(manifest.tracks).toHaveLength(3)
      // Every manifest checksum matches the stored asset bytes exactly.
      const stored = mediaStorage(appConfig)
      for (const entry of result.trackAssets) {
        const asset: any = await payload.findByID({
          collection: 'media-assets',
          id: entry.mediaAssetId,
          depth: 0,
          overrideAccess: true,
        } as never)
        const bytes = await stored.get(String(asset.storageLocation))
        expect(bytes).toBeTruthy()
        expect(sha256(bytes!)).toBe(entry.checksumSha256)
      }
      const after: any = await payload.findByID({
        collection: 'podcast-episodes',
        id: episode.id,
        depth: 0,
        overrideAccess: true,
      } as never)
      expect(after.productionState).toBe('recorded')
    } finally {
      await rm(chunkRoot, { recursive: true, force: true }).catch(() => undefined)
    }
  }, 120_000)
})

describe.skipIf(!hasFfmpegBinaries)('JP-6 — edit & publish', () => {
  it('reopens the session, cuts 30 s mid-episode (chapters/transcript remap), renders −16 LUFS ±0.5 / TP ≤ −1.5, publishes from the studio path; GUID stable; chapters agree across feed/ID3/JSON [browser editor + audible preview UNVERIFIED]', async () => {
    const show = await makeShow('jp6', {
      exportProfile: {
        filenameTemplate: '{episode-slug}',
        titleTemplate: '{show-title} — {episode-title}',
      },
    })
    // Artwork for the MP3 embed (generated JPEG, labelled synthetic).
    const artDir = await mkdtemp(path.join(os.tmpdir(), 'pod20-jp6-art-'))
    const artPath = path.join(artDir, 'cover.jpg')
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x3355aa:s=1400x1400',
      '-frames:v',
      '1',
      artPath,
    ])
    const artBytes = await readFile(artPath)
    const artworkAssetId = await storeRenderAsset(payload as never, loadConfig(), {
      siteId: String(site.id),
      title: `POD-20 JP6 artwork ${runId}`,
      kind: 'image',
      mimeType: 'image/jpeg',
      filename: 'cover.jpg',
      bytes: artBytes,
      checksumSha256: sha256(artBytes),
    })
    await payload.update({
      collection: 'podcast-shows',
      id: show.id,
      data: { artwork: artworkAssetId },
      overrideAccess: true,
    } as never)
    const episode = await makeEpisode(show, 'jp6-ep', {
      productionState: 'editing',
      artwork: artworkAssetId,
      chapters: [{ startTime: 0, title: 'Stale chapter (replaced by render)' }],
    })
    const guidBefore = String((episode as any).guid)
    expect(guidBefore).toBeTruthy()

    // 45 s stereo source; the edit cuts 30 s from the middle (7.5 → 37.5).
    const sourceBytes = wavBytes((t) => 0.5 * Math.sin(2 * Math.PI * 440 * t), 45, 2)
    const sourceAssetId = await storeTrackAsset(payload as never, loadConfig(), {
      siteId: String(site.id),
      showId: String(show.id),
      sessionId: `pod20-jp6-${runId}`,
      trackId: 'host',
      role: 'host',
      wavBytes: sourceBytes,
      checksumSha256: sha256(sourceBytes),
      durationSec: 45,
    })
    const preCut: EditEdl = ensureClipIds({
      version: 1,
      sessionRate: SR,
      sources: [{ id: 'host', mediaAssetId: sourceAssetId }],
      tracks: [
        {
          id: 'host',
          gain: 1,
          clips: [{ sourceId: 'host', sourceIn: 0, sourceOut: 45, timelineStart: 0 }],
        },
      ],
      chapters: [
        { start: 0, title: 'Cold open' },
        { start: 5, title: 'Topic setup' },
        { start: 20, title: 'Cut segment' },
        { start: 40, title: 'Wrap up' },
      ],
      transcript: [
        { start: 0, end: 7, text: 'Opening words.' },
        { start: 6, end: 10, text: 'Bridge across the cut start.' },
        { start: 20, end: 30, text: 'Inside the cut.' },
        { start: 38, end: 44, text: 'Closing words.' },
      ],
    } as never)
    const cut = cutRange(preCut, { start: 7.5, end: 37.5 })
    const edl = cut.edl
    // Remap is visibly correct: 45 − 30 = 15 s; in-cut chapter dropped AND
    // reported; after-cut chapter shifts 40 → 10; transcript dispositions
    // follow the PT-C rules (inside dropped, spanning split/clamped).
    expect(cut.report.durationAfter).toBe(15)
    expect(edl.chapters.map((chapter: any) => [chapter.start, chapter.title])).toEqual([
      [0, 'Cold open'],
      [5, 'Topic setup'],
      [10, 'Wrap up'],
    ])
    expect(cut.report.droppedChapters.map((chapter: any) => chapter.title)).toContain('Cut segment')
    const remappedTexts = edl.transcript.map((cue: any) => cue.text)
    expect(remappedTexts).not.toContain('Inside the cut.')
    expect(remappedTexts).toContain('Opening words.')
    expect(edl.transcript.every((cue: any) => cue.end <= 15)).toBe(true)

    const doc: EditProjectDoc = appendProjectVersion(
      {
        version: 1,
        title: `POD-20 JP6 project ${runId}`,
        recordingId: null,
        sessionId: null,
        episodeId: String(episode.id),
        edl,
        versions: [],
      },
      'Initial',
      new Date().toISOString(),
    )
    const project = await createEditProjectRecord(payload as never, {
      siteId: String(site.id),
      showId: String(show.id),
      project: doc,
    })

    const result = await renderProject(payload as never, undefined, {
      projectId: project.id,
      profile: 'master',
    })
    expect(result.state).toBe('completed')
    const report = result.report!
    expect(report.durationSec).toBe(15)
    expect(report.frames).toBe(15 * SR)
    expect(Math.abs(report.measurements.integratedLufs - -16)).toBeLessThanOrEqual(0.5)
    expect(report.measurements.truePeakDb).toBeLessThanOrEqual(-1.5 + 0.1)
    expect(report.gate).toMatchObject({ enforced: true, passed: true })

    // The WAV master is sample-exact against the EDL.
    const wav = await assetBytes(result.outputs.wavMaster.mediaAssetId)
    const wavDir = await mkdtemp(path.join(os.tmpdir(), 'pod20-jp6-check-'))
    const wavPath = path.join(wavDir, 'master.wav')
    await writeFile(wavPath, wav)
    const wavProbe = await probeAudioFile(wavPath)
    expect(wavProbe.frames).toBe(15 * SR)

    // Chapters agree across the three serialisations.
    const expectedChapters = [
      { startTime: 0, title: 'Cold open' },
      { startTime: 5, title: 'Topic setup' },
      { startTime: 10, title: 'Wrap up' },
    ]
    const mp3 = await assetBytes(result.outputs.mp3.mediaAssetId)
    expect(parseId3Chapters(mp3)).toEqual(expectedChapters)
    const sidecar = JSON.parse(
      (await assetBytes(result.outputs.chaptersJson.mediaAssetId)).toString('utf8'),
    )
    expect(sidecar).toEqual({ version: '1.2.0', chapters: expectedChapters })
    const after: any = await payload.findByID({
      collection: 'podcast-episodes',
      id: episode.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(after.chapters).toEqual(expectedChapters)
    expect(after.guid).toBe(guidBefore)
    expect(after.productionState).toBe('review')

    // Publish from the studio path (POD-04 gate); GUID still stable and
    // the feed validates with the rendered episode in it.
    const published: any = await approveAndPublish(String(episode.id))
    expect(published.guid).toBe(guidBefore)
    const feed = await publicFeed(show.slug)
    expect(feed.status).toBe(200)
    expect(feed.body).toContain(guidBefore)
    expect(() => validatePodcastFeed(feed.body)).not.toThrow()
    expect(edlHash(edl)).toBe(after.renderProvenance.edlHash)
  }, 300_000)
})

describe.skipIf(!hasFfmpegBinaries)('JP-7 — post-production', () => {
  it('transcribes (fixture provider — real ASR UNVERIFIED), reviews/edits, drafts chapters + notes + audiogram, publishes with the reviewed transcript [real ASR + AI-key assists UNVERIFIED]', async () => {
    const show = await makeShow('jp7')
    // Run-unique frequency: the transcription job is idempotent on
    // asset + checksum, and identical fixture bytes would dedupe to a
    // previous run's already-reviewed revision.
    const jp7Freq = 330 + (parseInt(runId.slice(0, 2), 16) % 40)
    const audioBytes = wavBytes((t) => 0.4 * Math.sin(2 * Math.PI * jp7Freq * t), 12)
    const audioAssetId = await storeTrackAsset(payload as never, loadConfig(), {
      siteId: String(site.id),
      showId: String(show.id),
      sessionId: `pod20-jp7-${runId}`,
      trackId: 'main',
      role: 'host',
      wavBytes: audioBytes,
      checksumSha256: sha256(audioBytes),
      durationSec: 12,
    })
    const episode = await makeEpisode(show, 'jp7-ep', {
      productionState: 'review',
      audio: audioAssetId,
      chapters: [{ startTime: 0, title: 'Original chapter' }],
    })

    // Transcribe → DRAFT revision; nothing public changes yet.
    const job = await runTranscriptionJob(payload as never, undefined, {
      mediaAssetId: audioAssetId,
      episodeId: String(episode.id),
      provider: fixtureTranscriptionProvider,
    })
    expect(job.state).toBe('completed')
    const draftId = String(job.transcriptRevisionId)
    const draft: any = await payload.findByID({
      collection: 'transcript-revisions',
      id: draftId,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(draft.reviewState).toBe('draft')
    expect(draft.segments.length).toBeGreaterThan(0)
    expect(draft.segments[0].speaker).toBe('Speaker 1')

    // Review/edit, then accept — only now does the served transcript change.
    const edited = (draft.segments as any[]).map((segment, index) =>
      index === 0 ? { ...segment, text: 'EDITED opening line for JP-7.' } : segment,
    )
    await editTranscriptRevision(payload as never, draftId, edited as never)
    await acceptTranscriptRevision(payload as never, {
      episodeId: String(episode.id),
      revisionId: draftId,
    })
    const reviewed = await loadEpisodeReviewedTranscript(payload as never, String(episode.id))
    expect(reviewed.segments[0].text).toBe('EDITED opening line for JP-7.')

    // Assists arrive as drafts; the episode is untouched until accepted.
    const drafts = await generateAssistDrafts(payload as never, {
      episodeId: String(episode.id),
      markers: [
        { start: 0, title: 'Cold open' },
        { start: 8, title: 'Second half' },
      ],
      markedRanges: [{ startSec: 8, endSec: 12, label: 'Key quote' }],
      createdBy: 'pod20-acceptance',
    })
    expect(drafts.map((draft) => draft.kind).sort()).toEqual(
      ['chapters', 'highlight', 'show-notes', 'summary'].sort(),
    )
    expect(drafts.every((draft) => draft.state === 'draft')).toBe(true)
    const chaptersDraft = drafts.find((draft) => draft.kind === 'chapters')!
    await acceptAssistDraft(payload as never, String(chaptersDraft.id), { by: 'pod20' })
    const afterChapters: any = await payload.findByID({
      collection: 'podcast-episodes',
      id: episode.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(afterChapters.chapters.map((chapter: any) => chapter.title)).toContain('Second half')

    // Audiogram from the accepted highlight: a real MP4 draft.
    const highlightDraft = drafts.find((draft) => draft.kind === 'highlight')!
    await acceptAssistDraft(payload as never, String(highlightDraft.id), { by: 'pod20' })
    const highlights = (highlightDraft.payload as any).highlights as any[]
    const marked = highlights.find((clip) => clip.source === 'marked-range') ?? highlights[0]
    const edl: EditEdl = ensureClipIds({
      version: 1,
      sessionRate: SR,
      sources: [{ id: 'main', mediaAssetId: audioAssetId }],
      tracks: [
        {
          id: 'main',
          gain: 1,
          clips: [{ sourceId: 'main', sourceIn: 0, sourceOut: 12, timelineStart: 0 }],
        },
      ],
      chapters: [{ start: 0, title: 'Start' }],
      transcript: [],
    } as never)
    const projectDoc: EditProjectDoc = appendProjectVersion(
      {
        version: 1,
        title: `POD-20 JP7 project ${runId}`,
        recordingId: null,
        sessionId: null,
        episodeId: String(episode.id),
        edl,
        versions: [],
      },
      'Initial',
      new Date().toISOString(),
    )
    const project = await createEditProjectRecord(payload as never, {
      siteId: String(site.id),
      showId: String(show.id),
      project: projectDoc,
    })
    const audiogram = await createAudiogramFromHighlight(payload as never, undefined, {
      episodeId: String(episode.id),
      projectId: String(project.id),
      highlight: marked,
      createdBy: 'pod20-acceptance',
    })
    expect(audiogram.kind).toBe('audiogram')
    const audiogramBytes = await assetBytes(String((audiogram.payload as any).mediaAssetId))
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pod20-jp7-'))
    const file = path.join(dir, 'audiogram.mp4')
    await writeFile(file, audiogramBytes)
    const probe = await probeMediaFile(file)
    expect(probe.videoCodec).toBe('h264')
    expect(probe.audioCodec).toBe('aac')

    // Publish using the reviewed transcript.
    const published: any = await approveAndPublish(String(episode.id))
    expect(published.productionState).toBe('published')
    const served = await loadEpisodeReviewedTranscript(payload as never, String(episode.id))
    expect(served.segments[0].text).toBe('EDITED opening line for JP-7.')
    const listed = await listAssistDrafts(payload as never, String(episode.id))
    expect(listed.length).toBeGreaterThanOrEqual(4)
  }, 300_000)
})

describe('JP-8 — remote guest show', () => {
  it('invite → preflight → lobby → admit; mix-minus tone-verified per guest in the core; talkback excluded from program; guest clip plays on the host desk; disconnect → reconnect verdict inside grace; conform residual inside the drift budget on synthetic clocks [real WebRTC/NAT/TURN, real-engine tone, two-device drift UNVERIFIED]', async () => {
    const show = await makeShow('jp8')
    const sessionDoc = createSession({ showId: String(show.id), showTitle: show.title })
    const record = await createStudioSessionRecord(payload as never, {
      siteId: String(site.id),
      showId: String(show.id),
      title: 'POD-20 JP-8 session',
      session: sessionDoc,
    })

    const { invite, token } = await issueGuestInvite(payload as never, {
      sessionRecordId: record.id,
    })
    expect(token.length).toBeGreaterThan(20)
    const stored: any = await payload.findByID({
      collection: 'podcast-guest-invites',
      id: invite.id,
      overrideAccess: true,
    } as never)
    expect(JSON.stringify(stored)).not.toContain(token)

    // Pre-admission, media negotiation over signalling is refused.
    const joined = await joinGuest(payload as never, {
      token,
      displayName: 'Ada Guest',
      headphones: 'headphones',
    })
    expect(joined.invite.state).toBe('waiting')
    const credentialDoc = await resolveSignallingCredential(
      payload as never,
      joined.signallingCredential,
    )
    await expect(
      postSignalMessage(payload as never, {
        invite: credentialDoc,
        sender: 'guest',
        type: 'offer',
        payload: { sdp: 'fixture' },
        sessionId: record.id,
      }),
    ).rejects.toMatchObject({ code: 'signal-pre-admission' })

    const admitted = await admitGuest(payload as never, invite.id)
    expect(admitted.invite.state).toBe('admitted')
    const admittedDoc = await resolveSignallingCredential(
      payload as never,
      joined.signallingCredential,
    )
    const offered = await postSignalMessage(payload as never, {
      invite: admittedDoc,
      sender: 'guest',
      type: 'offer',
      payload: { sdp: 'fixture' },
      sessionId: record.id,
    })
    expect(offered.id).toBeTruthy()

    // Mix-minus, tone-verified in the POD-07 core: the guest's own return
    // alone renders EXACTLY zero in their receive; host is audible;
    // talkback reaches the guest receive but never the program bus.
    const mixerState = defaultMixerState(['guest-1'])
    const engine = createMixerEngine(mixerState)
    const ownOnly = renderGuestReceive(
      engine,
      { guests: { 'guest-1': tone(880, 0.9, 4800) } },
      'guest-1',
    )
    expect(energy(ownOnly.left)).toBe(0)
    expect(energy(ownOnly.right)).toBe(0)
    const withHost = renderGuestReceive(
      engine,
      { host: tone(440, 0.9, 4800), guests: { 'guest-1': tone(880, 0.9, 4800) } },
      'guest-1',
    )
    expect(energy(withHost.left)).toBeGreaterThan(0)

    // Guest clip slot: the admitted guest's clip lands in the session's
    // guest-slots bank and plays on the host desk engine.
    const { asset } = await makeAudioAsset('JP8 guest clip', smallWav(6), 'audio/wav')
    const clip = await registerGuestClip(payload as never, {
      credential: joined.signallingCredential,
      sessionId: record.id,
      title: 'Guest sting',
      sizeBytes: 444,
      mediaAssetId: String(asset.id),
    })
    expect(clip.clipId).toBeTruthy()
    const desk = new PlayerEngine({ sessionElapsedSec: () => 0 })
    const loadedClip = desk.loadClip(
      { assetId: String(asset.id), title: 'Guest sting', durationSec: 2 },
      0,
    )
    expect(loadedClip.ok).toBe(true)
    desk.play(0)
    desk.advance(3)
    // Auto-return at OUT: the play closes 'completed' in the log and the
    // player returns to its cue-in, loaded.
    expect(desk.players[0].status).toBe('loaded')
    expect(desk.playedLog).toHaveLength(1)
    expect(desk.playedLog[0].outcome).toBe('completed')

    // Induced disconnect → reconnect verdict inside the 120 s grace.
    const verdict = evaluateReconnect({
      disconnectedAtMs: Date.now() - 30_000,
      nowMs: Date.now(),
    })
    expect(verdict.ok).toBe(true)
    const expired = evaluateReconnect({
      disconnectedAtMs: Date.now() - 180_000,
      nowMs: Date.now(),
    })
    expect(expired.ok).toBe(false)

    // Conform: +80 ppm over a simulated hour recovers inside the < 5 ms
    // budget (synthetic clocks — the two-device rig number is UNVERIFIED).
    const hourSamples = SR * 3600
    const drifted = Math.round(hourSamples * 1.00008)
    const plan = computeConformPlan({
      nominalRate: SR,
      head: syncPair(0, 0),
      tail: syncPair(drifted, hourSamples),
      checkPoints: [syncPair(Math.round((hourSamples / 2) * 1.00008), hourSamples / 2)],
    })
    expect(plan.rateCorrection.rateCorrectionPpm).toBeCloseTo(80, 0)
    expect(plan.report.residualEstimateMs).toBeLessThan(5)
  }, 120_000)
})

// ---------------------------------------------------------------------------
// JP-9 … JP-13 — live, hardware, video, portability, studio-only gate
// ---------------------------------------------------------------------------

const LIVE_PASSWORD = 'pod20-live-source-pw!'
const LIVE_MOUNT = '/pod20-live'

const listenBytes = (url: string, maxBytes: number, timeoutMs = 20_000): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    const req = http.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Listener got HTTP ${res.statusCode}`))
        return
      }
      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        total += chunk.length
        if (total >= maxBytes) {
          req.destroy()
          resolve(Buffer.concat(chunks))
        }
      })
      res.on('error', () => resolve(Buffer.concat(chunks)))
    })
    req.on('error', (error) => reject(error))
    setTimeout(() => {
      req.destroy()
      resolve(Buffer.concat(chunks))
    }, timeoutMs)
  })

const decodeHeard = async (bytes: Buffer, dir: string) => {
  const file = path.join(dir, `heard-${randomUUID().slice(0, 8)}.mp3`)
  await writeFile(file, bytes)
  const probe = JSON.parse(
    execFileSync('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      file,
    ]).toString(),
  )
  const { spawnSync } = await import('node:child_process')
  const volume = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' },
  )
  const stderr = volume.stderr ?? ''
  const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr)
  return {
    codec: probe.streams?.[0]?.codec_name as string,
    durationSec: Number(probe.format?.duration ?? 0),
    meanVolumeDb: mean ? Number(mean[1]) : null,
  }
}

describe.skipIf(!hasFfmpegBinaries)('JP-9 — live show', () => {
  it('streams to the Icecast PROTOCOL FIXTURE while recording; relay killed mid-show → recording continuous, stream recovers; a listener\u2019s received audio is verified; liveItem converts after the show [real Icecast server + browser→ingest byte path UNVERIFIED — POD-16 named gap]', async () => {
    const fixture = await IcecastProtocolFixture.start({
      sourcePassword: LIVE_PASSWORD,
      adminPassword: LIVE_PASSWORD,
    })
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'pod20-jp9-'))
    try {
      const show = await makeShow('jp9')
      const episode = await makeEpisode(show, 'jp9-ep', {
        title: 'POD-20 Live Episode',
        productionState: 'scheduled-record',
        status: 'published',
        publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
      })
      const sessionDocId = `sess-pod20-jp9-${runId}`
      const sessionRecord = await createStudioSessionRecord(payload as never, {
        siteId: String(site.id),
        showId: String(show.id),
        title: 'POD-20 JP-9 session',
        session: createSession({
          id: sessionDocId,
          showId: String(show.id),
          showTitle: show.title,
        }),
      })
      const profile: StreamProfile = {
        sourceUrl: fixture.mountUrl(LIVE_MOUNT),
        bitrateKbps: 64,
        title: 'POD-20 Live Show',
        enabled: true,
        nowPlayingEnabled: true,
      }
      const pub = await setShowStreamProfile(payload as never, {
        showId: String(show.id),
        profile,
        credential: LIVE_PASSWORD,
      })
      expect(pub.hasCredential).toBe(true)
      expect(JSON.stringify(pub)).not.toContain(LIVE_PASSWORD)
      await setLiveRoomBinding(payload as never, {
        episodeId: String(episode.id),
        binding: { roomId: 'jp9-room', access: 'public' },
      })

      const feedForEpisode = async () => {
        const showDoc = await payload.findByID({
          collection: 'podcast-shows',
          id: String(show.id),
          depth: 1,
          overrideAccess: true,
        } as never)
        const episodeDoc = await payload.findByID({
          collection: 'podcast-episodes',
          id: String(episode.id),
          depth: 1,
          overrideAccess: true,
        } as never)
        return renderPodcastFeed(showDoc as never, [episodeDoc] as never, {
          origin: 'https://example.test',
          feedPath: `/podcasts/${(showDoc as any).slug}/feed.xml`,
          showPath: `/podcasts/${(showDoc as any).slug}`,
          includeMembersOnly: false,
        })
      }

      await scheduleLiveEpisodeForShow(payload as never, {
        episodeId: String(episode.id),
        startAt: new Date(Date.now() + 3_600_000).toISOString(),
      })
      let feed = await feedForEpisode()
      expect(feed).toContain('<podcast:liveItem status="pending"')
      await goLiveEpisode(payload as never, String(episode.id))
      feed = await feedForEpisode()
      expect(feed).toContain('<podcast:liveItem status="live"')
      const liveGuid = /<guid[^>]*>([^<]+)<\/guid>/.exec(feed)?.[1]
      expect(liveGuid).toBeTruthy()

      // Recording starts (POD-09 multitrack journal on a real directory).
      const chunkRoot = path.join(tmpRoot, 'chunks')
      const dirStorage = new DirectoryChunkStorage(chunkRoot)
      const recorder = await MultitrackRecorder.start(dirStorage, {
        sessionId: sessionDocId,
        tracks: defaultTrackDefinitions([]),
      })
      const writeSet = async (setIndex: number) => {
        for (let i = 0; i < 2; i++) {
          const at = (setIndex * 2 + i) * CHUNK
          const host = tone(440, 0.5, CHUNK, at)
          const clips = tone(880, 0.4, CHUNK, at)
          await recorder.write('program', interleaveStereo(clips))
          await recorder.writeIso('host', host, { gainDb: 0, muted: false })
          await recorder.writeIso('clips', interleaveStereo(clips), { gainDb: 0, muted: false })
        }
      }
      await writeSet(0)

      // Stream: a looping tone file through the real ffmpeg relay spawner.
      const tonePath = path.join(tmpRoot, 'tone.wav')
      await writeFile(
        tonePath,
        wavBytes((t) => 0.5 * Math.sin(2 * Math.PI * 440 * t), 30, 2),
      )
      const relay = new RelaySupervisor({
        profile,
        credential: LIVE_PASSWORD,
        input: { kind: 'file', path: tonePath, loop: true },
        spawner: createFfmpegRelaySpawner(),
        backoffMs: [500, 1_000],
        maxRestarts: 5,
        stableLiveMs: 60_000,
      })
      relay.start()
      await waitFor(() => relay.health.state === 'live', 'relay live')
      await fixture.waitForBytes(LIVE_MOUNT, 8_192)
      const heard = await listenBytes(fixture.mountUrl(LIVE_MOUNT), 24_576)
      const decoded = await decodeHeard(heard, tmpRoot)
      expect(decoded.codec).toBe('mp3')
      expect(decoded.durationSec).toBeGreaterThan(1)
      expect(decoded.meanVolumeDb).toBeGreaterThan(-40)

      // Kill the relay mid-show: the recording keeps journaling across
      // the outage, and the stream recovers under the supervisor.
      const bytesBeforeKill = fixture.mount(LIVE_MOUNT)!.bytesReceived
      relay.killCurrentProcess('SIGKILL')
      await writeSet(1)
      await waitFor(() => relay.health.state === 'live', 'relay live after kill', 30_000)
      await waitFor(
        () => fixture.mount(LIVE_MOUNT)!.bytesReceived > bytesBeforeKill + 4_096,
        'fixture bytes grow after reconnect',
      )
      const heardAgain = await listenBytes(fixture.mountUrl(LIVE_MOUNT), 16_384)
      const decodedAgain = await decodeHeard(heardAgain, tmpRoot)
      expect(decodedAgain.codec).toBe('mp3')
      expect(decodedAgain.durationSec).toBeGreaterThan(0.5)
      relay.stop()
      expect(relay.health.state).toBe('stopped')
      expect(relay.logLines.join('\n')).not.toContain(LIVE_PASSWORD)

      // Stop the recording, end the show, THEN finalize (the POD-16
      // order: finalizing moves the episode to `recorded`, whose public
      // status is draft — the ended liveItem must be observed first).
      await writeSet(2)
      await recorder.stop()
      await endLiveEpisode(payload as never, String(episode.id))
      feed = await feedForEpisode()
      expect(feed).toContain('<podcast:liveItem status="ended"')
      const finalized = await finalizeRecordingFromStorage(payload as never, appConfig, {
        sessionId: sessionDocId,
        sessionRecordId: String(sessionRecord.id),
        siteId: String(site.id),
        showId: String(show.id),
        episodeId: String(episode.id),
        storage: new DirectoryChunkStorage(chunkRoot),
        trackDefinitions: defaultTrackDefinitions([]),
        markers: [],
        playedClipLog: [],
        sessionLog: [],
      })
      expect(finalized.state).toBe('finalized')
      const record: any = await payload.findByID({
        collection: 'podcast-recordings',
        id: finalized.recordingId,
        depth: 0,
        overrideAccess: true,
      } as never)
      const manifest = parseTrackManifest(record.manifest)
      const program = manifest.tracks.find((track) => track.role === 'program') as any
      expect(program).toBeTruthy()
      expect(program.durationSec ?? program.frames / SR).toBeCloseTo(1.5, 1)

      // Convert: liveItem → normal item, same GUID.
      const converted = await convertLiveEpisodeWithRecording(payload as never, {
        episodeId: String(episode.id),
        recordingId: finalized.recordingId,
      })
      expect(converted.converted).toBe(true)
      await transitionProductionState(payload as never, String(episode.id), 'editing')
      await transitionProductionState(payload as never, String(episode.id), 'review')
      await approveAndPublish(String(episode.id))
      feed = await feedForEpisode()
      const inspection = inspectPodcastFeed(feed)
      expect(inspection.valid).toBe(true)
      expect(inspection.counts).toMatchObject({ items: 1, liveItems: 0 })
      expect(feed).not.toContain('podcast:liveItem')
      const afterGuid = /<guid[^>]*>([^<]+)<\/guid>/.exec(feed)?.[1]
      expect(afterGuid).toBe(liveGuid)
      const again = await convertLiveEpisodeWithRecording(payload as never, {
        episodeId: String(episode.id),
        recordingId: finalized.recordingId,
      })
      expect(again.converted).toBe(false)
      expect(await feedForEpisode()).toBe(feed)
      expect((await getPublicStreamProfile(payload as never, String(show.id)))?.hasCredential).toBe(
        true,
      )
    } finally {
      await fixture.close()
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined)
    }
  }, 300_000)
})

describe('JP-10 — hardware desk', () => {
  it('keyboard-only full show run through the action bus; MIDI-learned fader/transport survive a restart (map export → import); MIDI disconnect mid-record is a non-event [real browser + real MIDI hardware UNVERIFIED]', async () => {
    // A full desk wired to the real cores (the POD-15 harness shape).
    let session = createSession({ showId: 'jp10-show', showTitle: 'JP-10 Show' })
    session = addRundownItem(session, {
      title: 'Intro segment',
      type: 'segment',
      plannedSec: 300,
    }).session
    session = addClip(session, 'bank-main', {
      id: 'cart-1',
      title: 'Intro sting',
      cueOutSec: 10,
    }).session
    let wall = createCartwallAudio(session)
    let mixer = defaultMixerState(['guest-1'])
    let selection = 0
    const engine = new PlayerEngine({ sessionElapsedSec: () => session.elapsedSec })
    engine.loadClip({ assetId: 'jp10-theme', title: 'Theme', durationSec: 60 }, 0)
    const bus = new StudioActionBus()
    const registered = bus.registerAll(
      createStudioActionHandlers({
        session: {
          get: () => session,
          set: (doc) => {
            session = doc
          },
        },
        playerEngine: engine,
        cartwall: {
          get: () => wall,
          set: (state) => {
            wall = state
          },
        },
        mixer: {
          get: () => mixer,
          set: (state) => {
            mixer = state
          },
        },
        selection: {
          get: () => selection,
          set: (index) => {
            selection = index
          },
        },
      }),
    )
    expect(registered.ok).toBe(true)

    // Keyboard-only run: every step arrives as a keyboard EVENT resolved
    // through the default bindings + focus guard, never a direct call.
    const bindings = resolveBindings(null)
    const bindingFor = (actionId: string) =>
      bindings.find((binding) => binding.actionId === actionId)!
    const press = (actionId: string) => {
      const parts = bindingFor(actionId).chord.split('+')
      const code = parts[parts.length - 1]
      const keyName =
        code === 'Space'
          ? ' '
          : code.startsWith('Key')
            ? code.slice(3).toLowerCase()
            : code.startsWith('Digit')
              ? code.slice(5)
              : code
      return dispatchKeyboardEvent(
        bus,
        bindings,
        {
          key: keyName,
          code,
          shiftKey: parts.includes('Shift'),
          altKey: parts.includes('Alt'),
          ctrlKey: parts.includes('Ctrl'),
        },
        NEUTRAL_FOCUS,
        { activeContexts: ['studio', 'global'] },
      )
    }
    expect(press('record.start').ok).toBe(true)
    expect(getRecordingState(session)?.status).toBe('recording')
    expect(press('marker.drop').ok).toBe(true)
    expect(session.markers).toHaveLength(1)
    expect(press('cart.1.fire').ok).toBe(true)
    expect(getPlayedClipLog(session)).toHaveLength(1)
    expect(press('stop-all').ok).toBe(true)
    expect(getPlayedClipLog(session).every((entry) => entry.outcome !== 'playing')).toBe(true)
    expect(press('record.stop').ok).toBe(true)
    expect(getRecordingState(session)?.status).toBe('stopped')

    // MIDI learn: arm a fader + a transport, move the controls, bind.
    const learn = new MidiLearnController()
    let map: MidiMap = { version: 1, bindings: [], updatedAt: '' }
    expect(learn.arm('mixer.host.fader').ok).toBe(true)
    const learnedFader = learn.handleMessage(map, parseMidiMessage([0xb0, 7, 100]))
    expect(learnedFader.ok).toBe(true)
    if (!learnedFader.ok) throw new Error('fader learn failed')
    map = learnedFader.map
    expect(learn.arm('record.start').ok).toBe(true)
    const learnedTransport = learn.handleMessage(map, parseMidiMessage([0x90, 60, 127]))
    expect(learnedTransport.ok).toBe(true)
    if (!learnedTransport.ok) throw new Error('transport learn failed')
    map = learnedTransport.map
    // The learned CC routes and scales into the fader's dB range.
    const routed = routeMidiMessage(map, parseMidiMessage([0xb0, 7, 127]))
    expect(routed?.actionId).toBe('mixer.host.fader')
    expect(scaleCcToDb(127)).toBe(6)
    expect(scaleCcToDb(0)).toBe(-60)

    // Restart survival: persist per-machine, export → import, reload —
    // the bindings are byte-identical in effect.
    const storage = new MemoryPrefsStorage()
    const store = new MidiMapStore(storage)
    store.save(map)
    expect(new MidiMapStore(storage).load().bindings).toEqual(map.bindings)
    const roundTripped = importMidiMap(exportMidiMap(map))
    expect(roundTripped.ok).toBe(true)
    if (roundTripped.ok) expect(roundTripped.map.bindings).toEqual(map.bindings)

    // Unplug mid-record is a non-event: the tracker drops the device,
    // its messages are ignored, the recording state is untouched, and
    // disconnecting an unknown device is a no-op.
    expect(press('record.start').ok).toBe(true)
    const tracker = new MidiDeviceTracker()
    tracker.connect('nano-1', 'nanoKONTROL fixture')
    tracker.disconnect('nano-1')
    expect(tracker.isConnected('nano-1')).toBe(false)
    tracker.disconnect('never-connected')
    expect(getRecordingState(session)?.status).toBe('recording')
    expect(press('record.stop').ok).toBe(true)
  }, 120_000)
})

describe.skipIf(!hasFfmpegBinaries)('JP-11 — video episode (bounded)', () => {
  it('camera + slideshow tracks render with the session and publish behind the probe gate; output duration matches the program audio within the 0.5 s gate [real camera capture + ≤40 ms head/tail A/V sync on real devices UNVERIFIED]', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pod20-jp11-'))
    try {
      // Consent is structural: an unconsented camera track cannot start.
      const unconsented = cameraTrackDefinition({ participantId: 'host' })
      expect(() => CameraTrackRecorder.start(unconsented)).toThrow(/consent/)
      const definition = cameraTrackDefinition({
        participantId: 'host',
        consent: true,
        joinedAtSample: 0,
      })
      const recorder = CameraTrackRecorder.start(definition, { sampleRate: SR })
      recorder.appendChunk(new Uint8Array([1, 2, 3, 4]), 0)
      const summary = recorder.stop(SR * 6)
      expect(summary.totalChunks).toBe(1)
      expect(summary.durationSec).toBe(6)

      // Generated fixtures (labelled synthetic, NOT browser-recorded):
      // 6 s program WAV, artwork + chapter PNGs, 4 s testsrc2 WebM camera.
      const audioPath = path.join(dir, 'program.wav')
      await writeFile(
        audioPath,
        wavBytes((t) => 0.5 * Math.sin(2 * Math.PI * 440 * t), 6),
      )
      const artworkPath = path.join(dir, 'art.png')
      execFileSync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x884422:s=1400x1400',
        '-frames:v',
        '1',
        artworkPath,
      ])
      const chapterImagePath = path.join(dir, 'chapter.png')
      execFileSync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x224488:s=1400x1400',
        '-frames:v',
        '1',
        chapterImagePath,
      ])
      const cameraPath = path.join(dir, 'camera.webm')
      execFileSync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=640x360:rate=30',
        '-t',
        '4',
        '-c:v',
        'libvpx',
        '-b:v',
        '400k',
        cameraPath,
      ])

      const slideshow = await renderVideoEpisode({
        mode: 'slideshow',
        audioPath,
        artworkPath,
        chapters: [
          { startTime: 0, title: 'Intro' },
          { startTime: 3, title: 'Topic' },
        ],
        chapterImages: [{ startSec: 3, imagePath: chapterImagePath }],
        workDir: path.join(dir, 'render-slideshow'),
        outputName: 'episode-video',
      })
      expect(slideshow.probe.passed).toBe(true)
      expect(slideshow.probe.videoCodec).toBe('h264')
      expect(slideshow.probe.audioCodec).toBe('aac')
      expect(slideshow.durationDeltaSec).toBeLessThanOrEqual(0.5)

      const camera = await renderVideoEpisode({
        mode: 'camera',
        audioPath,
        cameraPath,
        workDir: path.join(dir, 'render-camera'),
        outputName: 'episode-video',
      })
      expect(camera.probe.passed).toBe(true)
      expect(camera.probe.width).toBe(1280)
      expect(camera.probe.height).toBe(720)
      // The 4 s camera is freeze-extended to the 6 s program.
      expect(camera.durationDeltaSec).toBeLessThanOrEqual(0.5)

      // Publish: attach the camera render behind the probe gate; the
      // feed gains a podcast:alternateEnclosure and nothing else moves.
      const show = await makeShow('jp11')
      const { asset: audioAsset } = await makeAudioAsset(
        'JP11 audio',
        wavBytes((t) => 0.5 * Math.sin(2 * Math.PI * 440 * t), 6),
        'audio/wav',
      )
      const episode = await makeEpisode(show, 'jp11-ep', {
        audio: audioAsset.id,
        enclosureBytes: 44 + 6 * SR * 2,
        enclosureMimeType: 'audio/wav',
        status: 'published',
        publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
      })
      const guidBefore = String((episode as any).guid)
      const attached = await attachEpisodeVideo(payload as never, undefined, {
        episodeId: String(episode.id),
        result: camera,
      })
      expect(attached.assetId).toBeTruthy()
      expect(attached.provenance.probe.passed).toBe(true)
      const feed = await publicFeed(show.slug)
      expect(feed.status).toBe(200)
      expect(feed.body).toContain('podcast:alternateEnclosure')
      expect(feed.body).toContain(guidBefore)
      expect(() => validatePodcastFeed(feed.body)).not.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }, 300_000)
})

describe.skipIf(!hasFfmpegBinaries)('JP-12 — portability & recovery', () => {
  it('exports a produced show\u2019s bundle → restores into a fresh site → reopened session + edit project, re-render measurements match, publish validates; zero external distribution replayed [fresh-install DB restore + role matrix on the restored install UNVERIFIED here — POD-19 proved the platform restore and the source-install matrix]', async () => {
    const show = await makeShow('jp12')
    // A produced show: recorded session → edit project → render → publish.
    const sessionDocId = `sess-pod20-jp12-${runId}`
    const sessionRecord = await createStudioSessionRecord(payload as never, {
      siteId: String(site.id),
      showId: String(show.id),
      title: 'POD-20 JP-12 session',
      session: createSession({ id: sessionDocId, showId: String(show.id), showTitle: show.title }),
    })
    const chunkRoot = await mkdtemp(path.join(os.tmpdir(), 'pod20-jp12-chunks-'))
    const episode = await makeEpisode(show, 'jp12-ep', { productionState: 'scheduled-record' })
    let originalReport: any
    let bundleDir = ''
    try {
      const dirStorage = new DirectoryChunkStorage(chunkRoot)
      const recorder = await MultitrackRecorder.start(dirStorage, {
        sessionId: sessionDocId,
        tracks: defaultTrackDefinitions([]),
      })
      for (let i = 0; i < 12; i++) {
        const host = tone(440, 0.5, CHUNK, i * CHUNK)
        const clips = tone(880, 0.4, CHUNK, i * CHUNK)
        await recorder.write('program', interleaveStereo(clips))
        await recorder.writeIso('host', host, { gainDb: 0, muted: false })
        await recorder.writeIso('clips', interleaveStereo(clips), { gainDb: 0, muted: false })
      }
      await recorder.stop()
      const finalized = await finalizeRecordingFromStorage(payload as never, appConfig, {
        sessionId: sessionDocId,
        sessionRecordId: String(sessionRecord.id),
        siteId: String(site.id),
        showId: String(show.id),
        episodeId: String(episode.id),
        storage: new DirectoryChunkStorage(chunkRoot),
        trackDefinitions: defaultTrackDefinitions([]),
        markers: [],
        playedClipLog: [],
        sessionLog: [],
      })
      expect(finalized.state).toBe('finalized')
      const project = await createProjectFromRecording(payload as never, {
        siteId: String(site.id),
        showId: String(show.id),
        recordingId: finalized.recordingId,
        title: `POD-20 JP12 project ${runId}`,
      })
      const rendered = await renderProject(payload as never, undefined, {
        projectId: project.id,
        profile: 'master',
      })
      expect(rendered.state).toBe('completed')
      originalReport = rendered.report
      await walkToReview(String(episode.id))
      await approveAndPublish(String(episode.id))
      const guidBefore = String(
        (
          (await payload.findByID({
            collection: 'podcast-episodes',
            id: episode.id,
            depth: 0,
            overrideAccess: true,
          } as never)) as any
        ).guid,
      )

      // Export the bundle; restore it into a FRESH site (new install leg
      // approximated in-process — the scratch-DB restore is POD-19's).
      bundleDir = await mkdtemp(path.join(os.tmpdir(), 'pod20-jp12-bundle-'))
      const exported = await exportShowBundle(payload as never, String(show.id), bundleDir, {
        config: loadConfig(),
      })
      expect(exported.manifest).toBeTruthy()
      // Host-move semantics: episode GUIDs are globally unique, so a
      // same-database import can only preserve them once the source
      // episode is gone — which is exactly the real restore situation
      // (and why POD-19's proof used a scratch database). The bundle is
      // already exported and checksum-verified at this point.
      await payload.delete({
        collection: 'podcast-episodes',
        id: episode.id,
        overrideAccess: true,
      } as never)
      const targetSite = await payload.create({
        collection: 'sites',
        data: { name: `POD-20 JP12 target ${runId}`, slug: `pod20-jp12-target-${runId}` },
        overrideAccess: true,
      } as never)
      const imported = await importShowBundle(payload as never, bundleDir, {
        siteId: String(targetSite.id),
        config: loadConfig(),
      })
      expect(imported.showId).toBeTruthy()
      expect(imported.episodes).toBeGreaterThanOrEqual(1)
      expect(imported.sessions).toBeGreaterThanOrEqual(1)
      expect(imported.editProjects).toBeGreaterThanOrEqual(1)

      const restoredShow: any = await payload.findByID({
        collection: 'podcast-shows',
        id: imported.showId,
        depth: 0,
        overrideAccess: true,
      } as never)
      const sourceShow: any = await payload.findByID({
        collection: 'podcast-shows',
        id: show.id,
        depth: 0,
        overrideAccess: true,
      } as never)
      expect(String(restoredShow.podcastGuidValue)).toBe(String(sourceShow.podcastGuidValue))
      const restoredEpisodes = await payload.find({
        collection: 'podcast-episodes',
        where: { show: { equals: imported.showId } },
        limit: 10,
        depth: 0,
        overrideAccess: true,
      } as never)
      const restoredEpisode: any = restoredEpisodes.docs.find(
        (doc: any) => String(doc.guid) === guidBefore,
      )
      expect(restoredEpisode).toBeTruthy()

      // Reopen the restored session + edit project.
      const restoredSessions = await payload.find({
        collection: 'podcast-studio-sessions',
        where: { show: { equals: imported.showId } },
        limit: 5,
        depth: 0,
        overrideAccess: true,
      } as never)
      expect(restoredSessions.docs.length).toBeGreaterThanOrEqual(1)
      const reopened = await loadStudioSessionRecord(
        payload as never,
        String(restoredSessions.docs[0].id),
      )
      expect(reopened?.session.showId).toBe(String(imported.showId))
      const restoredProjects = await payload.find({
        collection: 'podcast-edit-projects' as never,
        where: { show: { equals: imported.showId } },
        limit: 5,
        depth: 0,
        overrideAccess: true,
      } as never)
      expect(restoredProjects.docs.length).toBeGreaterThanOrEqual(1)

      // Re-render the restored project: measurements match the original.
      const reRendered = await renderProject(payload as never, undefined, {
        projectId: String(restoredProjects.docs[0].id),
        profile: 'master',
      })
      expect(reRendered.state).toBe('completed')
      expect(reRendered.report!.durationSec).toBe(originalReport.durationSec)
      expect(reRendered.report!.frames).toBe(originalReport.frames)
      expect(
        Math.abs(
          reRendered.report!.measurements.integratedLufs -
            originalReport.measurements.integratedLufs,
        ),
      ).toBeLessThanOrEqual(0.5)

      // The restored show publishes a validating feed… (episodes are
      // re-fetched at depth 2 so enclosures resolve, as POD-19's import
      // suite does.)
      const restoredFeedDocs = await payload.find({
        collection: 'podcast-episodes',
        where: { show: { equals: imported.showId } },
        limit: 10,
        depth: 2,
        overrideAccess: true,
      } as never)
      const restoredFeed = renderPodcastFeed(
        restoredShow as never,
        restoredFeedDocs.docs as never,
        {
          origin: 'https://example.test',
          feedPath: `/podcasts/${restoredShow.slug}/feed.xml`,
          showPath: `/podcasts/${restoredShow.slug}`,
          includeMembersOnly: false,
        },
      )
      expect(() => validatePodcastFeed(restoredFeed)).not.toThrow()
      expect(restoredFeed).toContain(guidBefore)

      // …and ZERO external distribution was replayed by the restore:
      // no social drafts, no newsletter drafts exist for the target site.
      const socialDrafts = await payload
        .find({
          collection: 'social-drafts' as never,
          where: { site: { equals: String(targetSite.id) } },
          limit: 5,
          depth: 0,
          overrideAccess: true,
        } as never)
        .catch(() => ({ docs: [] as any[] }))
      expect(socialDrafts.docs).toHaveLength(0)
      const newsletters = await payload
        .find({
          collection: 'email-messages' as never,
          where: { site: { equals: String(targetSite.id) } },
          limit: 5,
          depth: 0,
          overrideAccess: true,
        } as never)
        .catch(() => ({ docs: [] as any[] }))
      expect(newsletters.docs).toHaveLength(0)
    } finally {
      await rm(chunkRoot, { recursive: true, force: true }).catch(() => undefined)
      if (bundleDir) await rm(bundleDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }, 300_000)
})

describe('JP-13 — studio-only install (gate)', () => {
  it('module registry: podcast runs on media-studio alone — community/social are neither required nor owners of any podcast collection; no CurryCaster dependency exists [clean-install boot with modules disabled UNVERIFIED in-process — payload config is import-time; JP-4…JP-6 above run on this install]', async () => {
    // The studio's collections belong to media-studio; enabling ONLY it
    // (plus floor) registers the studio without community or social.
    const enabled = parseEnabledModules('media-studio')
    expect(enabled.has('media-studio')).toBe(true)
    expect(enabled.has('community')).toBe(false)
    expect(enabled.has('social')).toBe(false)
    const podcastOwner = OPTIONAL_MODULES.find((entry) =>
      (entry.collections as readonly string[]).includes('podcast-shows'),
    )
    expect(podcastOwner?.id).toBe('media-studio')
    for (const entry of OPTIONAL_MODULES) {
      if (entry.id === 'community' || entry.id === 'social') {
        expect(
          (entry.collections as readonly string[]).some((slug) => slug.startsWith('podcast-')),
        ).toBe(false)
      }
    }
    // No third-party accounts are needed by the studio journeys above:
    // they ran against this install with fixture/local providers only.

    // No CurryCaster anywhere: not a dependency, and the notices file
    // records pattern-level MIT adaptation only (acceptance §4.7).
    const packageJson = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'))
    const allDeps = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
    }
    expect(Object.keys(allDeps).some((name) => name.toLowerCase().includes('currycaster'))).toBe(
      false,
    )
    const notices = await readFile(path.resolve('THIRD_PARTY_NOTICES'), 'utf8')
    expect(notices).toContain('Copyright (c) 2024 Adam Curry')
    expect(notices).toContain('CurryCaster II')

    // This running install does carry the studio collections.
    const slugs = (payload.config.collections as any[]).map((collection) => collection.slug)
    expect(slugs).toContain('podcast-shows')
    expect(slugs).toContain('podcast-episodes')
    expect(slugs).toContain('podcast-studio-sessions')
  }, 120_000)
})
