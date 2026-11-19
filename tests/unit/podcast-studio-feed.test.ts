/**
 * POD-01 — port of the PT-D prototype assertion set onto repo code.
 *
 * Fixtures are built in-code from the repo's own types (the PT-D prototype
 * outputs were not copied). Covers POD-REQ-01…05: channel guid/locked/
 * medium, persons/funding/value, transcript + chapter serialisations from
 * one source, the three liveItem shapes, structural validation with named
 * errors for each seeded defect, and GUID stability across a slug rename
 * via the persisted podcastGuidValue.
 */
import { describe, expect, it } from 'vitest'

import {
  assertPodcastValueSplits,
  inspectPodcastFeed,
  podcastChannelGuid,
  podcastGuid,
  podcastRss,
  podcastTranscriptJson,
  podcastTranscriptSrt,
  validatePodcastFeed,
  type PodcastFeedEpisode,
} from '../../src/modules/media/publishing'

const SITE = 'https://publisher.test'
const FEED_URL = `${SITE}/podcasts/renegade-test/feed.xml`

const hosts = [
  {
    name: 'Renegade Test Host',
    role: 'host',
    group: 'Hosts',
    href: 'https://publisher.test/people/host',
    img: 'https://publisher.test/people/host.jpg',
  },
  {
    name: 'Second Host',
    role: 'host',
    group: 'Hosts',
    href: 'https://publisher.test/people/host-two',
    img: 'https://publisher.test/people/host-two.jpg',
  },
]
const guest = {
  name: 'Guest One',
  role: 'guest',
  group: 'Guests',
  href: 'https://publisher.test/people/guest-one',
  img: 'https://publisher.test/people/guest-one.jpg',
}
const value = {
  type: 'lightning',
  method: 'keysend',
  suggested: '0.00000005',
  recipients: [
    { name: 'Host wallet', type: 'node', address: '030a58b8653d32b99200a2', split: 90 },
    { name: 'Podcast Index', type: 'node', address: '032f4ffbba307ce2c7ef', split: 10 },
  ],
}
const segments = [
  { startSeconds: 0, endSeconds: 4.5, text: 'Welcome and intro', speaker: 'Host' },
  { startSeconds: 4.5, endSeconds: 9, text: 'Topic setup and story', speaker: 'Host' },
  { startSeconds: 9, endSeconds: 12, text: 'Wrap up', speaker: 'Guest One' },
]
const chapters = [
  { startTime: 0, title: 'Cold open' },
  { startTime: 4, title: 'Topic setup' },
  { startTime: 9, title: 'Wrap up' },
]

const richEpisode: PodcastFeedEpisode = {
  id: 'ep-001',
  guid: podcastGuid('show-1', 'ep-001'),
  title: 'Episode 1 — The Full Namespace Episode',
  slug: 'ep-001-full-namespace',
  description: 'Rich episode.',
  publishedAt: '2026-11-17T10:00:00Z',
  audioUrl: 'https://publisher.test/media/ep-001.mp3',
  bytes: 192000,
  mimeType: 'audio/mpeg',
  durationSeconds: 12,
  chapters,
  transcriptUrl: `${SITE}/podcasts/episodes/ep-001-full-namespace/transcript`,
  transcriptJsonUrl: `${SITE}/podcasts/episodes/ep-001-full-namespace/transcript.json`,
  transcriptSrtUrl: `${SITE}/podcasts/episodes/ep-001-full-namespace/transcript.srt`,
  transcriptLanguage: 'en',
  persons: [hosts[0]!, guest],
  value: {
    type: 'lightning',
    method: 'keysend',
    suggested: '0.00000010',
    recipients: [
      { name: 'Host wallet', type: 'node', address: '030a58b8653d32b99200a2', split: 80 },
      { name: 'Guest wallet', type: 'node', address: '02b4632d08485ff1df2db5', split: 10 },
      { name: 'Producer wallet', type: 'node', address: '03e7156ae33b0a208d1d5', split: 10 },
    ],
  },
}

const storedGuid = podcastChannelGuid(FEED_URL)

function buildFeed(overrides: Partial<Parameters<typeof podcastRss>[0]> = {}) {
  return podcastRss({
    title: 'Renegade Test Show',
    description: 'Fixture show for the POD-01 feed suite.',
    siteUrl: SITE,
    path: '/podcasts/renegade-test/feed.xml',
    showPath: '/podcasts/renegade-test',
    language: 'en',
    podcastGuidValue: storedGuid,
    lockedOwnerEmail: 'host@publisher.test',
    medium: 'podcast',
    funding: {
      url: 'https://publisher.test/shows/renegade-test/support',
      label: 'Support the show',
    },
    value,
    persons: hosts,
    episodes: [richEpisode],
    ...overrides,
  })
}

describe('POD-01 Podcasting 2.0 feed generation', () => {
  it('emits the full channel set: guid, locked, medium, funding, value, persons', () => {
    const feed = buildFeed()
    expect(feed).toContain(`<podcast:guid>${storedGuid}</podcast:guid>`)
    expect(feed).toContain('<podcast:locked owner="host@publisher.test">yes</podcast:locked>')
    expect(feed).toContain('<podcast:medium>podcast</podcast:medium>')
    expect(feed).toContain(
      '<podcast:funding url="https://publisher.test/shows/renegade-test/support">Support the show</podcast:funding>',
    )
    expect(feed).toContain(
      '<podcast:value type="lightning" method="keysend" suggested="0.00000005">',
    )
    expect(feed).toContain('split="90"')
    expect(feed).toContain('split="10"')
    // 2 channel hosts
    expect(feed.match(/<podcast:person/g)?.length).toBe(4) // 2 channel + host & guest on the item
    expect(feed).toContain('>Renegade Test Host</podcast:person>')
    expect(feed).toContain('>Second Host</podcast:person>')
    expect(feed).toContain('>Guest One</podcast:person>')
  })

  it('computes podcast:guid as a spec UUIDv5 of the canonical feed URL', () => {
    expect(podcastChannelGuid(FEED_URL)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(podcastChannelGuid(FEED_URL)).toBe(podcastChannelGuid(`${FEED_URL}/`))
    expect(podcastChannelGuid(FEED_URL)).toBe(storedGuid)
    // Deterministic across rebuilds.
    expect(buildFeed()).toBe(buildFeed())
  })

  it('keeps podcast:guid byte-stable across a slug rename via the persisted value', () => {
    const renamed = podcastRss({
      title: 'Renegade Test Show',
      siteUrl: SITE,
      path: '/podcasts/a-brand-new-slug/feed.xml',
      showPath: '/podcasts/a-brand-new-slug',
      podcastGuidValue: storedGuid,
      episodes: [richEpisode],
    })
    expect(renamed).toContain(`<podcast:guid>${storedGuid}</podcast:guid>`)
    // Without the persisted value the GUID would follow the URL — the reason
    // the value is generated once and stored on the show.
    const unpersisted = podcastRss({
      title: 'Renegade Test Show',
      siteUrl: SITE,
      path: '/podcasts/a-brand-new-slug/feed.xml',
      episodes: [richEpisode],
    })
    expect(unpersisted).not.toContain(`<podcast:guid>${storedGuid}</podcast:guid>`)
  })

  it('changes nothing but the always-emitted channel tags for an unconfigured show', () => {
    const feed = podcastRss({
      title: 'Plain show',
      siteUrl: SITE,
      path: '/podcasts/plain/feed.xml',
      episodes: [
        {
          id: 'ep-1',
          guid: podcastGuid('show-plain', 'ep-1'),
          title: 'Plain episode',
          slug: 'plain-episode',
          publishedAt: '2026-11-01T10:00:00Z',
          audioUrl: 'https://publisher.test/media/plain.mp3',
          bytes: 1234,
          mimeType: 'audio/mpeg',
        },
      ],
    })
    const channelTags = feed.slice(feed.indexOf('<atom:link'), feed.indexOf('<item>'))
    expect(channelTags).toContain('<podcast:guid>')
    expect(channelTags).toContain('<podcast:locked>yes</podcast:locked>')
    expect(channelTags).toContain('<podcast:medium>podcast</podcast:medium>')
    expect(feed).not.toContain('<podcast:funding')
    expect(feed).not.toContain('<podcast:value')
    expect(feed).not.toContain('<podcast:person')
    expect(feed).not.toContain('<podcast:liveItem')
    // Episode GUID and enclosure are untouched.
    expect(feed).toContain('<guid isPermaLink="false">urn:renegade:podcast:show-plain:ep-1</guid>')
    expect(feed).toContain(
      '<enclosure url="https://publisher.test/media/plain.mp3" length="1234" type="audio/mpeg"/>',
    )
    expect(validatePodcastFeed(feed)).toEqual({
      valid: true,
      enclosureLength: 1234,
      enclosureType: 'audio/mpeg',
    })
  })

  it('emits transcript variants and the chapters pointer on the rich episode', () => {
    const feed = buildFeed()
    expect(feed).toContain('type="text/html"')
    expect(feed).toContain(
      `<podcast:transcript url="${SITE}/podcasts/episodes/ep-001-full-namespace/transcript.json" type="application/json" language="en"/>`,
    )
    expect(feed).toContain(
      `<podcast:transcript url="${SITE}/podcasts/episodes/ep-001-full-namespace/transcript.srt" type="application/x-subrip" language="en" rel="captions"/>`,
    )
    expect(feed).toContain(
      `<podcast:chapters url="${SITE}/podcasts/episodes/ep-001-full-namespace/chapters.json" type="application/json+chapters"/>`,
    )
  })

  it('serialises one transcript segment source as JSON and SRT that agree', () => {
    const json = podcastTranscriptJson(segments)
    expect(json.version).toBe('1.0.0')
    expect(json.segments.map((s) => s.body)).toEqual(segments.map((s) => s.text))
    expect(json.segments.map((s) => s.startTime)).toEqual(segments.map((s) => s.startSeconds))
    const srt = podcastTranscriptSrt(segments)
    const cues = srt.trim().split(/\n\n+/)
    expect(cues).toHaveLength(segments.length)
    expect(cues[0]).toContain('00:00:00,000 --> 00:00:04,500')
    expect(cues[1]).toContain('00:00:04,500 --> 00:00:09,000')
    cues.forEach((cue, index) => expect(cue).toContain(segments[index]!.text))
  })

  it('validates the rich feed structurally and reports counts', () => {
    const feed = buildFeed()
    expect(validatePodcastFeed(feed)).toEqual({
      valid: true,
      enclosureLength: 192000,
      enclosureType: 'audio/mpeg',
    })
    const inspection = inspectPodcastFeed(feed)
    expect(inspection.valid).toBe(true)
    expect(inspection.errors).toEqual([])
    expect(inspection.counts.items).toBe(1)
    expect(inspection.counts.persons).toBe(4)
  })
})

describe('POD-01 podcast:liveItem shapes', () => {
  const liveEpisode: PodcastFeedEpisode = {
    id: 'ep-live',
    guid: podcastGuid('show-1', 'ep-live'),
    title: 'Live Show — Launch Night',
    slug: 'live-launch-night',
    description: 'Live episode.',
    publishedAt: '2026-11-20T19:00:00Z',
    audioUrl: '',
    bytes: 0,
    mimeType: 'audio/mpeg',
    liveStartAt: '2026-11-21T01:00:00Z',
    liveEndAt: '2026-11-21T03:00:00Z',
    liveStreamUrl: 'https://stream.publisher.test/renegade-test/live.mp3',
  }

  it('scheduled -> liveItem status "pending", not a regular item', () => {
    const feed = buildFeed({ episodes: [{ ...liveEpisode, liveState: 'scheduled' }] })
    expect(feed).toContain('<podcast:liveItem status="pending" start="2026-11-21T01:00:00.000Z"')
    expect(feed).not.toContain('<item>')
    expect(feed).toContain(
      '<enclosure url="https://stream.publisher.test/renegade-test/live.mp3" length="0" type="audio/mpeg"/>',
    )
    expect(inspectPodcastFeed(feed).valid).toBe(true)
  })

  it('live -> liveItem status "live"', () => {
    const feed = buildFeed({ episodes: [{ ...liveEpisode, liveState: 'live' }] })
    expect(feed).toContain('<podcast:liveItem status="live"')
    expect(feed).not.toContain('<item>')
    expect(inspectPodcastFeed(feed).counts.liveItems).toBe(1)
  })

  it('ended without a recording -> liveItem status "ended" with an end attribute', () => {
    const feed = buildFeed({ episodes: [{ ...liveEpisode, liveState: 'ended' }] })
    expect(feed).toContain('<podcast:liveItem status="ended"')
    expect(feed).toContain('end="2026-11-21T03:00:00.000Z"')
    expect(feed).not.toContain('<item>')
    expect(inspectPodcastFeed(feed).valid).toBe(true)
  })

  it('ended with a recording -> normal item pointing at the recording', () => {
    const feed = buildFeed({
      episodes: [
        {
          ...liveEpisode,
          liveState: 'ended',
          audioUrl: 'https://publisher.test/media/live-recording.mp3',
          bytes: 960000,
        },
      ],
    })
    expect(feed).not.toContain('<podcast:liveItem')
    expect(feed).toContain('<item>')
    expect(feed).toContain(
      '<enclosure url="https://publisher.test/media/live-recording.mp3" length="960000" type="audio/mpeg"/>',
    )
    expect(inspectPodcastFeed(feed).valid).toBe(true)
  })
})

describe('POD-01 structural validator seeded defects', () => {
  it('rejects duplicate episode GUIDs with a named error', () => {
    const feed = buildFeed({
      episodes: [richEpisode, { ...richEpisode, id: 'ep-002', slug: 'ep-002', title: 'Copy' }],
    })
    expect(() => validatePodcastFeed(feed)).toThrow(/Duplicate GUID/)
    expect(inspectPodcastFeed(feed).errors.join(' ')).toMatch(/Duplicate GUID/)
  })

  it('rejects value splits summing to 99 at build, save-check, and validation', () => {
    const badValue = {
      ...value,
      recipients: [
        { name: 'Host wallet', type: 'node', address: '030a58b8653d32b99200a2', split: 90 },
        { name: 'Podcast Index', type: 'node', address: '032f4ffbba307ce2c7ef', split: 9 },
      ],
    }
    expect(() => assertPodcastValueSplits(badValue)).toThrow(/sum to 100 \(got 99\)/)
    expect(() => buildFeed({ value: badValue })).toThrow(/sum to 100/)
    const feed = buildFeed().replace('split="90"', 'split="89"')
    expect(() => validatePodcastFeed(feed)).toThrow(/splits sum to 99, not 100/)
  })

  it('rejects a feed missing podcast:locked with a named error', () => {
    const feed = buildFeed().replace(/<podcast:locked[^>]*>yes<\/podcast:locked>/, '')
    expect(feed).not.toContain('podcast:locked')
    expect(() => validatePodcastFeed(feed)).toThrow(/Missing <podcast:locked>/)
  })

  it('rejects bad escaping and unclosed tags as malformed XML', () => {
    const rawAmp = buildFeed().replace('<language>en</language>', '<language>en & us</language>')
    expect(() => validatePodcastFeed(rawAmp)).toThrow(/Malformed XML|entity/)
    const unclosed = buildFeed().replace('</channel>', '')
    expect(() => validatePodcastFeed(unclosed)).toThrow(/Malformed XML/)
  })

  it('rejects a missing enclosure length with a named error', () => {
    const feed = buildFeed().replace('length="192000"', 'length="0"')
    expect(() => validatePodcastFeed(feed)).toThrow(/enclosure length must be at least 1/)
  })

  it('rejects a feed with no XML declaration', () => {
    expect(() => validatePodcastFeed('<rss version="2.0"></rss>')).toThrow(
      /Missing XML declaration/,
    )
  })
})
