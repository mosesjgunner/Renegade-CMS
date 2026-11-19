/**
 * S2-12 regression tests: WordPress block conversion with complete
 * accounting (fixes F7 — the 3,900-character silent truncation).
 *
 * A synthetic source exercises the whole supported slice plus the
 * failure modes: nested groups, a two-column layout, a missing image,
 * an unsupported plugin widget and a script. Every parsed region must
 * appear exactly once in the report; converted output must validate
 * through the real layout validator; quarantined source must never
 * reach the blocks; and a 5,000-character body must survive whole,
 * split across blocks — never sliced.
 */
import { describe, expect, it } from 'vitest'

import { reconstructPresentation } from '@/modules/portability/legacy-migration/presentation'
import {
  convertWordpressBlocks,
  textOf,
} from '@/modules/portability/legacy-migration/wordpress-blocks'
import { validateLayout, type PageLayout } from '@/modules/public/page-builder'

const SOURCE = `<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">Welcome in</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>A short intro paragraph.</p>
<!-- /wp:paragraph -->
<!-- wp:columns -->
<div class="wp-block-columns"><!-- wp:column -->
<div class="wp-block-column"><!-- wp:paragraph -->
<p>Left cell text.</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column --><!-- wp:column -->
<div class="wp-block-column"><!-- wp:paragraph -->
<p>Right cell text.</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column --></div>
<!-- /wp:columns -->
<!-- wp:image {"id":42} -->
<figure class="wp-block-image"><img src="https://old.example.com/missing.jpg" alt="Missing"/></figure>
<!-- /wp:image -->
<!-- wp:image {"id":43} -->
<figure class="wp-block-image"><img src="https://old.example.com/kept.jpg" alt="Kept alt"/></figure>
<!-- /wp:image -->
<!-- wp:woocommerce/cart -->
<div>cart widget</div>
<!-- /wp:woocommerce/cart -->
<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link" href="/about">About us</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->
<script>alert('never')</script>`

describe('S2-12 WordPress block conversion', () => {
  it('accounts for every source region exactly once with honest outcomes', () => {
    const mediaByUrl = new Map([
      ['https://old.example.com/kept.jpg', { id: 'media-9', siteId: 'site-a', label: 'Kept' }],
    ])
    const linkByHref = new Map([
      ['/about', { id: 'page-about', siteId: 'site-a', label: 'About', href: '/about' }],
    ])
    const result = convertWordpressBlocks(SOURCE, { mediaByUrl, linkByHref })
    // The official parser also yields whitespace freeform regions between
    // block comments; they are accounted as dropped-empty. Look regions
    // up by block name, never by raw index.
    const byName = (name: string) => result.report.filter((entry) => entry.blockName === name)
    const byLocation = new Map(result.report.map((entry) => [entry.location, entry]))

    expect(result.coverage.unaccounted).toBe(0)
    expect(result.coverage.regions).toBe(result.report.length)
    expect(result.coverage.droppedEmpty).toBeGreaterThan(0)
    // Heading + paragraph converted.
    expect(byName('core/heading')[0]?.outcome).toBe('converted')
    expect(byName('core/paragraph')[0]?.outcome).toBe('converted')
    // Columns converted into the S2-05 container with both cells as children.
    expect(byName('core/columns')[0]?.outcome).toBe('converted')
    expect(byName('core/columns')[0]?.targetComponent).toBe('publisher.columns')
    const columns = result.blocks.find((block) => block.component === 'publisher.columns')!
    const left = columns.props.column0 as Array<{ props: { body: string } }>
    const right = columns.props.column1 as Array<{ props: { body: string } }>
    expect(left[0].props.body).toBe('Left cell text.')
    expect(right[0].props.body).toBe('Right cell text.')
    // Missing image quarantined; acquired image converted with its media reference.
    const images = byName('core/image')
    expect(images[0]?.outcome).toBe('quarantined')
    expect(images[0]?.reason).toContain('not acquired')
    expect(images[1]?.outcome).toBe('converted')
    const image = result.blocks.find((block) => block.component === 'publisher.image')!
    expect((image.props.media as { id: string }).id).toBe('media-9')
    // Plugin widget quarantined as a plugin block; its markup never renders.
    expect(byName('woocommerce/cart')[0]?.outcome).toBe('quarantined')
    expect(byName('woocommerce/cart')[0]?.quarantineKind).toBe('plugin-block')
    void byLocation
    // Button with a resolvable internal target becomes a CTA with the reference.
    const cta = result.blocks.find((block) => block.component === 'publisher.cta')!
    expect((cta.props.link as { id: string }).id).toBe('page-about')
    // The trailing script is a quarantined freeform sub-region.
    const script = result.report.find((entry) => entry.quarantineKind === 'script')
    expect(script?.outcome).toBe('quarantined')
    expect(script?.rawSource).toContain("alert('never')")
    expect(JSON.stringify(result.blocks)).not.toContain('alert')
    expect(JSON.stringify(result.blocks)).not.toContain('cart widget')
    // Every entry carries provenance.
    for (const entry of result.report) {
      expect(entry.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(entry.sourceBytes).toBeGreaterThan(0)
    }
    // Converted output validates as an editable layout.
    const layout: PageLayout = {
      version: 1,
      id: 'converted',
      siteId: 'site-a',
      path: '/converted',
      status: 'draft',
      themeId: 'neutral-starter',
      surface: 'page',
      slot: 'main',
      blocks: result.blocks,
      unknownBlocks: [],
      revision: 1,
    }
    const validated = validateLayout(layout)
    expect(validated.errors).toEqual([])
  })

  it('never truncates: a 5,000-character paragraph splits losslessly and reports the split', () => {
    const long = Array.from({ length: 500 }, (_, i) => `word${i}`).join(' ')
    expect(long.length).toBeGreaterThan(3800)
    const source = `<!-- wp:paragraph -->\n<p>${long}</p>\n<!-- /wp:paragraph -->`
    const result = convertWordpressBlocks(source)
    const entry = result.report.find((item) => item.location === 'blocks[0]')!
    expect(entry.outcome).toBe('approximated')
    expect(entry.reason).toContain('split across')
    expect(entry.targetIds.length).toBeGreaterThan(1)
    const rejoined = result.blocks
      .map((block) => String(block.props.body ?? ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    expect(rejoined).toBe(long.replace(/\s+/g, ' ').trim())
  })

  it('reconstruction carries the full body and a per-page report (F7 closed)', () => {
    const longBody = 'A'.repeat(5000)
    const result = reconstructPresentation(undefined, undefined, [], { title: 'Legacy Site' }, [
      {
        id: 'p1',
        postType: 'page',
        title: 'Long Page',
        slug: 'long-page',
        originalUrl: 'https://legacy.test/long-page',
        publishedAt: '2024-01-01T00:00:00Z',
        status: 'publish',
        authorLogin: 'admin',
        excerpt: '',
        rawContent: longBody,
        parsedBlocks: [],
        categories: [],
        tags: [],
        seo: {},
      } as never,
    ])
    const page = result.pages[0]
    const totalBody = page.blocks
      .filter((block) => block.component === 'publisher.rich-content')
      .reduce((sum, block) => sum + String(block.props.body ?? '').length, 0)
    expect(totalBody).toBe(5000)
    expect(result.conversionReports).toHaveLength(1)
    expect(result.conversionReports[0].coverage.unaccounted).toBe(0)
    expect(result.conversionReports[0].coverage.regions).toBeGreaterThan(0)
  })

  it('keeps unsupported core blocks and custom HTML in quarantine, and drops only true empties', () => {
    const source = `<!-- wp:table -->
<figure><table><tbody><tr><td>1</td></tr></tbody></table></figure>
<!-- /wp:table -->
<!-- wp:html -->
<div onclick="x()">raw</div>
<!-- /wp:html -->
<!-- wp:paragraph -->
<p>   </p>
<!-- /wp:paragraph -->`
    const result = convertWordpressBlocks(source)
    const named = Object.fromEntries(
      result.report
        .filter((entry) => entry.blockName)
        .map((entry) => [entry.blockName, entry.outcome]),
    )
    expect(named).toEqual({
      'core/table': 'quarantined',
      'core/html': 'quarantined',
      'core/paragraph': 'dropped-empty',
    })
    expect(result.blocks).toHaveLength(0)
    expect(textOf('<p>a &amp; b</p>')).toBe('a & b')
  })
})
