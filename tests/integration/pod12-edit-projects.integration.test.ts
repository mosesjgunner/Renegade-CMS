/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-12 (POD-REQ-26, POD-REQ-27) against real Payload + Postgres:
 *
 * - Create-from-recording: a POD-09 recording record (manifest,
 *   markers, POD-08 played-clip log, track assets, a POD-11 conform
 *   report) + a bound episode (canonical chapters + current transcript
 *   revision) becomes an edit project — program lane first as a muted
 *   reference, ISO lanes editable, markers imported, chapters and
 *   transcript seeded, the conform rate correction on the source.
 * - Autosave appends bounded version snapshots; save/reopen round
 *   trip is hash-invariant; restoring a version returns the EDL to
 *   that version's exact hash.
 * - A recording from another show is refused (no cross-show binding).
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { seed } from '../../src/scripts/seed'
import { cutRange, edlHash, setTrackGain } from '../../src/modules/podcast-studio/edit/edl-engine'
import { PROJECT_VERSION_LIMIT } from '../../src/modules/podcast-studio/edit/project'
import {
  createProjectFromRecording,
  listEditProjectRecords,
  loadEditProjectRecord,
  restoreEditProjectVersion,
  saveEditProjectEdl,
} from '../../src/modules/podcast-studio/edit/projects-service'

let payload: Payload
let site: any
let show: any
let episode: any
let recording: any
const runId = randomUUID().slice(0, 8)

const manifest = {
  version: 1,
  sessionId: `sess-pod12-${runId}`,
  createdAt: new Date().toISOString(),
  sampleRate: 48000,
  tracks: [
    {
      trackId: 'program',
      role: 'program',
      channels: 2,
      channelLayout: 'stereo',
      durationSec: 900,
      checksumSha256: 'b'.repeat(64),
      mediaAssetId: 'asset-program-placeholder',
      syncEvents: [{ type: 'head', trackSamples: 0, timelineSamples: 0 }],
    },
    {
      trackId: 'host-iso',
      role: 'host',
      channels: 1,
      channelLayout: 'mono',
      durationSec: 900,
      checksumSha256: 'a'.repeat(64),
      mediaAssetId: 'asset-host-placeholder',
      syncEvents: [{ type: 'head', trackSamples: 0, timelineSamples: 0 }],
    },
  ],
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
      title: `POD-12 Show ${runId}`,
      slug: `pod12-show-${runId}`,
      description: 'POD-12 integration fixture show.',
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
      title: 'POD-12 Episode',
      slug: `pod12-episode-${runId}`,
      productionState: 'recorded',
      status: 'draft',
      chapters: [
        { startTime: 0, title: 'Open' },
        { startTime: 300, title: 'Interview' },
      ],
      // No transcript revision bound in this fixture: episode.transcript
      // is a relationship to transcript-revisions (which requires a full
      // media-asset chain). Transcript seeding through the POD-03 loader
      // is unit-proven in tests/unit/podcast-studio-edit.test.ts.
    } as any,
    overrideAccess: true,
  })
  recording = await payload.create({
    collection: 'podcast-recordings' as any,
    data: {
      site: site.id,
      show: show.id,
      episode: episode.id,
      state: 'finalized',
      manifest,
      markers: [{ number: 1, name: 'Intro done', atElapsedSec: 60, atSample: 60 * 48000 }],
      playedClipLog: [
        {
          id: 'cart:sting:120',
          source: 'cart',
          clipId: 'sting',
          title: 'Sting',
          startedAtSessionSec: 120,
          endedAtSessionSec: 124,
          outcome: 'completed',
        },
      ],
      trackAssets: [
        {
          trackId: 'program',
          mediaAssetId: 'asset-program-placeholder',
          checksumSha256: 'b'.repeat(64),
        },
        {
          trackId: 'host-iso',
          mediaAssetId: 'asset-host-placeholder',
          checksumSha256: 'a'.repeat(64),
        },
      ],
      conformReports: [
        {
          inviteId: 'inv-1',
          trackId: 'host-iso',
          state: 'conformed',
          rateCorrection: {
            nominalRate: 48000,
            measuredRateHz: 48003.84,
            resampleFactor: 0.99992,
            rateCorrectionPpm: 80,
            offsetSamplesAtHead: 0,
          },
        },
      ],
      finalizedAt: new Date().toISOString(),
    } as any,
    overrideAccess: true,
  })
})

afterAll(async () => {
  // Fixtures stay in the acceptance DB (shared seed pattern of the POD suites).
})

describe('POD-12 edit projects (integration)', () => {
  it('creates a project from the recording: lanes, markers, seeds, conform artefact', async () => {
    const record = await createProjectFromRecording(payload as never, {
      siteId: String(site.id),
      showId: String(show.id),
      recordingId: String(recording.id),
      title: 'POD-12 edit',
    })
    const edl = record.project.edl
    expect(record.project.recordingId).toBe(String(recording.id))
    expect(record.project.episodeId).toBe(String(episode.id))
    expect(edl.tracks.map((track) => track.id)).toEqual(['program', 'host-iso'])
    expect(edl.tracks[0].muted).toBe(true)
    expect(edl.tracks[1].muted).toBeUndefined()
    expect(edl.tracks[1].clips[0]).toMatchObject({ sourceIn: 0, sourceOut: 900, timelineStart: 0 })
    expect(
      edl.sources.find((source) => source.id === 'host-iso')?.rateCorrection?.rateCorrectionPpm,
    ).toBe(80)
    expect(edl.markers?.map((marker) => [marker.start, marker.type])).toEqual([
      [60, 'recording-marker'],
      [120, 'played-clip'],
    ])
    expect(edl.chapters).toEqual([
      { start: 0, title: 'Open' },
      { start: 300, title: 'Interview' },
    ])
    expect(edl.transcript).toEqual([])
    expect(record.project.versions).toHaveLength(1)

    const listed = await listEditProjectRecords(payload as never, String(show.id))
    expect(listed.map((entry) => entry.id)).toContain(record.id)
  })

  it('autosave appends versions; reopen is hash-invariant; restore returns the exact version hash', async () => {
    const created = await createProjectFromRecording(payload as never, {
      siteId: String(site.id),
      showId: String(show.id),
      recordingId: String(recording.id),
      title: 'POD-12 edit — versions',
    })
    const v1Hash = edlHash(created.project.edl)

    const cut = cutRange(created.project.edl, { start: 100, end: 160 })
    const saved = await saveEditProjectEdl(payload as never, created.id, cut.edl, 'cut 100-160')
    expect(saved.project.versions).toHaveLength(2)
    expect(saved.project.versions[1].label).toBe('cut 100-160')

    const gained = setTrackGain(saved.project.edl, 'host-iso', 0.5)
    const saved2 = await saveEditProjectEdl(payload as never, created.id, gained.edl, 'host gain')
    expect(saved2.project.versions).toHaveLength(3)

    const reopened = await loadEditProjectRecord(payload as never, created.id)
    expect(reopened).toBeTruthy()
    expect(edlHash(reopened!.project.edl)).toBe(edlHash(saved2.project.edl))

    const restored = await restoreEditProjectVersion(payload as never, created.id, 1)
    expect(edlHash(restored.project.edl)).toBe(v1Hash)
    expect(restored.project.versions[restored.project.versions.length - 1].label).toBe(
      'Restored version 1',
    )
  })

  it('version history stays bounded under repeated autosaves', async () => {
    const created = await createProjectFromRecording(payload as never, {
      siteId: String(site.id),
      showId: String(show.id),
      recordingId: String(recording.id),
      title: 'POD-12 edit — bounded',
    })
    let current = created
    for (let i = 0; i < PROJECT_VERSION_LIMIT + 4; i++) {
      const gained = setTrackGain(current.project.edl, 'host-iso', 1 + i / 100)
      current = await saveEditProjectEdl(payload as never, created.id, gained.edl, `gain ${i}`)
    }
    expect(current.project.versions).toHaveLength(PROJECT_VERSION_LIMIT)
    const reopened = await loadEditProjectRecord(payload as never, created.id)
    expect(reopened!.project.versions).toHaveLength(PROJECT_VERSION_LIMIT)
  })

  it('refuses to build a project from a recording of another show', async () => {
    const otherShow = await payload.create({
      collection: 'podcast-shows',
      data: {
        site: site.id,
        title: `POD-12 Other Show ${runId}`,
        slug: `pod12-other-show-${runId}`,
        rssEnabled: true,
        feedVisibility: 'public',
        status: 'published',
        publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
      } as any,
      overrideAccess: true,
    })
    await expect(
      createProjectFromRecording(payload as never, {
        siteId: String(site.id),
        showId: String(otherShow.id),
        recordingId: String(recording.id),
      }),
    ).rejects.toThrow(/does not belong to this show/)
  })
})
