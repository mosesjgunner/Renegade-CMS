/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-13 (POD-REQ-28, POD-REQ-29) against real Payload + Postgres +
 * real ffmpeg 8.1.2:
 *
 * - PT-C fixture render: the PT-C EDL (pre-cut timeline run through
 *   the POD-12 engine's cut) renders to a master whose duration and
 *   sample count match the EDL exactly (12.000 s / 576,000 frames),
 *   whose measured loudness lands at −16 LUFS ± 0.5 with true peak
 *   under the gate ceiling, and whose chapters agree field-by-field
 *   across the MP3's ID3 CHAP frames, the Podcast JSON sidecar and
 *   the episode's canonical chapter list (the POD-01 agreement).
 * - Publish path: the master attaches through POD-04
 *   (replaceEpisodeAudio + editing→review), the GUID is preserved,
 *   and the episode then publishes through the approval gate.
 * - Stereo renders target −16 LUFS, mono renders −19 LUFS.
 * - Silence-gap vs ripple delete semantics are audible in the render
 *   (segment energies measured on the decoded master).
 * - Idempotency: same project+EDL re-render returns the same record
 *   and registers no new assets; the core render is deterministic
 *   (identical master checksum + measurements across two runs).
 * - Failure behaviour: missing asset → named RENDER_SOURCE_MISSING
 *   with nothing registered; worker killed mid-render (fault hook) →
 *   failed record, no partial assets, retry completes in place;
 *   silent program → RENDER_LOUDNESS_GATE with measurements, no
 *   master promoted.
 * - Preview excerpt, audiogram profile and the queued
 *   `podcast-render` task all execute end-to-end.
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { seed } from '../../src/scripts/seed'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'
import fixture from '../fixtures/podcast-studio/edl-pt-c.json'
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
import { createEditProjectRecord } from '../../src/modules/podcast-studio/edit/projects-service'
import { storeTrackAsset } from '../../src/modules/podcast-studio/recording/finalize'
import {
  parseId3Chapters,
  probeAudioFile,
  renderEdlToFiles,
} from '../../src/modules/podcast-studio/render/render'
import {
  queuePodcastRenderTask,
  renderProject,
  storeRenderAsset,
} from '../../src/modules/podcast-studio/render/render-service'
import { publishEpisode, recordEpisodeApproval } from '../../src/modules/podcast-studio/production'

const SR = 48000
const runId = randomUUID().slice(0, 8)

let payload: Payload
let site: any
let show: any
let episode: any
let ptcProject: any
let ptcEdl: EditEdl
let artworkAssetId: string

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** PT-C source WAV writer (the prototype's exact synthetic sources). */
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

const ptcSources: Record<string, (t: number) => number> = {
  host: (t) =>
    (t >= 2 && t < 3) || (t >= 9 && t < 10) ? 0 : 0.5 * Math.sin(2 * Math.PI * 440 * t),
  guest: (t) => 0.4 * Math.sin(2 * Math.PI * 880 * t),
  music: (t) => 0.12 * Math.sin(2 * Math.PI * 220 * t),
}

const assetBytes = async (assetId: string): Promise<Buffer> => {
  const asset: any = await payload.findByID({
    collection: 'media-assets',
    id: assetId,
    depth: 0,
    overrideAccess: true,
  } as never)
  expect(asset).toBeTruthy()
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

const countAssetsForTitle = async (titlePart: string): Promise<number> => {
  const found = await payload.find({
    collection: 'media-assets',
    where: { title: { like: titlePart } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  } as never)
  return found.docs.length
}

const makeProject = async (title: string, edl: EditEdl, episodeId: string | null): Promise<any> => {
  const doc: EditProjectDoc = appendProjectVersion(
    {
      version: 1,
      title,
      recordingId: null,
      sessionId: null,
      episodeId,
      edl: ensureClipIds(edl),
      versions: [],
    },
    'Initial',
    new Date().toISOString(),
  )
  return createEditProjectRecord(payload as never, {
    siteId: String(site.id),
    showId: String(show.id),
    project: doc,
  })
}

const storeWavAsset = async (trackId: string, bytes: Buffer, seconds: number): Promise<string> =>
  storeTrackAsset(payload as never, loadConfig(), {
    siteId: String(site.id),
    showId: String(show.id),
    sessionId: `pod13-${runId}`,
    trackId,
    role: 'host',
    wavBytes: bytes,
    checksumSha256: sha256(bytes),
    durationSec: seconds,
  })

const singleLaneEdl = (
  sourceId: string,
  assetId: string,
  clips: Array<{ sourceIn: number; sourceOut: number; timelineStart: number }>,
  extra: Record<string, unknown> = {},
): EditEdl =>
  ensureClipIds({
    version: 1,
    sessionRate: SR,
    sources: [{ id: sourceId, mediaAssetId: assetId }],
    tracks: [
      {
        id: sourceId,
        gain: 1,
        clips: clips.map((clip) => ({ ...clip, sourceId })),
      },
    ],
    chapters: [{ start: 0, title: 'Start' }],
    transcript: [],
    ...extra,
  } as never)

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
      title: `POD-13 Show ${runId}`,
      slug: `pod13-show-${runId}`,
      description: 'POD-13 integration fixture show.',
      rssEnabled: true,
      feedVisibility: 'public',
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
      exportProfile: {
        filenameTemplate: '{episode-slug}',
        titleTemplate: '{show-title} — {episode-title}',
      },
    } as any,
    overrideAccess: true,
  })

  // Artwork: a real JPEG generated by ffmpeg, registered as an image asset.
  const artworkDir = await mkdtemp(path.join(os.tmpdir(), 'pod13-artwork-'))
  const artworkPath = path.join(artworkDir, 'cover.jpg')
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
    artworkPath,
  ])
  const artworkBytes = await readFile(artworkPath)
  artworkAssetId = await storeRenderAsset(payload as never, loadConfig(), {
    siteId: String(site.id),
    title: `POD-13 artwork ${runId}`,
    kind: 'image',
    mimeType: 'image/jpeg',
    filename: 'cover.jpg',
    bytes: artworkBytes,
    checksumSha256: sha256(artworkBytes),
  })
  await payload.update({
    collection: 'podcast-shows',
    id: show.id,
    data: { artwork: artworkAssetId },
    overrideAccess: true,
  } as never)

  episode = await payload.create({
    collection: 'podcast-episodes',
    data: {
      site: site.id,
      show: show.id,
      title: 'POD-13 Episode',
      slug: `pod13-episode-${runId}`,
      description: 'Rendered by POD-13.',
      productionState: 'editing',
      status: 'draft',
      artwork: artworkAssetId,
      chapters: [{ startTime: 0, title: 'Stale chapter (replaced by render)' }],
    } as any,
    overrideAccess: true,
  })
  expect(episode.guid).toBeTruthy()

  // PT-C project: pre-cut EDL over media-asset sources, cut by the engine.
  const assetIds: Record<string, string> = {}
  for (const [id, fn] of Object.entries(ptcSources)) {
    assetIds[id] = await storeWavAsset(`ptc-${id}`, wavBytes(fn, 15), 15)
  }
  const preCut: EditEdl = ensureClipIds({
    version: 1,
    sessionRate: SR,
    sources: Object.keys(ptcSources).map((id) => ({ id, mediaAssetId: assetIds[id] })),
    tracks: (fixture as any).tracks.map((track: any) => ({
      id: track.id,
      gain: track.gain,
      clips: [{ sourceId: track.id, sourceIn: 0, sourceOut: 15, timelineStart: 0 }],
    })),
    chapters: (fixture as any).chapters,
    transcript: (fixture as any).transcript,
    crossfadeSec: 0.5,
    loudnessTarget: (fixture as any).loudnessTarget,
  } as never)
  ptcEdl = cutRange(preCut, { start: 5, end: 8 }).edl
  ptcProject = await makeProject(`POD-13 PT-C ${runId}`, ptcEdl, String(episode.id))
})

afterAll(async () => {
  // Fixtures stay in the acceptance DB (shared seed pattern of the POD suites).
})

describe('POD-13 render & export (integration)', () => {
  it('PT-C: renders the fixture EDL to a loudness-gated master and attaches it through POD-04', async () => {
    const guidBefore = String(episode.guid)
    const result = await renderProject(payload as never, undefined, {
      projectId: ptcProject.id,
      profile: 'master',
    })
    expect(result.state).toBe('completed')
    expect(result.deduplicated).toBe(false)
    expect(result.episodeTransition).toBe('editing-to-review')

    const report = result.report!
    expect(report.durationSec).toBe(12)
    expect(report.frames).toBe(576_000)
    expect(report.loudnessTarget).toMatchObject({ I: -16, TP: -1.5 })
    expect(Math.abs(report.measurements.integratedLufs - -16)).toBeLessThanOrEqual(0.5)
    expect(report.measurements.truePeakDb).toBeLessThanOrEqual(-1.4)
    expect(report.gate).toMatchObject({ enforced: true, passed: true })
    // The repo PCM cross-check tracks the ebur128 measurement.
    expect(
      Math.abs(report.measurements.pcmIntegratedLufs - report.measurements.integratedLufs),
    ).toBeLessThanOrEqual(1.0)

    for (const key of ['wavMaster', 'mp3', 'opus', 'chaptersJson'])
      expect(result.outputs[key]?.mediaAssetId, key).toBeTruthy()
    expect(result.outputs.mp3.filename).toBe(`pod13-episode-${runId}.mp3`)

    // WAV master: exact sample count on the stored bytes.
    const wav = await assetBytes(result.outputs.wavMaster.mediaAssetId)
    const wavDir = await mkdtemp(path.join(os.tmpdir(), 'pod13-check-'))
    const wavPath = path.join(wavDir, 'master.wav')
    await writeFile(wavPath, wav)
    const wavProbe = await probeAudioFile(wavPath)
    expect(wavProbe.frames).toBe(576_000)
    expect(wavProbe.durationSec).toBe(12)

    // MP3: ID3 tags from the show export profile + embedded chapters +
    // embedded artwork, chapters parsed from the raw ID3 CHAP frames.
    const mp3 = await assetBytes(result.outputs.mp3.mediaAssetId)
    const mp3Path = path.join(wavDir, 'master.mp3')
    await writeFile(mp3Path, mp3)
    const mp3Probe = await probeAudioFile(mp3Path)
    expect(mp3Probe.codec).toBe('mp3')
    expect(mp3Probe.tags.title).toBe(`POD-13 Show ${runId} — POD-13 Episode`)
    expect(mp3Probe.tags.artist).toBe(`POD-13 Show ${runId}`)
    const expectedChapters = [
      { startTime: 0, title: 'Cold open' },
      { startTime: 4, title: 'Topic setup' },
      { startTime: 9, title: 'Wrap up' },
    ]
    expect(mp3Probe.chapters).toEqual(expectedChapters)
    expect(parseId3Chapters(mp3)).toEqual(expectedChapters)
    const streamInfo = JSON.parse(
      execFileSync('ffprobe', [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_streams',
        mp3Path,
      ]).toString(),
    )
    expect(streamInfo.streams.some((s: any) => s.codec_type === 'video')).toBe(true)

    // Sidecar: the same chapter list, Podcast JSON chapters 1.2.0.
    const sidecar = JSON.parse(
      (await assetBytes(result.outputs.chaptersJson.mediaAssetId)).toString('utf8'),
    )
    expect(sidecar).toEqual({ version: '1.2.0', chapters: expectedChapters })

    // Opus output exists and probes as opus.
    const opus = await assetBytes(result.outputs.opus.mediaAssetId)
    const opusPath = path.join(wavDir, 'master.opus')
    await writeFile(opusPath, opus)
    expect((await probeAudioFile(opusPath)).codec).toBe('opus')

    // Episode: audio replaced with the MP3, chapters synced to the
    // same list, provenance stored, GUID untouched, state in review.
    const after: any = await payload.findByID({
      collection: 'podcast-episodes',
      id: episode.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(String(after.audio?.id ?? after.audio)).toBe(result.outputs.mp3.mediaAssetId)
    expect(after.enclosureMimeType).toBe('audio/mpeg')
    expect(after.chapters).toEqual(expectedChapters)
    expect(after.guid).toBe(guidBefore)
    expect(after.productionState).toBe('review')
    expect(after.renderProvenance.edlHash).toBe(edlHash(ptcEdl))
    expect(after.renderProvenance.recipe).toBe('podcast-standard-lufs16')
    expect(after.renderProvenance.measurements.integratedLufs).toBe(
      report.measurements.integratedLufs,
    )

    // Publish through POD-04's approval gate; GUID still preserved.
    await recordEpisodeApproval(payload as never, {
      episodeId: String(episode.id),
      approver: 'pod13-test',
      decision: 'approved',
    })
    const published: any = await publishEpisode(payload as never, String(episode.id))
    expect(published.productionState).toBe('published')
    expect(published.status).toBe('published')
    expect(published.guid).toBe(guidBefore)
  })

  it('idempotency: re-render returns the same record and registers no new assets; the core is deterministic', async () => {
    const before = await countAssetsForTitle(`POD-13 PT-C ${runId}`)
    const again = await renderProject(payload as never, undefined, {
      projectId: ptcProject.id,
      profile: 'master',
    })
    expect(again.deduplicated).toBe(true)
    expect(await countAssetsForTitle(`POD-13 PT-C ${runId}`)).toBe(before)

    // Core determinism on file sources: identical checksum + measurements.
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pod13-det-'))
    const sources: Array<{
      sourceId: string
      path: string
      channels: number
      sampleRate: number
      origin: string
    }> = []
    for (const [id, fn] of Object.entries(ptcSources)) {
      const filePath = path.join(dir, `src-${id}.wav`)
      await writeFile(filePath, wavBytes(fn, 15))
      sources.push({ sourceId: id, path: filePath, channels: 1, sampleRate: SR, origin: filePath })
    }
    const run = async (name: string) =>
      renderEdlToFiles({
        edl: ptcEdl,
        sources,
        workDir: await mkdtemp(path.join(os.tmpdir(), `pod13-det-${name}-`)),
        profile: 'master',
      })
    const first = await run('a')
    const second = await run('b')
    expect(second.outputs.wavMaster!.checksumSha256).toBe(first.outputs.wavMaster!.checksumSha256)
    expect(second.measurements).toEqual(first.measurements)
  })

  it('loudness targets: stereo renders to −16 LUFS, mono renders to −19 LUFS', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pod13-targets-'))
    const stereoPath = path.join(dir, 'stereo.wav')
    await writeFile(
      stereoPath,
      wavBytes((t) => 0.5 * Math.sin(2 * Math.PI * 440 * t), 6, 2),
    )
    const stereoEdl = singleLaneEdl('voice', 'unused', [
      { sourceIn: 0, sourceOut: 6, timelineStart: 0 },
    ])
    stereoEdl.sources = [{ id: 'voice', file: stereoPath }]
    const stereo = await renderEdlToFiles({
      edl: stereoEdl,
      sources: [
        { sourceId: 'voice', path: stereoPath, channels: 2, sampleRate: SR, origin: stereoPath },
      ],
      workDir: await mkdtemp(path.join(os.tmpdir(), 'pod13-stereo-')),
      profile: 'master',
    })
    expect(stereo.channels).toBe(2)
    expect(stereo.loudnessTarget.I).toBe(-16)
    expect(Math.abs(stereo.measurements.integratedLufs - -16)).toBeLessThanOrEqual(0.5)
    expect(stereo.measurements.truePeakDb).toBeLessThanOrEqual(-1.4)

    const monoPath = path.join(dir, 'mono.wav')
    await writeFile(
      monoPath,
      wavBytes((t) => 0.5 * Math.sin(2 * Math.PI * 440 * t), 6, 1),
    )
    const monoEdl = singleLaneEdl('voice', 'unused', [
      { sourceIn: 0, sourceOut: 6, timelineStart: 0 },
    ])
    monoEdl.sources = [{ id: 'voice', file: monoPath }]
    const mono = await renderEdlToFiles({
      edl: monoEdl,
      sources: [
        { sourceId: 'voice', path: monoPath, channels: 1, sampleRate: SR, origin: monoPath },
      ],
      workDir: await mkdtemp(path.join(os.tmpdir(), 'pod13-mono-')),
      profile: 'master',
    })
    expect(mono.channels).toBe(1)
    expect(mono.loudnessTarget.I).toBe(-19)
    expect(Math.abs(mono.measurements.integratedLufs - -19)).toBeLessThanOrEqual(0.5)
    expect(mono.measurements.truePeakDb).toBeLessThanOrEqual(-1.4)
  })

  it('delete semantics are audible: silence gap stays silent, ripple moves audio earlier (segment energies)', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pod13-gap-'))
    const tonePath = path.join(dir, 'tone.wav')
    await writeFile(
      tonePath,
      wavBytes((t) => 0.5 * Math.sin(2 * Math.PI * 440 * t), 10, 1),
    )
    const sources = [
      { sourceId: 'voice', path: tonePath, channels: 1, sampleRate: SR, origin: tonePath },
    ]
    const render = async (edl: EditEdl, name: string) =>
      renderEdlToFiles({
        edl,
        sources,
        workDir: await mkdtemp(path.join(os.tmpdir(), `pod13-gap-${name}-`)),
        profile: 'master',
      })
    const rmsInWindow = async (filePath: string, fromSec: number, toSec: number) => {
      const bytes = await readFile(filePath)
      // Our masters are s16 WAV: find the data chunk and measure RMS.
      const dataAt = bytes.indexOf('data')
      const start = Math.floor(fromSec * SR)
      const end = Math.floor(toSec * SR)
      let sum = 0
      for (let i = start; i < end; i++) sum += (bytes.readInt16LE(dataAt + 8 + i * 2) / 32768) ** 2
      return Math.sqrt(sum / (end - start))
    }

    const gapEdl = singleLaneEdl('voice', 'unused', [
      { sourceIn: 0, sourceOut: 5, timelineStart: 0 },
      { sourceIn: 5, sourceOut: 10, timelineStart: 8 },
    ])
    gapEdl.sources = [{ id: 'voice', file: tonePath }]
    const gap = await render(gapEdl, 'gap')
    expect(gap.frames).toBe(13 * SR)
    expect(await rmsInWindow(gap.outputs.wavMaster!.path, 5.5, 7.5)).toBeLessThan(0.002)
    expect(await rmsInWindow(gap.outputs.wavMaster!.path, 1, 3)).toBeGreaterThan(0.05)

    const rippleEdl = singleLaneEdl('voice', 'unused', [
      { sourceIn: 0, sourceOut: 5, timelineStart: 0 },
      { sourceIn: 5, sourceOut: 10, timelineStart: 5 },
    ])
    rippleEdl.sources = [{ id: 'voice', file: tonePath }]
    const ripple = await render(rippleEdl, 'ripple')
    expect(ripple.frames).toBe(10 * SR)
    expect(await rmsInWindow(ripple.outputs.wavMaster!.path, 5.5, 7.5)).toBeGreaterThan(0.05)
  })

  it('preview: renders a 3 s excerpt through the same graph without attaching', async () => {
    const episodeBefore: any = await payload.findByID({
      collection: 'podcast-episodes',
      id: episode.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    const result = await renderProject(payload as never, undefined, {
      projectId: ptcProject.id,
      profile: 'preview',
      range: { startSec: 0, durationSec: 3 },
    })
    expect(result.state).toBe('completed')
    expect(result.report!.durationSec).toBe(3)
    expect(result.report!.frames).toBe(3 * SR)
    const excerpt = await assetBytes(result.outputs.wavMaster.mediaAssetId)
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pod13-preview-'))
    const excerptPath = path.join(dir, 'excerpt.wav')
    await writeFile(excerptPath, excerpt)
    const probe = await probeAudioFile(excerptPath)
    expect(probe.frames).toBe(3 * SR)
    const episodeAfter: any = await payload.findByID({
      collection: 'podcast-episodes',
      id: episode.id,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(String(episodeAfter.audio?.id ?? episodeAfter.audio)).toBe(
      String(episodeBefore.audio?.id ?? episodeBefore.audio),
    )
  })

  it('missing asset: fails with the named error, registers nothing, leaves a failed record', async () => {
    const missingEdl = singleLaneEdl('ghost', randomUUID(), [
      { sourceIn: 0, sourceOut: 5, timelineStart: 0 },
    ])
    const project = await makeProject(`POD-13 missing ${runId}`, missingEdl, null)
    const assetsBefore = await countAssetsForTitle(`POD-13 missing ${runId}`)
    await expect(
      renderProject(payload as never, undefined, { projectId: project.id, profile: 'master' }),
    ).rejects.toMatchObject({ code: 'RENDER_SOURCE_MISSING' })
    expect(await countAssetsForTitle(`POD-13 missing ${runId}`)).toBe(assetsBefore)
    const records = await payload.find({
      collection: 'podcast-renders' as never,
      where: { project: { equals: project.id } },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(records.docs).toHaveLength(1)
    expect((records.docs[0] as any).state).toBe('failed')
    expect(String((records.docs[0] as any).errorMessage)).toContain('RENDER_SOURCE_MISSING')
  })

  it('worker killed mid-render: no partial assets, retry completes in place on the same record', async () => {
    const toneAsset = await storeWavAsset(
      'kill-tone',
      wavBytes((t) => 0.5 * Math.sin(2 * Math.PI * 330 * t), 6, 2),
      6,
    )
    const edl = singleLaneEdl('voice', toneAsset, [{ sourceIn: 0, sourceOut: 6, timelineStart: 0 }])
    const project = await makeProject(`POD-13 kill ${runId}`, edl, null)

    await expect(
      renderProject(payload as never, undefined, {
        projectId: project.id,
        profile: 'master',
        faultAtStage: 'after-prenorm',
      }),
    ).rejects.toMatchObject({ code: 'RENDER_INTERRUPTED' })
    const failed = await payload.find({
      collection: 'podcast-renders' as never,
      where: { project: { equals: project.id } },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(failed.docs).toHaveLength(1)
    expect((failed.docs[0] as any).state).toBe('failed')
    // No partial promotion: the failed record carries no outputs.
    expect((failed.docs[0] as any).outputs ?? null).toBeNull()

    const retried = await renderProject(payload as never, undefined, {
      projectId: project.id,
      profile: 'master',
    })
    expect(retried.state).toBe('completed')
    expect(retried.renderId).toBe(String((failed.docs[0] as any).id))
    // Exactly one output set was registered by the retry: four
    // distinct assets whose stored checksums match the render's.
    // (Checksum dedupe may return an earlier byte-identical asset —
    // that is the POD-02/09 dedupe semantics, not a duplicate.)
    const outputEntries = Object.values(retried.outputs) as any[]
    expect(outputEntries).toHaveLength(4)
    expect(new Set(outputEntries.map((entry) => entry.mediaAssetId)).size).toBe(4)
    for (const entry of outputEntries) {
      const asset: any = await payload.findByID({
        collection: 'media-assets',
        id: entry.mediaAssetId,
        depth: 0,
        overrideAccess: true,
      } as never)
      expect(asset.checksum).toBe(`sha256:${entry.checksumSha256}`)
    }
    const records = await payload.find({
      collection: 'podcast-renders' as never,
      where: { project: { equals: project.id } },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(records.docs).toHaveLength(1)
    expect((records.docs[0] as any).state).toBe('completed')
  })

  it('out-of-gate: a silent program fails the loudness gate with measurements and promotes nothing', async () => {
    const silenceAsset = await storeWavAsset(
      'silence',
      wavBytes(() => 0, 4, 1),
      4,
    )
    const edl = singleLaneEdl('voice', silenceAsset, [
      { sourceIn: 0, sourceOut: 4, timelineStart: 0 },
    ])
    const project = await makeProject(`POD-13 silence ${runId}`, edl, null)
    const error = await renderProject(payload as never, undefined, {
      projectId: project.id,
      profile: 'master',
    }).catch((caught) => caught)
    expect(error).toMatchObject({ code: 'RENDER_LOUDNESS_GATE' })
    expect(error.measurements.integratedLufs).toBe(-70)
    expect(await countAssetsForTitle(`POD-13 silence ${runId}`)).toBe(0)
    const records = await payload.find({
      collection: 'podcast-renders' as never,
      where: { project: { equals: project.id } },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect((records.docs[0] as any).state).toBe('failed')
    expect((records.docs[0] as any).report.gate.passed).toBe(false)
    expect((records.docs[0] as any).report.measurements.integratedLufs).toBe(-70)
  })

  it('audiogram profile: MP4 with artwork + waveform and an MP3 from the same render', async () => {
    const result = await renderProject(payload as never, undefined, {
      projectId: ptcProject.id,
      profile: 'audiogram',
      range: { startSec: 0, durationSec: 4 },
    })
    expect(result.state).toBe('completed')
    expect(result.outputs.audiogramMp4?.mediaAssetId).toBeTruthy()
    expect(result.outputs.mp3?.mediaAssetId).toBeTruthy()
    const mp4 = await assetBytes(result.outputs.audiogramMp4.mediaAssetId)
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pod13-audiogram-'))
    const mp4Path = path.join(dir, 'audiogram.mp4')
    await writeFile(mp4Path, mp4)
    const info = JSON.parse(
      execFileSync('ffprobe', [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_streams',
        '-show_format',
        mp4Path,
      ]).toString(),
    )
    expect(info.streams.some((s: any) => s.codec_type === 'video' && s.codec_name === 'h264')).toBe(
      true,
    )
    expect(info.streams.some((s: any) => s.codec_type === 'audio')).toBe(true)
    expect(Number(info.format.duration)).toBeGreaterThan(3.4)
    expect(Number(info.format.duration)).toBeLessThan(4.6)
  })

  it('the queued podcast-render task executes a clip render end-to-end', async () => {
    const toneAsset = await storeWavAsset(
      'queue-tone',
      wavBytes((t) => 0.5 * Math.sin(2 * Math.PI * 220 * t), 6, 2),
      6,
    )
    const edl = singleLaneEdl('voice', toneAsset, [{ sourceIn: 0, sourceOut: 6, timelineStart: 0 }])
    const project = await makeProject(`POD-13 queue ${runId}`, edl, null)
    const queued = await queuePodcastRenderTask(payload as never, {
      projectId: project.id,
      edlHash: edlHash(edl),
      profile: 'clip',
      range: { startSec: 0, durationSec: 2 },
    })
    expect(queued.queued).toBe(true)
    const ran = await (payload as any).jobs.runByID({ id: queued.id })
    expect(ran.job?.hasError ?? false).toBe(false)
    const records = await payload.find({
      collection: 'podcast-renders' as never,
      where: { project: { equals: project.id } },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(records.docs).toHaveLength(1)
    expect((records.docs[0] as any).state).toBe('completed')
    expect((records.docs[0] as any).profile).toBe('clip')
    expect((records.docs[0] as any).report.durationSec).toBe(2)
    expect((records.docs[0] as any).jobId).toBeTruthy()
  })
})
