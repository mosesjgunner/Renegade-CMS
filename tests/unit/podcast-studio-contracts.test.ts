import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  parseEdl,
  parseProjectBundleManifest,
  parseStudioSession,
  parseTrackManifest,
  serializeEdl,
  serializeProjectBundleManifest,
  serializeStudioSession,
  serializeTrackManifest,
  type Edl,
  type ProjectBundleManifest,
  type TrackManifest,
} from '../../src/modules/podcast-studio/contracts'

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'tests/fixtures/podcast-studio', name), 'utf8'),
  ) as Record<string, unknown>

const SHA_A = 'a'.repeat(64)
const SHA_B = '0123456789abcdef'.repeat(4)

/** PT-E predates versioning: add the v1 envelope (version + showId) for the contract round trip. */
const sessionFixtureV1 = () => ({
  ...fixture('session-pt-e.json'),
  version: 1,
  showId: 'show-pt-e-001',
})

describe('podcast studio contracts (POD-00)', () => {
  it('round-trips the PT-E session fixture losslessly through parse -> serialize', () => {
    const input = sessionFixtureV1()
    const parsed = parseStudioSession(input)
    expect(JSON.parse(serializeStudioSession(parsed))).toEqual(input)
    // The serializer output is itself parseable and stable.
    expect(parseStudioSession(serializeStudioSession(parsed))).toEqual(parsed)
  })

  it('preserves optional session extensions verbatim', () => {
    const input = {
      ...sessionFixtureV1(),
      players: [{ id: 'player-1', clipId: 'cart-a1' }],
      liveState: { streaming: false },
      deviceRoles: { mic: 'ONE MIC' },
    }
    const parsed = parseStudioSession(input)
    expect(JSON.parse(serializeStudioSession(parsed))).toEqual(input)
  })

  it('round-trips the PT-C EDL fixture losslessly through parse -> serialize', () => {
    const input = fixture('edl-pt-c.json')
    const parsed = parseEdl(input)
    expect(JSON.parse(serializeEdl(parsed))).toEqual(input)
    expect(parseEdl(serializeEdl(parsed))).toEqual(parsed)
  })

  it('maps the PT-F drift fixture edlCorrection into an EDL source rateCorrection and validates', () => {
    const drift = fixture('drift-pt-f.json') as {
      edlCorrection: { trackB: Record<string, unknown> }
    }
    const correction = drift.edlCorrection.trackB
    expect(correction).toMatchObject({
      nominalRate: 48000,
      measuredRateHz: 48003.84,
      rateCorrectionPpm: 80,
      offsetSamplesAtHead: 0,
    })
    const edlInput = fixture('edl-pt-c.json') as unknown as Edl & {
      sources: Array<Record<string, unknown>>
    }
    const withCorrection = {
      ...edlInput,
      sources: edlInput.sources.map((source) =>
        source.id === 'guest' ? { ...source, rateCorrection: correction } : source,
      ),
    }
    const parsed = parseEdl(withCorrection)
    const guest = parsed.sources.find((source) => source.id === 'guest')
    expect(guest?.rateCorrection).toEqual(correction)
    expect(JSON.parse(serializeEdl(parsed))).toEqual(withCorrection)
  })

  it('constructs and validates a track manifest', () => {
    const manifest: TrackManifest = {
      version: 1,
      sessionId: 'sess-pt-e-001',
      createdAt: '2026-11-18T15:00:00.000Z',
      sampleRate: 48000,
      tracks: [
        {
          trackId: 'track-host',
          role: 'host',
          channels: 1,
          channelLayout: 'mono',
          durationSec: 3600,
          checksumSha256: SHA_A,
          mediaAssetId: 'media-host-1',
          syncEvents: [
            { type: 'head', trackSamples: 0, timelineSamples: 0 },
            { type: 'tail', trackSamples: 172800000, timelineSamples: 172800000 },
          ],
          rateCorrectionPpm: 80,
        },
        {
          trackId: 'track-guest-1',
          role: 'guest',
          guestId: 'guest-1',
          channels: 1,
          channelLayout: 'mono',
          durationSec: 3599.9,
          checksumSha256: SHA_B,
          syncEvents: [{ type: 'head', trackSamples: 12, timelineSamples: 0 }],
        },
        {
          trackId: 'track-program',
          role: 'program',
          channels: 2,
          channelLayout: 'stereo',
          durationSec: 3600,
          checksumSha256: SHA_B,
          syncEvents: [],
        },
      ],
    }
    const parsed = parseTrackManifest(manifest)
    expect(JSON.parse(serializeTrackManifest(parsed))).toEqual(manifest)
  })

  it('constructs and validates a project bundle manifest', () => {
    const manifest: ProjectBundleManifest = {
      version: 1,
      bundleId: 'bundle-1',
      createdAt: '2026-11-18T15:00:00.000Z',
      show: { id: 'show-pt-e-001', title: 'PT-E Fixture Show' },
      contents: [
        {
          kind: 'session',
          id: 'sess-pt-e-001',
          path: 'sessions/sess-pt-e-001.json',
          checksumSha256: SHA_A,
        },
        { kind: 'track', id: 'track-host', path: 'tracks/track-host.wav', checksumSha256: SHA_B },
      ],
      permissionsManifest: [
        { role: 'host', capabilities: ['studio.run', 'episode.publish'] },
        { role: 'guest', capabilities: ['studio.join'] },
      ],
      idMapping: { 'sess-pt-e-001': 'sess-restored-001' },
    }
    const parsed = parseProjectBundleManifest(manifest)
    expect(JSON.parse(serializeProjectBundleManifest(parsed))).toEqual(manifest)
  })

  it('rejects a wrong contract version', () => {
    expect(() => parseStudioSession({ ...sessionFixtureV1(), version: 2 })).toThrow(
      /version must be 1/,
    )
    expect(() => parseEdl({ ...fixture('edl-pt-c.json'), version: 99 })).toThrow(
      /version must be 1/,
    )
  })

  it('rejects a negative time', () => {
    expect(() => parseStudioSession({ ...sessionFixtureV1(), elapsedSec: -1 })).toThrow(
      /elapsedSec must not be negative/,
    )
    const edl = fixture('edl-pt-c.json') as { chapters: Array<Record<string, unknown>> }
    expect(() => parseEdl({ ...edl, chapters: [{ start: -0.5, title: 'Bad' }] })).toThrow(
      /must not be negative/,
    )
  })

  it('rejects a clip with sourceOut <= sourceIn', () => {
    const edl = fixture('edl-pt-c.json') as unknown as Edl
    const broken = {
      ...edl,
      tracks: [{ id: 'host', gain: 1, clips: [{ sourceIn: 5, sourceOut: 5, timelineStart: 0 }] }],
    }
    expect(() => parseEdl(broken)).toThrow(/sourceOut must be greater than sourceIn/)
  })

  it('rejects a bad checksum format', () => {
    const manifest = {
      version: 1,
      sessionId: 'sess-1',
      createdAt: '2026-11-18T15:00:00.000Z',
      sampleRate: 48000,
      tracks: [
        {
          trackId: 'track-host',
          role: 'host',
          channels: 1,
          channelLayout: 'mono',
          durationSec: 10,
          checksumSha256: 'not-a-sha256',
          syncEvents: [],
        },
      ],
    }
    expect(() => parseTrackManifest(manifest)).toThrow(/SHA-256/)
    expect(() =>
      parseProjectBundleManifest({
        version: 1,
        bundleId: 'bundle-1',
        createdAt: '2026-11-18T15:00:00.000Z',
        show: { id: 'show-1', title: 'Show' },
        contents: [{ kind: 'session', id: 's1', path: 's.json', checksumSha256: 'xyz' }],
        permissionsManifest: [],
      }),
    ).toThrow(/SHA-256/)
  })

  it('rejects a missing required field', () => {
    const session = sessionFixtureV1() as Record<string, unknown>
    delete session.showId
    expect(() => parseStudioSession(session)).toThrow(/missing required field "showId"/)
    const edl = fixture('edl-pt-c.json') as Record<string, unknown>
    delete edl.sources
    expect(() => parseEdl(edl)).toThrow(/missing required field "sources"/)
  })

  it('rejects a chapter past the known timeline duration', () => {
    const edl = fixture('edl-pt-c.json') as unknown as Edl
    // PT-C timeline duration is 12s (clips end at timeline 5 + 7s).
    const broken = { ...edl, chapters: [{ start: 12.5, title: 'Too late' }] }
    expect(() => parseEdl(broken)).toThrow(/past the EDL timeline duration/)
    // A chapter exactly at the duration remains valid (PT-C has one at 12s in its source set).
    expect(parseEdl({ ...edl, chapters: [{ start: 12, title: 'Wrap up' }] }).chapters).toHaveLength(
      1,
    )
  })
})
