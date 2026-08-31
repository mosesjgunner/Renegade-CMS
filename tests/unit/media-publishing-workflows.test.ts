/* eslint-disable @typescript-eslint/no-explicit-any -- Payload store test doubles are deliberately minimal. */
import { describe, expect, it } from 'vitest'

import {
  assertSafeEmbedUrl,
  importPodcastFeed,
  parseRssEpisodes,
  podcastRss,
  publicVideo,
  syncYouTubeVideo,
  transcriptFromSegments,
  validatePodcastFeed,
  youtubeAdapter,
} from '../../src/modules/media/publishing'

describe('podcast and video publishing workflows', () => {
  it('publishes a consumable RSS feed with a correct audio enclosure and podcast metadata', () => {
    const feed = podcastRss({
      title: 'A representative show',
      description: 'A show.',
      siteUrl: 'https://publisher.test',
      path: '/podcasts/show/feed.xml',
      episodes: [
        {
          id: 'episode-1',
          title: 'Representative episode',
          slug: 'representative',
          description: 'Notes',
          publishedAt: '2026-08-31T12:00:00Z',
          audioUrl: 'https://publisher.test/media/audio-1',
          bytes: 1234,
          mimeType: 'audio/mpeg',
          durationSeconds: 61,
          chapters: [{ startTime: 0, title: 'Start' }],
        },
      ],
    })
    expect(validatePodcastFeed(feed)).toEqual({
      valid: true,
      enclosureLength: 1234,
      enclosureType: 'audio/mpeg',
    })
    expect(feed).toContain('podcast:chapters')
  })

  it('parses an imported RSS enclosure deterministically and rejects malformed enclosures', () => {
    const source =
      '<?xml version="1.0"?><rss><channel><item><title>One</title><guid>episode-1</guid><pubDate>Mon, 31 Aug 2026 12:00:00 GMT</pubDate><enclosure url="https://cdn.test/one.mp3" length="1234" type="audio/mpeg"/></item></channel></rss>'
    const first = parseRssEpisodes(source)
    const second = parseRssEpisodes(source)
    expect(first).toEqual(second)
    expect(first[0].enclosureBytes).toBe(1234)
    expect(() => parseRssEpisodes('<rss><item><guid>x</guid></item></rss>')).toThrow('enclosure')
  })

  it('imports a claimed feed twice without duplicates and blocks tenant crossover', async () => {
    const records: any[] = [{ id: 'show-a', site: 'site-a', importOwnership: 'claimed-import' }]
    const store = {
      async findByID() {
        return records[0]
      },
      async find(args: any) {
        return {
          docs: records.filter(
            (record) => record.providerIdentity === args.where?.providerIdentity?.equals,
          ),
        }
      },
      async create(args: any) {
        const record = { id: `episode-${records.length}`, ...args.data }
        records.push(record)
        return record
      },
      async update(args: any) {
        const record = records.find((value) => value.id === args.id)
        Object.assign(record, args.data)
        return record
      },
    }
    const source =
      '<rss><channel><item><title>One</title><guid>one</guid><enclosure url="https://cdn.test/one.mp3" length="12" type="audio/mpeg"/></item></channel></rss>'
    const input = {
      siteId: 'site-a',
      showId: 'show-a',
      feedUrl: 'http://feeds.test/show.xml',
      allowPrivate: true,
      resolve: async () => [{ address: '127.0.0.1' }],
      fetcher: async () =>
        new Response(source, { headers: { 'content-type': 'application/rss+xml' } }) as any,
    }
    expect(await importPodcastFeed(store, input)).toMatchObject({ created: 1, updated: 0 })
    expect(await importPodcastFeed(store, input)).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 1,
    })
    await expect(importPodcastFeed(store, { ...input, siteId: 'site-b' })).rejects.toThrow('scope')
  })

  it('limits embeds to the primary adapter and presents unavailable remote media clearly', () => {
    expect(
      assertSafeEmbedUrl('https://www.youtube-nocookie.com/embed/video-1', 'youtube', 'video-1'),
    ).toContain('/embed/video-1')
    expect(() =>
      assertSafeEmbedUrl('https://evil.test/embed/video-1?x=1', 'youtube', 'video-1'),
    ).toThrow('approved')
    expect(publicVideo({ status: 'published', availability: 'removed' })).toEqual({
      available: false,
      message: 'This video has been removed.',
    })
    expect(publicVideo({ status: 'draft', availability: 'available' })).toMatchObject({
      available: false,
    })
    expect(youtubeAdapter.validate({ channelId: '', apiKey: '' })).toMatchObject({ ok: false })
  })

  it('syncs a claimed YouTube channel twice without duplicate video records', async () => {
    const records: any[] = [{ id: 'channel-a', site: 'site-a', syncClaimed: true }]
    const store = {
      async findByID() {
        return records[0]
      },
      async find(args: any) {
        return {
          docs: records.filter(
            (record) => record.providerIdentity === args.where?.providerIdentity?.equals,
          ),
        }
      },
      async create(args: any) {
        const record = { id: `video-${records.length}`, ...args.data }
        records.push(record)
        return record
      },
      async update(args: any) {
        const record = records.find((value) => value.id === args.id)
        Object.assign(record, args.data)
        return record
      },
    }
    const video = { id: 'abc123', title: 'Provider video', captions: ['en'] }
    expect(
      (await syncYouTubeVideo(store, { siteId: 'site-a', channelId: 'channel-a', video })).created,
    ).toBe(true)
    expect(
      await syncYouTubeVideo(store, { siteId: 'site-a', channelId: 'channel-a', video }),
    ).toMatchObject({ created: false, updated: false })
  })

  it('retains accessible transcript timing evidence', () => {
    expect(
      transcriptFromSegments([{ id: 'a', startSeconds: 0, endSeconds: 2, text: 'Caption.' }]).text,
    ).toBe('Caption.')
  })
})
