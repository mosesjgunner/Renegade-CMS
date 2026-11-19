/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-09 (POD-REQ-19, POD-REQ-20) against real Payload + Postgres:
 *
 * - A multitrack session journalled into a local chunk directory
 *   (DirectoryChunkStorage, the POD-06 journal on a real filesystem)
 *   finalizes through finalizeRecordingFromStorage: track WAVs land as
 *   media assets, a podcast-recordings record carries the POD-00
 *   manifest (parse-validated, per-track checksums matching the stored
 *   asset bytes), markers + played-clip log ride along, and the bound
 *   episode's production state moves to `recorded` through the POD-04
 *   machine.
 * - Interrupted-finalize resume: a second finalize run over the same
 *   session completes in place — same recording record, same asset
 *   ids, no duplicates.
 * - The finalize QUEUE TASK executes end-to-end (queue → runByID) for
 *   a second session.
 * - Retention cleanup: dry-run (the default) counts an expired
 *   recording and deletes NOTHING; an explicit dryRun:false run
 *   removes its track assets and marks the record expired.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'
import { parseTrackManifest } from '../../src/modules/podcast-studio/contracts/track-manifest'
import {
  cleanupExpiredRecordings,
  defaultTrackDefinitions,
  DirectoryChunkStorage,
  finalizeRecordingFromStorage,
  MultitrackRecorder,
  queuePodcastRecordingFinalizeTask,
} from '../../src/modules/podcast-studio/recording/index'
import { createSession } from '../../src/modules/podcast-studio/session-engine'
import { createStudioSessionRecord } from '../../src/modules/podcast-studio/sessions'
import { seed } from '../../src/scripts/seed'

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const SR = 48_000
const CHUNK = 12_000

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

let payload: Payload
let site: any
let show: any
let episode: any
let sessionRecord: any
let chunkRoot: string
const runId = randomUUID().slice(0, 8)
const sessionDocId = `sess-pod09-int-${runId}`
const appConfig = loadConfig()

/** Journals a 2-chunk, 3-track session into a chunk directory. */
async function journalSession(storageRoot: string, docId: string, freqScale = 1) {
  const storage = new DirectoryChunkStorage(storageRoot)
  const recorder = await MultitrackRecorder.start(storage, {
    sessionId: docId,
    tracks: defaultTrackDefinitions([]),
  })
  for (let i = 0; i < 2; i++) {
    const host = tone(440 * freqScale, 0.5, CHUNK, i * CHUNK)
    if (i === 0) host[0] = 0.9
    const clips = tone(880 * freqScale, 0.4, CHUNK, i * CHUNK)
    await recorder.write('program', interleaveStereo(clips))
    await recorder.writeIso('host', host, { gainDb: 0, muted: false })
    await recorder.writeIso('clips', interleaveStereo(clips), { gainDb: 0, muted: false })
  }
  await recorder.stop()
  return defaultTrackDefinitions([])
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  const siteResult = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'demo-publication' } },
    limit: 1,
    overrideAccess: true,
  })
  site = siteResult.docs[0]
  expect(site).toBeTruthy()

  show = await payload.create({
    collection: 'podcast-shows',
    data: {
      site: site.id,
      title: `POD-09 Show ${runId}`,
      slug: `pod09-show-${runId}`,
      description: 'POD-09 integration fixture show.',
      rssEnabled: true,
      feedVisibility: 'public',
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    } as any,
    overrideAccess: true,
  })
  episode = await payload.create({
    collection: 'podcast-episodes',
    data: {
      site: site.id,
      show: show.id,
      title: 'POD-09 Recorded Episode',
      slug: `pod09-episode-${runId}`,
      productionState: 'scheduled-record',
      status: 'draft',
    } as any,
    overrideAccess: true,
  })
  const sessionDoc = createSession({
    id: sessionDocId,
    showId: String(show.id),
    showTitle: show.title,
  })
  sessionRecord = await createStudioSessionRecord(payload as never, {
    siteId: String(site.id),
    showId: String(show.id),
    title: 'POD-09 session',
    session: sessionDoc,
  })
  chunkRoot = await mkdtemp(path.join(os.tmpdir(), 'pod09-int-chunks-'))
})

afterAll(async () => {
  if (chunkRoot) await rm(chunkRoot, { recursive: true, force: true })
})

describe('POD-09 finalize against real Payload', () => {
  it('finalizes a chunk directory into assets + recording record + episode recorded', async () => {
    const trackDefinitions = await journalSession(chunkRoot, sessionDocId)
    const markers = [{ number: 1, name: 'Marker 1', atElapsedSec: 0.25, atSample: CHUNK }]
    const playedClipLog = [
      {
        id: 'cart:sting:0',
        source: 'cart',
        clipId: 'sting',
        title: 'Sting',
        startedAtSessionSec: 0,
        endedAtSessionSec: 0.25,
        outcome: 'completed',
      },
    ]
    const result = await finalizeRecordingFromStorage(payload as never, appConfig, {
      sessionId: sessionDocId,
      sessionRecordId: String(sessionRecord.id),
      siteId: String(site.id),
      showId: String(show.id),
      episodeId: String(episode.id),
      storage: new DirectoryChunkStorage(chunkRoot),
      trackDefinitions,
      markers,
      playedClipLog,
      sessionLog: [],
    })
    expect(result.state).toBe('finalized')
    expect(result.resumed).toBe(false)
    expect(result.episodeTransition).toBe('moved-to-recorded')
    expect(result.trackAssets).toHaveLength(3)

    const record = await payload.findByID({
      collection: 'podcast-recordings',
      id: result.recordingId,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect((record as any).state).toBe('finalized')
    expect((record as any).markers).toEqual(markers)
    expect((record as any).playedClipLog).toEqual(playedClipLog)
    expect((record as any).retentionPolicy).toMatchObject({ daysAfterPublish: 30 })
    expect((record as any).retainUntil).toBeNull() // episode unpublished → retained

    const manifest = parseTrackManifest((record as any).manifest)
    expect(manifest.sessionId).toBe(sessionDocId)
    expect(manifest.tracks).toHaveLength(3)

    // Every manifest checksum matches the stored asset bytes exactly.
    const storage = mediaStorage(appConfig)
    for (const entry of result.trackAssets) {
      const asset = await payload.findByID({
        collection: 'media-assets',
        id: entry.mediaAssetId,
        depth: 0,
        overrideAccess: true,
      } as never)
      expect((asset as any).kind).toBe('audio')
      expect((asset as any).mimeType).toBe('audio/wav')
      expect((asset as any).checksum).toBe(`sha256:${entry.checksumSha256}`)
      const bytes = await storage.get(String((asset as any).storageLocation))
      expect(bytes).toBeTruthy()
      expect(sha256(bytes!)).toBe(entry.checksumSha256)
      const manifestTrack = manifest.tracks.find((track) => track.trackId === entry.trackId)!
      expect(manifestTrack.checksumSha256).toBe(entry.checksumSha256)
      expect(manifestTrack.mediaAssetId).toBe(entry.mediaAssetId)
      expect(manifestTrack.durationSec).toBe(0.5)
    }

    const updatedEpisode = await payload.findByID({
      collection: 'podcast-episodes',
      id: episode.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect((updatedEpisode as any).productionState).toBe('recorded')
  })

  it('interrupted finalize resumes in place: same record, same assets, no duplicates', async () => {
    const assetsBefore = await payload.find({
      collection: 'media-assets',
      where: { site: { equals: site.id } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    } as never)
    const result = await finalizeRecordingFromStorage(payload as never, appConfig, {
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
    expect(result.resumed).toBe(true)
    expect(result.episodeTransition).toBe('already-recorded')
    const records = await payload.find({
      collection: 'podcast-recordings',
      where: { session: { equals: String(sessionRecord.id) } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(records.docs).toHaveLength(1)
    expect(String((records.docs[0] as any).id)).toBe(result.recordingId)
    const assetsAfter = await payload.find({
      collection: 'media-assets',
      where: { site: { equals: site.id } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(assetsAfter.docs.length).toBe(assetsBefore.docs.length)
  })

  it('the podcast-recording-finalize queue task executes end-to-end for a second session', async () => {
    const secondDocId = `sess-pod09-int2-${runId}`
    const secondRoot = await mkdtemp(path.join(os.tmpdir(), 'pod09-int-chunks2-'))
    try {
      const trackDefinitions = await journalSession(secondRoot, secondDocId)
      const secondSessionDoc = createSession({
        id: secondDocId,
        showId: String(show.id),
        showTitle: show.title,
      })
      const secondRecord = await createStudioSessionRecord(payload as never, {
        siteId: String(site.id),
        showId: String(show.id),
        title: 'POD-09 session 2',
        session: secondSessionDoc,
      })
      const queued = await queuePodcastRecordingFinalizeTask(payload as never, {
        sessionId: secondDocId,
        sessionRecordId: String(secondRecord.id),
        siteId: String(site.id),
        showId: String(show.id),
        storageRoot: secondRoot,
        trackDefinitions,
      })
      expect(queued.queued).toBe(true)
      const ran = await (payload as any).jobs.runByID({ id: queued.id })
      expect(ran).toBeTruthy()
      const job = await payload.findByID({
        collection: 'payload-jobs',
        id: queued.id,
        depth: 0,
        overrideAccess: true,
      } as never)
      expect((job as any).hasError).toBeFalsy()
      expect((job as any).completedAt).toBeTruthy()
      const recordings = await payload.find({
        collection: 'podcast-recordings',
        where: { session: { equals: String(secondRecord.id) } },
        limit: 5,
        depth: 0,
        overrideAccess: true,
      } as never)
      expect(recordings.docs).toHaveLength(1)
      expect((recordings.docs[0] as any).state).toBe('finalized')
    } finally {
      await rm(secondRoot, { recursive: true, force: true })
    }
  })

  it('retention cleanup: dry-run (default) deletes nothing; explicit real run expires', async () => {
    // A REAL finalized recording (with real track assets) whose
    // retainUntil is then moved into the past.
    const thirdDocId = `sess-pod09-int3-${runId}`
    const thirdRoot = await mkdtemp(path.join(os.tmpdir(), 'pod09-int-chunks3-'))
    let thirdAssetIds: string[] = []
    try {
      // Distinct tones → distinct WAV bytes → assets unique to this
      // recording (not checksum-shared with the earlier sessions).
      const thirdDefs = await journalSession(thirdRoot, thirdDocId, 1.25)
      const thirdSessionDoc = createSession({
        id: thirdDocId,
        showId: String(show.id),
        showTitle: show.title,
      })
      const thirdRecord = await createStudioSessionRecord(payload as never, {
        siteId: String(site.id),
        showId: String(show.id),
        title: 'POD-09 session 3',
        session: thirdSessionDoc,
      })
      const third = await finalizeRecordingFromStorage(payload as never, appConfig, {
        sessionId: thirdDocId,
        sessionRecordId: String(thirdRecord.id),
        siteId: String(site.id),
        showId: String(show.id),
        storage: new DirectoryChunkStorage(thirdRoot),
        trackDefinitions: thirdDefs,
        markers: [],
        playedClipLog: [],
        sessionLog: [],
      })
      thirdAssetIds = third.trackAssets.map((entry) => entry.mediaAssetId)
      expect(thirdAssetIds).toHaveLength(3)
      await payload.update({
        collection: 'podcast-recordings',
        id: third.recordingId,
        data: { retainUntil: new Date(Date.now() - 24 * 3600_000).toISOString() } as any,
        overrideAccess: true,
      } as never)

      const dryFirst = await cleanupExpiredRecordings(payload as never, appConfig, {})
      expect(dryFirst.expired).toBeGreaterThanOrEqual(1)
      for (const assetId of thirdAssetIds) {
        const asset = await payload.findByID({
          collection: 'media-assets',
          id: assetId,
          depth: 0,
          overrideAccess: true,
        } as never)
        expect(asset).toBeTruthy() // dry run deleted nothing
      }

      const realFirst = await cleanupExpiredRecordings(payload as never, appConfig, {
        dryRun: false,
      })
      // Program and clips WAVs are byte-identical in this fixture
      // (dual-mono of one tone), so 3 tracks hold 2 unique assets.
      const uniqueAssetIds = [...new Set(thirdAssetIds)]
      expect(realFirst.deleted).toBe(uniqueAssetIds.length)
      const thirdAfter = await payload.findByID({
        collection: 'podcast-recordings',
        id: third.recordingId,
        depth: 0,
        overrideAccess: true,
      } as never)
      expect((thirdAfter as any).state).toBe('expired')
      for (const assetId of uniqueAssetIds) {
        const asset = await payload
          .findByID({
            collection: 'media-assets',
            id: assetId,
            depth: 0,
            overrideAccess: true,
          } as never)
          .catch(() => null)
        expect(asset).toBeNull() // the raw track assets are gone
      }
    } finally {
      await rm(thirdRoot, { recursive: true, force: true })
    }

    // A bare recording record whose retainUntil is already past.
    const expired = await payload.create({
      collection: 'podcast-recordings',
      data: {
        site: site.id,
        show: show.id,
        state: 'finalized',
        manifest: {
          version: 1,
          sessionId: 'sess-expired',
          createdAt: new Date().toISOString(),
          sampleRate: SR,
          tracks: [],
        },
        trackAssets: [],
        retentionPolicy: { mode: 'until-published-plus-days', daysAfterPublish: 30 },
        retainUntil: new Date(Date.now() - 24 * 3600_000).toISOString(),
        finalizedAt: new Date(Date.now() - 40 * 24 * 3600_000).toISOString(),
      } as any,
      overrideAccess: true,
    } as never)

    const dry = await cleanupExpiredRecordings(payload as never, appConfig, {})
    expect(dry.dryRun).toBe(true)
    expect(dry.expired).toBeGreaterThanOrEqual(1)
    expect(dry.deleted).toBe(0)
    const afterDry = await payload.findByID({
      collection: 'podcast-recordings',
      id: expired.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect((afterDry as any).state).toBe('finalized') // untouched by the dry run

    const real = await cleanupExpiredRecordings(payload as never, appConfig, { dryRun: false })
    expect(real.dryRun).toBe(false)
    expect(real.expired).toBeGreaterThanOrEqual(1)
    const afterReal = await payload.findByID({
      collection: 'podcast-recordings',
      id: expired.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect((afterReal as any).state).toBe('expired')
  })
})
