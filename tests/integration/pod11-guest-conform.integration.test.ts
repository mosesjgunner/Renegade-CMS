/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-11 (POD-REQ-25) against real Payload + Postgres:
 *
 * - Guest chunk upload under the POD-10 signalling credential:
 *   interrupted at ~50% → resume from the server received list → no
 *   duplicates (byte-identical re-send is an idempotent ack, changed
 *   bytes are a `chunk-conflict`) → completion verified against the
 *   journal (chunk count, frames, running checksum) → conform-ready.
 * - Cross-session chunk upload refused; a not-yet-admitted guest's
 *   upload refused (`chunk-not-admitted`).
 * - Conform job (direct + via the `podcast-conform-track` queue
 *   task): conformed ISO asset registered, conform report stored on
 *   the recording record, the POD-00 manifest's guest entry updated
 *   (mediaAssetId + rateCorrectionPpm + syncEvents).
 * - Fallback ladder: local missing + live capture present → rung 2
 *   `degraded: live-capture` on the record + manifest; neither →
 *   rung 3 full-range gap + explicit manifest error. The guest is
 *   never silently lost.
 */
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { MemoryChunkStorage } from '../../src/modules/podcast-studio/capture/journal'
import {
  completeGuestChunkUpload,
  listGuestReceivedChunks,
  writeGuestChunk,
} from '../../src/modules/podcast-studio/guests/guest-chunk-upload'
import {
  GuestLocalRecorder,
  guestRecordingBinding,
} from '../../src/modules/podcast-studio/guests/guest-recording'
import {
  admitGuest,
  issueGuestInvite,
  joinGuest,
} from '../../src/modules/podcast-studio/guests/service'
import { syncPair } from '../../src/modules/podcast-studio/recording/conform'
import {
  queuePodcastConformTrackTask,
  runGuestConformJob,
} from '../../src/modules/podcast-studio/recording/conform-service'
import {
  DirectoryChunkStorage,
  MultitrackRecorder,
  finalizeAssembly,
  guestTrackDefinition,
  type TrackAssemblyInput,
} from '../../src/modules/podcast-studio/recording/index'
import { createSession } from '../../src/modules/podcast-studio/session-engine'
import {
  createStudioSessionRecord,
  loadStudioSessionRecord,
} from '../../src/modules/podcast-studio/sessions'
import { seed } from '../../src/scripts/seed'

let payload: Payload
let site: any
const runId = randomUUID().slice(0, 8)
const SR = 48_000
const CHUNK = 12_000

const tone = (freq: number, amp: number, frames: number, startFrame = 0): Float32Array => {
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i++)
    out[i] = amp * Math.sin((2 * Math.PI * freq * (startFrame + i)) / SR)
  return out
}

async function makeShow(suffix: string) {
  return payload.create({
    collection: 'podcast-shows',
    data: {
      site: site.id,
      title: `POD-11 ${suffix} ${runId}`,
      slug: `pod11-${suffix}-${runId}`,
      status: 'draft',
      guestConsentPolicy: 'warn',
    } as any,
    overrideAccess: true,
  })
}

async function makeSessionRecord(show: any) {
  const session = createSession({ showId: String(show.id), showTitle: String(show.title) })
  return createStudioSessionRecord(payload as never, {
    siteId: String(site.id),
    showId: String(show.id),
    title: String(show.title),
    session,
  })
}

async function makeAdmittedGuest(record: any, name: string) {
  const { invite, token } = await issueGuestInvite(payload as never, {
    sessionRecordId: record.id,
  })
  const joined = await joinGuest(payload as never, {
    token,
    displayName: name,
    headphones: 'headphones',
  })
  await admitGuest(payload as never, invite.id)
  return { invite, credential: joined.signallingCredential }
}

/** Creates a podcast-recordings row whose manifest carries the guest track (POD-09 finalize shape). */
async function makeRecordingRecord(
  show: any,
  record: any,
  guestTrackId: string,
  sessionFrames: number,
) {
  const guestInput: TrackAssemblyInput = {
    trackId: guestTrackId,
    role: 'guest',
    channels: 1,
    joinedAtSample: 0,
    chunks: [{ startSample: 0, pcm: tone(660, 0.5, sessionFrames) }],
    syncEvents: [
      { type: 'head', trackSamples: 0, timelineSamples: 0 },
      { type: 'tail', trackSamples: sessionFrames, timelineSamples: sessionFrames },
    ],
  }
  const assembled = finalizeAssembly({
    sessionId: record.session.id,
    sampleRate: SR,
    tracks: [
      {
        trackId: 'host',
        role: 'host',
        channels: 1,
        joinedAtSample: 0,
        chunks: [{ startSample: 0, pcm: tone(440, 0.5, sessionFrames) }],
      },
      guestInput,
    ],
  })
  return payload.create({
    collection: 'podcast-recordings',
    data: {
      site: site.id,
      show: show.id,
      session: record.id,
      state: 'finalized',
      manifest: assembled.manifest,
      markers: [],
      playedClipLog: [],
      sessionLog: [],
      trackAssets: [],
      retentionPolicy: { mode: 'until-published-plus-days', daysAfterPublish: 30 },
      retainUntil: null,
    } as any,
    overrideAccess: true,
  } as never)
}

/** Records a guest locally (journal in memory) and returns its chunk bytes + footer. */
async function recordGuestLocally(sessionDocId: string, inviteId: string, frames: number) {
  const storage = new MemoryChunkStorage()
  const binding = guestRecordingBinding({
    sessionId: sessionDocId,
    sessionRecordId: 'unused',
    inviteId,
  })
  const recorder = await GuestLocalRecorder.start(storage, binding, syncPair(0, 0))
  const pcm = tone(660, 0.5, frames)
  pcm[0] = 0.9
  await recorder.ingest(pcm)
  await recorder.stop(syncPair(frames, frames))
  const journal = recorder.journalRef!
  const chunks: Uint8Array[] = []
  for (const record of journal.chunkRecords) {
    chunks.push((await storage.getChunk(journal.meta.recordingId, record.index))!)
  }
  return { chunks, footer: recorder.journalFooter! }
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
}, 120_000)

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('POD-11 guest chunk upload + conform (rung 1)', () => {
  it('kill at ~50% → resume → no duplicates → verified completion → conform job updates the manifest', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pod11-chunks-'))
    try {
      const storage = new DirectoryChunkStorage(root)
      const show = await makeShow('rung1')
      const record = await makeSessionRecord(show)
      const { invite, credential } = await makeAdmittedGuest(record, 'Ada Local')
      const trackId = `guest-${invite.id}`
      const sessionFrames = 4 * CHUNK
      const { chunks, footer } = await recordGuestLocally(
        record.session.id,
        invite.id,
        sessionFrames,
      )

      // Upload chunks 0–1, then the "network dies".
      for (const index of [0, 1]) {
        await writeGuestChunk(payload as never, storage, {
          credential,
          sessionId: record.id,
          index,
          bytes: chunks[index]!,
        })
      }
      const received = await listGuestReceivedChunks(payload as never, storage, {
        credential,
        sessionId: record.id,
      })
      expect(received).toEqual({ trackId, receivedChunks: [0, 1] })

      // Resume: only the missing chunks are sent.
      for (const index of [2, 3]) {
        const result = await writeGuestChunk(payload as never, storage, {
          credential,
          sessionId: record.id,
          index,
          bytes: chunks[index]!,
        })
        expect(result.duplicate).toBe(false)
      }
      // Byte-identical re-send: idempotent ack, still 4 chunks.
      const dup = await writeGuestChunk(payload as never, storage, {
        credential,
        sessionId: record.id,
        index: 2,
        bytes: chunks[2]!,
      })
      expect(dup.duplicate).toBe(true)
      expect(dup.receivedChunks).toEqual([0, 1, 2, 3])
      // Changed bytes for a received chunk: refused.
      const tampered = new Uint8Array(chunks[2]!)
      tampered[5] = tampered[5]! ^ 0xff
      await expect(
        writeGuestChunk(payload as never, storage, {
          credential,
          sessionId: record.id,
          index: 2,
          bytes: tampered,
        }),
      ).rejects.toMatchObject({ code: 'chunk-conflict' })

      const completed = await completeGuestChunkUpload(payload as never, storage, {
        credential,
        sessionId: record.id,
        totalChunks: footer.totalChunks,
        totalFrames: footer.totalFrames,
        checksum: footer.checksum,
        headSync: syncPair(0, 0),
        tailSync: syncPair(sessionFrames, sessionFrames),
        gaps: [],
      })
      expect(completed.recoveredFrames).toBe(sessionFrames)
      const sessionDoc = await loadStudioSessionRecord(payload as never, record.id)
      expect((sessionDoc!.session as any).guestRecordings).toHaveLength(1)

      await makeRecordingRecord(show, record, trackId, sessionFrames)
      const result = await runGuestConformJob(payload as never, undefined, {
        sessionRecordId: record.id,
        inviteId: invite.id,
        storage,
        sessionFrames,
      })
      expect(result.decision).toMatchObject({ rung: 1, state: 'conformed', degraded: false })
      expect(result.mediaAssetId).toBeTruthy()
      expect(result.manifestUpdated).toBe(true)
      expect(result.report.rateCorrection?.rateCorrectionPpm).toBeCloseTo(0, 0)

      const recording = await payload.findByID({
        collection: 'podcast-recordings',
        id: result.recordingId!,
        overrideAccess: true,
      } as never)
      const reports = (recording as any).conformReports as any[]
      expect(reports).toHaveLength(1)
      expect(reports[0]).toMatchObject({ trackId, state: 'conformed' })
      expect(reports[0].conformedChecksumSha256).toHaveLength(64)
      const manifestTrack = (recording as any).manifest.tracks.find(
        (t: any) => t.trackId === trackId,
      )
      expect(manifestTrack.mediaAssetId).toBe(result.mediaAssetId)
      const asset = await payload.findByID({
        collection: 'media-assets',
        id: result.mediaAssetId!,
        overrideAccess: true,
      } as never)
      expect((asset as any).checksum).toBe(`sha256:${reports[0].conformedChecksumSha256}`)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('the podcast-conform-track queue task conforms a second guest end-to-end', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pod11-task-'))
    try {
      const storage = new DirectoryChunkStorage(root)
      const show = await makeShow('task')
      const record = await makeSessionRecord(show)
      const { invite, credential } = await makeAdmittedGuest(record, 'Task Guest')
      const trackId = `guest-${invite.id}`
      const sessionFrames = 2 * CHUNK
      const { chunks, footer } = await recordGuestLocally(
        record.session.id,
        invite.id,
        sessionFrames,
      )
      for (let index = 0; index < chunks.length; index++) {
        await writeGuestChunk(payload as never, storage, {
          credential,
          sessionId: record.id,
          index,
          bytes: chunks[index]!,
        })
      }
      await completeGuestChunkUpload(payload as never, storage, {
        credential,
        sessionId: record.id,
        totalChunks: footer.totalChunks,
        totalFrames: footer.totalFrames,
        checksum: footer.checksum,
        headSync: syncPair(0, 0),
        tailSync: syncPair(sessionFrames, sessionFrames),
        gaps: [],
      })
      await makeRecordingRecord(show, record, trackId, sessionFrames)
      const queued = await queuePodcastConformTrackTask(payload as never, {
        sessionRecordId: record.id,
        inviteId: invite.id,
        storageRoot: root,
        sessionFrames,
      })
      expect(queued.queued).toBe(true)
      const ran = await (payload as any).jobs.runByID({ id: queued.id })
      expect(ran.job?.hasError ?? false).toBe(false)
      const recordings = await payload.find({
        collection: 'podcast-recordings',
        where: { session: { equals: record.id } },
        limit: 1,
        overrideAccess: true,
      } as never)
      expect(((recordings.docs[0] as any).conformReports as any[])?.[0]).toMatchObject({
        trackId,
        state: 'conformed',
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('POD-11 chunk upload authorization', () => {
  it('cross-session upload refused; not-admitted upload refused', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pod11-auth-'))
    try {
      const storage = new DirectoryChunkStorage(root)
      const show = await makeShow('auth')
      const recordA = await makeSessionRecord(show)
      const recordB = await makeSessionRecord(show)
      const { credential } = await makeAdmittedGuest(recordA, 'Scoped Guest')
      const bytes = new Uint8Array(CHUNK * 2)

      // The credential aimed at session B: refused before any byte lands.
      await expect(
        writeGuestChunk(payload as never, storage, {
          credential,
          sessionId: recordB.id,
          index: 0,
          bytes,
        }),
      ).rejects.toMatchObject({ code: 'invite-wrong-session' })
      expect(await storage.listRecordings()).toEqual([])

      // A guest who joined but was never admitted has no track to upload.
      const pending = await issueGuestInvite(payload as never, { sessionRecordId: recordA.id })
      const joined = await joinGuest(payload as never, {
        token: pending.token,
        displayName: 'Waiting Guest',
        headphones: 'headphones',
      })
      await expect(
        writeGuestChunk(payload as never, storage, {
          credential: joined.signallingCredential,
          sessionId: recordA.id,
          index: 0,
          bytes,
        }),
      ).rejects.toMatchObject({ code: 'chunk-not-admitted' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('POD-11 fallback ladder against real records', () => {
  it('rung 2: no local upload, live capture present → degraded: live-capture on manifest + record', async () => {
    const guestRoot = await mkdtemp(path.join(os.tmpdir(), 'pod11-rung2-guest-'))
    const liveRoot = await mkdtemp(path.join(os.tmpdir(), 'pod11-rung2-live-'))
    try {
      const show = await makeShow('rung2')
      const record = await makeSessionRecord(show)
      const { invite } = await makeAdmittedGuest(record, 'Live Only')
      const trackId = `guest-${invite.id}`
      const sessionFrames = 2 * CHUNK

      // Host-side live capture of the guest's received stream (POD-09 slot).
      const liveStorage = new DirectoryChunkStorage(liveRoot)
      const definition = guestTrackDefinition(invite.id, 0)
      expect(definition.trackId).toBe(trackId)
      const recorder = await MultitrackRecorder.start(liveStorage, {
        sessionId: record.session.id,
        tracks: [definition],
      })
      await recorder.writeIso(trackId, tone(660, 0.5, sessionFrames), {
        gainDb: 0,
        muted: false,
      })
      await recorder.stop()

      await makeRecordingRecord(show, record, trackId, sessionFrames)
      const result = await runGuestConformJob(payload as never, undefined, {
        sessionRecordId: record.id,
        inviteId: invite.id,
        storage: new DirectoryChunkStorage(guestRoot),
        liveCapture: { definition, storage: liveStorage },
        sessionFrames,
      })
      expect(result.decision).toMatchObject({ rung: 2, state: 'degraded-live-capture' })
      expect(result.mediaAssetId).toBeTruthy()
      const recording = await payload.findByID({
        collection: 'podcast-recordings',
        id: result.recordingId!,
        overrideAccess: true,
      } as never)
      expect((recording as any).state).toBe('degraded')
      const manifestTrack = (recording as any).manifest.tracks.find(
        (t: any) => t.trackId === trackId,
      )
      expect(manifestTrack.errors.join(' ')).toContain('degraded: live-capture')
      expect(manifestTrack.mediaAssetId).toBe(result.mediaAssetId)
    } finally {
      await rm(guestRoot, { recursive: true, force: true })
      await rm(liveRoot, { recursive: true, force: true })
    }
  })

  it('rung 3: neither local nor live → full-range gap + explicit manifest error, never silent', async () => {
    const guestRoot = await mkdtemp(path.join(os.tmpdir(), 'pod11-rung3-'))
    try {
      const show = await makeShow('rung3')
      const record = await makeSessionRecord(show)
      const { invite } = await makeAdmittedGuest(record, 'Ghost Guest')
      const trackId = `guest-${invite.id}`
      const sessionFrames = 2 * CHUNK
      await makeRecordingRecord(show, record, trackId, sessionFrames)
      const result = await runGuestConformJob(payload as never, undefined, {
        sessionRecordId: record.id,
        inviteId: invite.id,
        storage: new DirectoryChunkStorage(guestRoot),
        sessionFrames,
      })
      expect(result.decision).toMatchObject({ rung: 3, state: 'missing-gap' })
      expect(result.mediaAssetId).toBeNull()
      const recording = await payload.findByID({
        collection: 'podcast-recordings',
        id: result.recordingId!,
        overrideAccess: true,
      } as never)
      expect((recording as any).state).toBe('degraded')
      const manifestTrack = (recording as any).manifest.tracks.find(
        (t: any) => t.trackId === trackId,
      )
      expect(manifestTrack.errors.join(' ')).toContain('guest track missing')
      expect(manifestTrack.gaps).toContainEqual({
        fromSample: 0,
        toSample: sessionFrames,
        frames: sessionFrames,
        reason: 'missing-chunk',
      })
      expect(((recording as any).conformReports as any[])[0]).toMatchObject({
        trackId,
        state: 'missing-gap',
      })
    } finally {
      await rm(guestRoot, { recursive: true, force: true })
    }
  })
})
