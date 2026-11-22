/**
 * RC3-18 — pure-function units for the two new media-desk services:
 * the graphics overlay renderer (deterministic SVG, XML-safe) and the
 * interview quote-selection rule (length threshold, order, cap).
 * The service journeys themselves are proven in
 * tests/integration/rc318-media-desk.integration.test.ts.
 */
import { describe, expect, it } from 'vitest'

import { graphicOverlaySvg } from '../../src/modules/graphics/render'
import { selectInterviewQuotes } from '../../src/modules/media/interviews'
import type { TranscriptSegment } from '../../src/modules/media/contracts'

const svgText = (input: { width: number; height: number; text: string }) =>
  graphicOverlaySvg(input).toString('utf8')

describe('graphicOverlaySvg', () => {
  it('renders a lower-third band with the text at the recipe canvas size', () => {
    const svg = svgText({ width: 1200, height: 630, text: 'Renegade RC318' })
    expect(svg).toContain('width="1200"')
    expect(svg).toContain('height="630"')
    expect(svg).toContain('Renegade RC318')
    // The band rect sits in the lower part of the canvas.
    const bandY = Number(svg.match(/<rect x="0" y="(\d+)"/)?.[1])
    expect(bandY).toBeGreaterThan(630 / 2)
    expect(bandY).toBeLessThan(630)
  })

  it('XML-escapes overlay text so markup cannot break out of the SVG', () => {
    const svg = svgText({ width: 800, height: 450, text: 'A & B <script> "x"' })
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('A &amp; B &lt;script&gt; &quot;x&quot;')
  })

  it('wraps long text to at most three lines and truncates the rest', () => {
    const words = Array.from({ length: 60 }, (_, index) => `word${index}`).join(' ')
    const svg = svgText({ width: 1200, height: 630, text: words })
    const tspans = svg.match(/<tspan/g) ?? []
    expect(tspans.length).toBeLessThanOrEqual(3)
    expect(svg).toContain('…')
  })

  it('renders an empty band when the text is blank', () => {
    const svg = svgText({ width: 1200, height: 630, text: '   ' })
    expect(svg).toContain('<svg')
    expect(svg).toContain('<rect')
  })
})

describe('selectInterviewQuotes', () => {
  const segment = (id: string, text: string, speaker = 'Guest'): TranscriptSegment => ({
    id,
    startSeconds: 0,
    endSeconds: 5,
    speaker,
    text,
  })
  const longText =
    'This answer runs long enough to carry a pull quote for the interview page and the export.'

  it('keeps only segments at or over the length threshold, in order', () => {
    const quotes = selectInterviewQuotes([
      segment('a', 'Too short.'),
      segment('b', longText),
      segment('c', 'Also short.'),
      segment('d', longText),
    ])
    expect(quotes.map((quote) => quote.segmentId)).toEqual(['b', 'd'])
    expect(quotes[0]).toMatchObject({ speaker: 'Guest', startSeconds: 0, endSeconds: 5 })
  })

  it('caps the selection at eight quotes', () => {
    const many = Array.from({ length: 12 }, (_, index) => segment(`s${index}`, longText))
    expect(selectInterviewQuotes(many)).toHaveLength(8)
  })

  it('returns an empty list when nothing qualifies', () => {
    expect(selectInterviewQuotes([segment('a', 'Short.')])).toEqual([])
  })
})
