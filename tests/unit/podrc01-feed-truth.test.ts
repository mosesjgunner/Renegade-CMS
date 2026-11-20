/**
 * POD-RC-01 Step 02 — Feed Health truth.
 *
 * Regression coverage for the two defects Sol's audit confirmed against
 * the pre-pass code:
 *  1. The emitter wrote an owner email only into the `podcast:locked`
 *     owner attribute; no `<itunes:owner>` element existed, so directory
 *     ownership verification had no address to verify against.
 *  2. The validator returned `valid: true` for an item whose enclosure
 *     carried a length and a type but no URL at all.
 *
 * Also pins the separation the pass requires: structural validity,
 * directory prerequisites, and directory acceptance are three different
 * answers. Prerequisites never flip `valid`, and nothing here claims a
 * directory accepted anything.
 */
import { describe, expect, it } from 'vitest'

import {
  inspectPodcastFeed,
  podcastChannelGuid,
  podcastGuid,
  podcastRss,
  validatePodcastFeed,
  type PodcastFeedEpisode,
} from '../../src/modules/media/publishing'
import { renderPodcastFeed } from '../../src/modules/podcast-studio/feed-build'

const SITE = 'https://publisher.test'
const FEED_PATH = '/podcasts/feed-truth/feed.xml'
const AUDIO_URL = 'https://publisher.test/media/ep-1.mp3'

const episode: PodcastFeedEpisode = {
  id: 'ep-1',
  guid: podcastGuid('show-1', 'ep-1'),
  title: 'Episode 1',
  slug: 'ep-1',
  description: 'First episode.',
  publishedAt: '2026-11-19T10:00:00Z',
  audioUrl: AUDIO_URL,
  bytes: 192000,
  mimeType: 'audio/mpeg',
}

function buildFeed(overrides: Partial<Parameters<typeof podcastRss>[0]> = {}) {
  return podcastRss({
    title: 'Feed Truth Show',
    description: 'Fixture show for the POD-RC-01 feed-truth suite.',
    siteUrl: SITE,
    path: FEED_PATH,
    showPath: '/podcasts/feed-truth',
    artworkUrl: `${SITE}/media/cover.jpg`,
    language: 'en',
    podcastGuidValue: podcastChannelGuid(`${SITE}${FEED_PATH}`),
    episodes: [episode],
    ...overrides,
  })
}

describe('POD-RC-01 itunes:owner emission', () => {
  it('emits <itunes:owner> with the configured address when the setting is on', () => {
    const feed = buildFeed({ directoryOwnerEmail: 'verify@publisher.test' })
    expect(feed).toContain(
      '<itunes:owner><itunes:email>verify@publisher.test</itunes:email></itunes:owner>',
    )
  })

  it('emits no <itunes:owner> when the setting is off', () => {
    const feed = buildFeed()
    expect(feed).not.toContain('<itunes:owner>')
    expect(feed).not.toContain('<itunes:email>')
  })

  it('keeps podcast:locked separate: a locked owner email never becomes itunes:owner', () => {
    const feed = buildFeed({ lockedOwnerEmail: 'host@publisher.test' })
    expect(feed).toContain('<podcast:locked owner="host@publisher.test">yes</podcast:locked>')
    expect(feed).not.toContain('<itunes:owner>')
  })

  it('keeps podcast:locked bare when only the directory email is set', () => {
    const feed = buildFeed({ directoryOwnerEmail: 'verify@publisher.test' })
    expect(feed).toContain('<podcast:locked>yes</podcast:locked>')
    expect(feed).not.toContain('podcast:locked owner=')
  })

  it('does not change channel or episode GUIDs when the setting toggles', () => {
    const off = buildFeed()
    const on = buildFeed({ directoryOwnerEmail: 'verify@publisher.test' })
    const guidOf = (feed: string) => feed.match(/<podcast:guid>([^<]+)<\/podcast:guid>/)?.[1]
    expect(guidOf(on)).toBe(guidOf(off))
    expect(on).toContain(`<guid isPermaLink="false">${episode.guid}</guid>`)
    expect(off).toContain(`<guid isPermaLink="false">${episode.guid}</guid>`)
  })
})

describe('POD-RC-01 validator enclosure truth', () => {
  it('keeps the valid path valid', () => {
    const inspection = inspectPodcastFeed(buildFeed())
    expect(inspection.valid).toBe(true)
    expect(inspection.errors).toEqual([])
    expect(validatePodcastFeed(buildFeed())).toEqual({
      valid: true,
      enclosureLength: 192000,
      enclosureType: 'audio/mpeg',
    })
  })

  it('rejects an enclosure with no URL (the confirmed false-green)', () => {
    const feed = buildFeed().replace(` url="${AUDIO_URL}"`, '')
    expect(feed).not.toContain(AUDIO_URL)
    const inspection = inspectPodcastFeed(feed)
    expect(inspection.valid).toBe(false)
    expect(inspection.errors.join(' ')).toMatch(/missing an enclosure URL/)
    expect(() => validatePodcastFeed(feed)).toThrow(/missing an enclosure URL/)
  })

  it('rejects an enclosure URL that is not a valid http(s) URL', () => {
    const relative = buildFeed().replace(AUDIO_URL, '/media/ep-1.mp3')
    expect(inspectPodcastFeed(relative).valid).toBe(false)
    expect(inspectPodcastFeed(relative).errors.join(' ')).toMatch(/not a valid http\(s\) URL/)
    const ftp = buildFeed().replace(AUDIO_URL, 'ftp://publisher.test/media/ep-1.mp3')
    expect(inspectPodcastFeed(ftp).valid).toBe(false)
    expect(inspectPodcastFeed(ftp).errors.join(' ')).toMatch(/not a valid http\(s\) URL/)
  })

  it('rejects a missing enclosure length attribute', () => {
    const feed = buildFeed().replace(' length="192000"', '')
    const inspection = inspectPodcastFeed(feed)
    expect(inspection.valid).toBe(false)
    expect(inspection.errors.join(' ')).toMatch(/enclosure length must be at least 1/)
  })

  it('rejects an unsupported enclosure type', () => {
    const feed = buildFeed().replace('type="audio/mpeg"', 'type="video/mp4"')
    const inspection = inspectPodcastFeed(feed)
    expect(inspection.valid).toBe(false)
    expect(inspection.errors.join(' ')).toMatch(/not a supported audio type/)
  })
})

describe('POD-RC-01 directory prerequisites are separate from validity', () => {
  it('reports missing artwork as a prerequisite, not an error', () => {
    const inspection = inspectPodcastFeed(buildFeed({ artworkUrl: undefined }))
    expect(inspection.valid).toBe(true)
    expect(inspection.errors).toEqual([])
    expect(inspection.prerequisites.join(' ')).toMatch(/artwork/)
  })

  it('reports an empty feed as a prerequisite, not an error', () => {
    const inspection = inspectPodcastFeed(buildFeed({ episodes: [] }))
    expect(inspection.valid).toBe(true)
    expect(inspection.prerequisites.join(' ')).toMatch(/no episodes/)
  })

  it('reports a missing owner email only when verification is wanted', () => {
    const feed = buildFeed()
    expect(inspectPodcastFeed(feed).prerequisites.join(' ')).not.toMatch(/itunes:owner/)
    const wanted = inspectPodcastFeed(feed, { requireOwnerEmail: true })
    expect(wanted.valid).toBe(true)
    expect(wanted.prerequisites.join(' ')).toMatch(/itunes:owner/)
  })

  it('clears the owner-email prerequisite when a usable owner email is in the feed', () => {
    const feed = buildFeed({ directoryOwnerEmail: 'verify@publisher.test' })
    const inspection = inspectPodcastFeed(feed, { requireOwnerEmail: true })
    expect(inspection.prerequisites.join(' ')).not.toMatch(/itunes:owner/)
  })

  it('warns (without failing validity) when the owner email is malformed', () => {
    const feed = buildFeed({ directoryOwnerEmail: 'not-an-email' })
    const inspection = inspectPodcastFeed(feed, { requireOwnerEmail: true })
    expect(inspection.valid).toBe(true)
    expect(inspection.warnings.join(' ')).toMatch(/does not look like an email address/)
    expect(inspection.prerequisites.join(' ')).toMatch(/itunes:owner/)
  })

  it('a fully ready feed has no unmet prerequisites', () => {
    const inspection = inspectPodcastFeed(buildFeed({ directoryOwnerEmail: 'verify@x.test' }), {
      requireOwnerEmail: true,
    })
    expect(inspection.valid).toBe(true)
    expect(inspection.prerequisites).toEqual([])
  })
})

describe('POD-RC-01 member feeds keep private sidecars private', () => {
  const showDoc = {
    id: 'show-1',
    title: 'Feed Truth Show',
    slug: 'feed-truth',
    description: 'Fixture show.',
    language: 'en',
    explicit: false,
  }
  const episodeDoc = (membersOnly: boolean) => ({
    id: membersOnly ? 'ep-private' : 'ep-public',
    guid: podcastGuid('show-1', membersOnly ? 'ep-private' : 'ep-public'),
    title: membersOnly ? 'Private Episode' : 'Public Episode',
    slug: membersOnly ? 'ep-private' : 'ep-public',
    description: 'Episode.',
    status: 'published',
    publishedAt: '2026-11-19T10:00:00Z',
    membersOnly,
    audio: { id: 'audio-1', mimeType: 'audio/mpeg', sizeBytes: 192000, durationSeconds: 12 },
    transcript: 'transcript-rev-1',
    chapters: [{ startTime: 0, title: 'Intro' }],
  })
  const render = (docs: unknown[], memberFeed: boolean) =>
    renderPodcastFeed(showDoc as never, docs as never[], {
      origin: SITE,
      feedPath: '/podcasts/feed-truth/member-feed/token',
      showPath: '/podcasts/feed-truth',
      includeMembersOnly: true,
      memberFeed,
      enclosureUrl: (ep: { id: string }) =>
        `${SITE}/podcasts/feed-truth/member-feed/token/episode/${ep.id}/audio`,
    })

  it('omits transcript/chapter links for a members-only episode in a member feed', () => {
    const feed = render([episodeDoc(true)], true)
    expect(feed).toContain('Private Episode')
    expect(feed).not.toContain('podcast:transcript')
    expect(feed).not.toContain('podcast:chapters')
  })

  it('keeps sidecar links for a public episode in the same member feed', () => {
    const feed = render([episodeDoc(false)], true)
    expect(feed).toContain('podcast:transcript')
    expect(feed).toContain('podcast:chapters')
  })

  it('without the member-feed flag the private links appear (the pre-fix behaviour)', () => {
    const feed = render([episodeDoc(true)], false)
    expect(feed).toContain('podcast:transcript')
    expect(feed).toContain('podcast:chapters')
  })
})
