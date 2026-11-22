import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  emptyPortfolio,
  portfolioEmbed,
  portfolioMediaIds,
} from '../../src/modules/creator-studio/portfolio-contract'
import { parsePortfolio } from '../../src/modules/creator-studio/portfolio-validation'

describe('creator portfolio snapshots', () => {
  it('preserves block order, captions and media identities across reserialization', () => {
    const cover = randomUUID()
    const image = randomUUID()
    const section = randomUUID()
    const input = {
      ...emptyPortfolio(),
      title: 'City at dusk',
      cover,
      layout: 'masonry',
      sections: [
        {
          id: section,
          title: 'Industrial district',
          blocks: [
            { id: randomUUID(), kind: 'text', text: 'Site notes' },
            {
              id: randomUUID(),
              kind: 'image',
              media: image,
              alt: 'Sunset over a factory',
              caption: 'West elevation',
              credit: 'Creator',
              rights: 'Licensed',
            },
            { id: randomUUID(), kind: 'image', media: cover },
          ],
        },
      ],
    }
    const parsed = parsePortfolio(input)
    expect(parsePortfolio(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed)
    expect(parsed.sections[0]?.blocks.map(({ kind, media }) => [kind, media])).toEqual([
      ['text', ''],
      ['image', image],
      ['image', cover],
    ])
    expect(portfolioMediaIds(parsed)).toEqual([cover, image])
  })

  it('normalizes approved embed links and rejects unrelated origins and active URL schemes', () => {
    expect(portfolioEmbed('https://youtu.be/aqz-KE-bpKQ?si=ignored')).toEqual({
      frame: 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
      link: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    })
    expect(portfolioEmbed('https://player.vimeo.com/video/123456')).toEqual({
      frame: 'https://player.vimeo.com/video/123456',
      link: 'https://vimeo.com/123456',
    })
    for (const url of [
      'https://www.youtube.com.example.org/watch?v=aqz-KE-bpKQ',
      'https://www.youtube.com@evil.example/watch?v=aqz-KE-bpKQ',
      'https://player.vimeo.com:8080/video/123456',
      'javascript:alert(1)',
    ])
      expect(portfolioEmbed(url)).toBeNull()
  })

  it('rejects ambiguous reorder keys, malformed dates and non-library media values', () => {
    const id = randomUUID()
    expect(() =>
      parsePortfolio({ title: 'Invalid', sections: [{ id, blocks: [{ id, kind: 'text' }] }] }),
    ).toThrow('distinct identifiers')
    expect(() => parsePortfolio({ title: 'Invalid', startsOn: '2026-02-30' })).toThrow(
      'calendar date',
    )
    expect(() => parsePortfolio({ title: 'Invalid', cover: 'https://example.test/photo' })).toThrow(
      'library reference',
    )
  })
})
