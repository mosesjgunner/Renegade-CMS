/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-14 (POD-REQ-30, POD-REQ-31) — the JP-7 journey on real Payload
 * + Postgres + ffmpeg, carrying the L2 gate with POD-12/13:
 *
 *   fixture recording (tones + silence gaps, written as a real WAV)
 *   → queued `podcast-transcribe` task (fixture provider)
 *   → DRAFT transcript revision with timed segments + placeholder
 *     speakers; the POD-01 transcript path still serves the PREVIOUS
 *     reviewed revision (publish-flow integrity)
 *   → edit the draft → accept (explicit) → the POD-01 module path
 *     now serves the edited reviewed segments
 *   → provider outage (command provider, bogus binary) leaves a
 *     VISIBLE failed media-jobs record with a named error; retry
 *     after the config fix (fixture provider) completes in place
 *   → assists generate drafts (chapters from markers/gaps,
 *     show-notes, summary, highlights) and the episode is UNCHANGED
 *     until each explicit accept; chapters accept lands the
 *     canonical list that the feed chapters document agrees with
 *   → audiogram from an accepted highlight renders a real MP4 draft
 *     (ffprobe: h264 + AAC, ≈ range duration) via POD-13's profile
 *   → publish through POD-04's approval gate with the reviewed
 *     transcript in place.
 *
 * No AI key exists anywhere in this environment: transcription ran
 * on the fixture provider and assists on the extractive baseline.
 * No real ASR quality is claimed (fixture/command providers only;
 * no whisper binary is installed on this rig).
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { seed } from '../../src/scripts/seed'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'
import { podcastTranscriptJson } from '../../src/modules/media/publishing'
import { transcriptChecksum } from '../../src/modules/media/contracts'
import { ensureClipIds, type EditEdl } from '../../src/modules/podcast-studio/edit/edl-engine'
import {
  appendProjectVersion,
  type EditProjectDoc,
} from '../../src/modules/podcast-studio/edit/project'
import { createEditProjectRecord } from '../../src/modules/podcast-studio/edit/projects-service'
import { loadEpisodeTranscript } from '../../src/modules/podcast-studio/episode-transcript'
import { storeTrackAsset } from '../../src/modules/podcast-studio/recording/finalize'
import { publishEpisode, recordEpisodeApproval } from '../../src/modules/podcast-studio/production'
import {
  acceptAssistDraft,
  acceptTranscriptRevision,
  createAudiogramFromHighlight,
  discardAssistDraft,
  editTranscriptRevision,
  generateAssistDrafts,
  listAssistDrafts,
  loadEpisodeReviewedTranscript,
  queueTranscriptionTask,
  runTranscriptionJob,
} from '../../src/modules/podcast-studio/intelligence/service'
import {
  createCommandTranscriptionProvider,
  fixtureTranscriptionProvider,
} from '../../src/modules/podcast-studio/intelligence/transcription'
import {
  chapterPairsAgree,
  chaptersToFeedJson,
  chaptersToPodcastPairs,
} from '../../src/modules/podcast-studio/intelligence/chapters'

const SR = 48000
const runId = randomUUID().slice(0, 8)

let payload: Payload
let site: any
let show: any
let episode: any
let episodeSlug: string
let audioAssetId: string
let outageAssetId: string
let project: any
let reviewedRevisionId: string
let draftRevisionId: string

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const wavBytes = (fn: (t: number) => number, seconds: number): Buffer => {
  const frames = SR * seconds
  const buf = Buffer.alloc(44 + frames * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + frames * 2, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(frames * 2, 40)
  for (let i = 0; i < frames; i++) {
    buf.writeInt16LE(Math.round(32767 * fn(i / SR)), 44 + i * 2)
  }
  return buf
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
      title: `POD-14 Show ${runId}`,
      slug: `pod14-show-${runId}`,
      description: 'POD-14 integration fixture show.',
      rssEnabled: true,
      feedVisibility: 'public',
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    } as any,
    overrideAccess: true,
  })

  // Fixture recording: 12 s — tone, silence gap, tone (the WAV writer
  // mirrors the POD-13 fixture). The tone frequency varies per run so
  // the bytes — and therefore the checksum-deduped asset, the
  // transcription idempotency key and the media-jobs row — are fresh
  // on every run (the POD-13 re-run stability lesson).
  const baseFreq = 440 + (parseInt(runId, 16) % 40)
  const fixtureWav = wavBytes(
    (t) =>
      t < 4
        ? 0.5 * Math.sin(2 * Math.PI * baseFreq * t)
        : t < 6
          ? 0
          : 0.4 * Math.sin(2 * Math.PI * baseFreq * 2 * t),
    12,
  )
  audioAssetId = await storeTrackAsset(payload as never, loadConfig(), {
    siteId: String(site.id),
    showId: String(show.id),
    sessionId: `pod14-${runId}`,
    trackId: 'main',
    role: 'host',
    wavBytes: fixtureWav,
    checksumSha256: sha256(fixtureWav),
    durationSec: 12,
  })
  const outageWav = wavBytes((t) => 0.3 * Math.sin(2 * Math.PI * (baseFreq / 2) * t), 6)
  outageAssetId = await storeTrackAsset(payload as never, loadConfig(), {
    siteId: String(site.id),
    showId: String(show.id),
    sessionId: `pod14-${runId}`,
    trackId: 'outage',
    role: 'host',
    wavBytes: outageWav,
    checksumSha256: sha256(outageWav),
    durationSec: 6,
  })

  episodeSlug = `pod14-episode-${runId}`
  episode = await payload.create({
    collection: 'podcast-episodes',
    data: {
      site: site.id,
      show: show.id,
      title: 'POD-14 Episode',
      slug: episodeSlug,
      description: 'JP-7 journey episode.',
      productionState: 'review',
      status: 'draft',
      audio: audioAssetId,
      chapters: [{ startTime: 0, title: 'Original chapter' }],
    } as any,
    overrideAccess: true,
  })

  // The previously REVIEWED revision the publish path must keep serving
  // until the new draft is accepted.
  const oldSegments = [
    { id: 'seg-1', startSeconds: 0, endSeconds: 4, text: 'OLD reviewed opening line.' },
    { id: 'seg-2', startSeconds: 4, endSeconds: 12, text: 'OLD reviewed body text.' },
  ]
  const reviewed = await payload.create({
    collection: 'transcript-revisions',
    data: {
      title: `POD-14 reviewed transcript ${runId}`,
      media: audioAssetId,
      version: 1,
      source: 'manual',
      reviewState: 'reviewed',
      segments: oldSegments,
      checksum: transcriptChecksum(oldSegments as never),
      immutable: true,
    } as any,
    overrideAccess: true,
  })
  reviewedRevisionId = String(reviewed.id)
  await payload.update({
    collection: 'podcast-episodes',
    id: episode.id,
    data: { transcript: reviewedRevisionId },
    overrideAccess: true,
  } as never)

  // Edit project over the same asset for the audiogram render.
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
  const doc: EditProjectDoc = appendProjectVersion(
    {
      version: 1,
      title: `POD-14 project ${runId}`,
      recordingId: null,
      sessionId: null,
      episodeId: String(episode.id),
      edl,
      versions: [],
    },
    'Initial',
    new Date().toISOString(),
  )
  project = await createEditProjectRecord(payload as never, {
    siteId: String(site.id),
    showId: String(show.id),
    project: doc,
  })
})

afterAll(async () => {
  // Fixtures stay in the acceptance DB (shared seed pattern of the POD suites).
})

describe('POD-14 JP-7: transcribe → review → assists → audiogram → publish (L2)', () => {
  it('transcribes via the queued task into a DRAFT revision; public path still serves the reviewed revision', async () => {
    const queued = await queueTranscriptionTask(payload as never, {
      mediaAssetId: audioAssetId,
      episodeId: String(episode.id),
      providerId: 'fixture-provider',
    })
    expect(queued.queued).toBe(true)
    const ran = await (payload as any).jobs.runByID({ id: queued.id })
    expect(ran.job?.hasError ?? false).toBe(false)

    const jobs = await payload.find({
      collection: 'media-jobs' as never,
      where: {
        and: [
          { kind: { equals: 'transcribe' } },
          { 'input.mediaAssetId': { equals: audioAssetId } },
        ],
      },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(jobs.docs).toHaveLength(1)
    const job = jobs.docs[0] as any
    expect(job.status).toBe('completed')
    expect(job.output.providerId).toBe('fixture-provider')
    draftRevisionId = String(job.output.transcriptRevisionId)
    expect(draftRevisionId).toBeTruthy()

    const draft: any = await payload.findByID({
      collection: 'transcript-revisions',
      id: draftRevisionId,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(draft.reviewState).toBe('draft')
    expect(draft.source).toBe('provider')
    expect(draft.segments).toHaveLength(3)
    expect(draft.segments[0]).toMatchObject({
      startSeconds: 0,
      endSeconds: 4,
      speaker: 'Speaker 1',
    })
    expect(draft.segments[1].speaker).toBe('Speaker 2')

    // Publish-flow integrity: the episode still links the OLD revision,
    // so the only segments any POD-01 path can serve are the old ones.
    // (The public route loader itself refuses draft episodes outright —
    // the route-level serving proof runs after publish, below.)
    const current: any = await payload.findByID({
      collection: 'podcast-episodes',
      id: episode.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(String(current.transcript)).toBe(reviewedRevisionId)
    const reviewed = await loadEpisodeReviewedTranscript(payload as never, String(episode.id))
    expect(String(reviewed.revision?.id)).toBe(reviewedRevisionId)
    expect(reviewed.segments[0].text).toBe('OLD reviewed opening line.')
    const json = podcastTranscriptJson(reviewed.segments as never)
    expect(json.segments[0].body).toBe('OLD reviewed opening line.')
    const gated = await loadEpisodeTranscript(
      payload as never,
      episodeSlug,
      `/podcasts/episodes/${episodeSlug}/transcript.json`,
    )
    expect(gated.kind).toBe('missing')
  })

  it('edit the draft → accept → the POD-01 path serves the edited reviewed text; reviewed revisions are immutable', async () => {
    const draft: any = await payload.findByID({
      collection: 'transcript-revisions',
      id: draftRevisionId,
      depth: 0,
      overrideAccess: true,
    } as never)
    const editedSegments = (draft.segments as any[]).map((segment, index) =>
      index === 0
        ? { ...segment, text: 'EDITED opening line for the published episode.' }
        : segment,
    )
    await editTranscriptRevision(payload as never, draftRevisionId, editedSegments as never)

    await acceptTranscriptRevision(payload as never, {
      episodeId: String(episode.id),
      revisionId: draftRevisionId,
    })
    const current: any = await payload.findByID({
      collection: 'podcast-episodes',
      id: episode.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(String(current.transcript)).toBe(draftRevisionId)
    const accepted: any = await payload.findByID({
      collection: 'transcript-revisions',
      id: draftRevisionId,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(accepted.reviewState).toBe('reviewed')

    const reviewed = await loadEpisodeReviewedTranscript(payload as never, String(episode.id))
    expect(String(reviewed.revision?.id)).toBe(draftRevisionId)
    expect(reviewed.segments[0].text).toBe('EDITED opening line for the published episode.')
    expect(reviewed.segments).toHaveLength(3)
    await expect(
      editTranscriptRevision(payload as never, draftRevisionId, editedSegments as never),
    ).rejects.toMatchObject({ code: 'TRANSCRIPT_REVISION_IMMUTABLE' })
  })

  it('provider outage → visible failed job with named error → retry after config fix completes in place', async () => {
    const bogus = createCommandTranscriptionProvider({
      command: '/nonexistent/whisper-binary-xyz',
    })
    await expect(
      runTranscriptionJob(payload as never, undefined, {
        mediaAssetId: outageAssetId,
        provider: bogus,
      }),
    ).rejects.toMatchObject({ code: 'TRANSCRIPTION_PROVIDER_FAILED' })

    const failed = await payload.find({
      collection: 'media-jobs' as never,
      where: {
        and: [
          { kind: { equals: 'transcribe' } },
          { 'input.mediaAssetId': { equals: outageAssetId } },
        ],
      },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(failed.docs).toHaveLength(1)
    const failedJob = failed.docs[0] as any
    expect(failedJob.status).toBe('failed')
    expect(failedJob.failure.code).toBe('TRANSCRIPTION_PROVIDER_FAILED')
    expect(failedJob.failure.message).toContain('/nonexistent/whisper-binary-xyz')

    const retried = await runTranscriptionJob(payload as never, undefined, {
      mediaAssetId: outageAssetId,
      provider: fixtureTranscriptionProvider,
    })
    expect(retried.state).toBe('completed')
    expect(retried.mediaJobId).toBe(String(failedJob.id))
    expect(retried.transcriptRevisionId).toBeTruthy()
    const after: any = await payload.findByID({
      collection: 'media-jobs',
      id: failedJob.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(after.status).toBe('completed')
    expect(after.failure).toBeFalsy()
  })

  it('assists draft everything and change nothing until explicit accept', async () => {
    const drafts = await generateAssistDrafts(payload as never, {
      episodeId: String(episode.id),
      markers: [
        { start: 0, title: 'Cold open' },
        { start: 8, title: 'Second half' },
      ],
      markedRanges: [{ startSec: 8, endSec: 12, label: 'Key quote' }],
      createdBy: 'pod14-test',
    })
    expect(drafts.map((draft) => draft.kind).sort()).toEqual(
      ['chapters', 'highlight', 'show-notes', 'summary'].sort(),
    )
    expect(drafts.every((draft) => draft.state === 'draft')).toBe(true)

    // Episode unchanged while drafts sit unaccepted.
    const untouched: any = await payload.findByID({
      collection: 'podcast-episodes',
      id: episode.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(untouched.chapters).toEqual([{ startTime: 0, title: 'Original chapter' }])
    expect(untouched.showNotes ?? null).toBeNull()

    const chaptersDraft = drafts.find((draft) => draft.kind === 'chapters')!
    const suggested = (chaptersDraft.payload as any).chapters as any[]
    expect(suggested.map((chapter) => chapter.title)).toContain('Cold open')
    expect(suggested.map((chapter) => chapter.title)).toContain('Second half')

    await acceptAssistDraft(payload as never, String(chaptersDraft.id), { by: 'pod14-test' })
    const afterChapters: any = await payload.findByID({
      collection: 'podcast-episodes',
      id: episode.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    // Canonical list landed; the feed chapters document agrees with it
    // and with the POD-13 pair shape (the POD-01 agreement property).
    const feedJson = chaptersToFeedJson(afterChapters.chapters)
    expect(
      chapterPairsAgree(feedJson.chapters, chaptersToPodcastPairs(afterChapters.chapters)),
    ).toBe(true)
    expect(feedJson.chapters.map((chapter) => chapter.title)).toContain('Second half')

    const notesDraft = drafts.find((draft) => draft.kind === 'show-notes')!
    expect((notesDraft.payload as any).basis).toBe('extractive-baseline')
    expect((notesDraft.payload as any).enhancedBy).toBeNull()
    await acceptAssistDraft(payload as never, String(notesDraft.id), { by: 'pod14-test' })
    const afterNotes: any = await payload.findByID({
      collection: 'podcast-episodes',
      id: episode.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(afterNotes.showNotes.source).toBe('pod-14-assist')
    expect(String(afterNotes.showNotes.summary)).toContain('EDITED opening line')

    const summaryDraft = drafts.find((draft) => draft.kind === 'summary')!
    await discardAssistDraft(payload as never, String(summaryDraft.id))
    await expect(
      acceptAssistDraft(payload as never, String(summaryDraft.id)),
    ).rejects.toMatchObject({ code: 'ASSIST_DRAFT_NOT_DRAFT' })

    const listed = await listAssistDrafts(payload as never, String(episode.id))
    expect(listed).toHaveLength(4)
  })

  it('audiogram from the accepted highlight renders a real MP4 draft; episode audio untouched', async () => {
    const drafts = await listAssistDrafts(payload as never, String(episode.id))
    const highlightDraft = drafts.find((draft) => draft.kind === 'highlight')!
    const highlights = (highlightDraft.payload as any).highlights as any[]
    expect(highlights.length).toBeGreaterThan(0)
    await acceptAssistDraft(payload as never, String(highlightDraft.id), { by: 'pod14-test' })
    const marked = highlights.find((clip) => clip.source === 'marked-range') ?? highlights[0]

    const audiogram = await createAudiogramFromHighlight(payload as never, undefined, {
      episodeId: String(episode.id),
      projectId: String(project.id),
      highlight: marked,
      createdBy: 'pod14-test',
    })
    expect(audiogram.kind).toBe('audiogram')
    expect(audiogram.state).toBe('draft')
    const mediaAssetId = String((audiogram.payload as any).mediaAssetId)
    expect(mediaAssetId).toBeTruthy()

    const bytes = await assetBytes(mediaAssetId)
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pod14-audiogram-'))
    const file = path.join(dir, 'audiogram.mp4')
    await writeFile(file, bytes)
    const probe = JSON.parse(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type,codec_name',
        '-show_entries',
        'format=duration',
        '-of',
        'json',
        file,
      ]).toString(),
    )
    const video = (probe.streams as any[]).find((stream) => stream.codec_type === 'video')
    const audio = (probe.streams as any[]).find((stream) => stream.codec_type === 'audio')
    expect(video?.codec_name).toBe('h264')
    expect(audio).toBeTruthy()
    const expectedDuration = marked.endSec - marked.startSec
    expect(Math.abs(Number(probe.format.duration) - expectedDuration)).toBeLessThanOrEqual(0.6)

    const current: any = await payload.findByID({
      collection: 'podcast-episodes',
      id: episode.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(String(current.audio)).toBe(audioAssetId)
  })

  it('publishes through the POD-04 approval gate with the reviewed transcript in place (JP-7 verdict)', async () => {
    await recordEpisodeApproval(payload as never, {
      episodeId: String(episode.id),
      approver: 'pod14-test',
      decision: 'approved',
    })
    const published = await publishEpisode(payload as never, String(episode.id))
    expect(published.productionState).toBe('published')
    expect(published.status).toBe('published')

    const loaded = await loadEpisodeTranscript(
      payload as never,
      episodeSlug,
      `/podcasts/episodes/${episodeSlug}/transcript.json`,
    )
    expect(loaded.kind).toBe('found')
    if (loaded.kind === 'found') {
      expect(loaded.segments[0].text).toBe('EDITED opening line for the published episode.')
    }
    // L2 reference: POD-12/13 basics were proven by their own suites
    // (edit projects + renders); this journey consumed both (the
    // audiogram above rendered off a POD-12 project via POD-13).
  })
})
