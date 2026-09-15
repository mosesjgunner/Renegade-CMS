import { describe, expect, it } from 'vitest'

import { paletteFor, puckVisualEditor } from '../../src/modules/presentation/puck-adapter'
import { resolveTemplate, resolveTheme } from '../../src/modules/presentation/registry'
import type { PresentationDocument } from '../../src/modules/presentation/contracts'
import {
  applyLayoutAction,
  publishLayout,
  validateLayout,
  type PageLayout,
} from '../../src/modules/public/page-builder'

const page = (): PageLayout => ({
  version: 1,
  id: 'landing',
  siteId: 'site-1',
  path: '/landing',
  status: 'draft',
  themeId: 'neutral-starter',
  surface: 'page',
  slot: 'main',
  revision: 1,
  blocks: [
    'publisher.hero',
    'publisher.rich-content',
    'publisher.image',
    'publisher.feature-grid',
    'publisher.cta',
    'publisher.article-list',
  ].map((component, index) => ({
    id: `section-${index}`,
    component,
    componentVersion: 1,
    props: { title: `Section ${index}`, alignment: 'left', spacing: 'normal', variant: 'default' },
  })),
})

function document(layout = page()): PresentationDocument {
  return {
    version: 1,
    siteId: layout.siteId,
    theme: { id: layout.themeId, version: '1.0.0' },
    template: { id: 'layout', version: '1.0.0' },
    surface: 'layout',
    slots: { main: layout.blocks },
  }
}

describe('PRE-03 controlled visual editor', () => {
  it('builds a categorized, template-and-slot-limited palette from the active theme', () => {
    const palette = paletteFor(document())
    expect(palette.find((category) => category.label === 'Introduction')?.components).toContain(
      'publisher.hero',
    )
    const global = document({ ...page(), surface: 'global', slot: 'header' })
    global.slots = { header: [] }
    expect(
      paletteFor(global)
        .flatMap((category) => category.components)
        .sort(),
    ).toEqual(['publisher.cta', 'publisher.pattern', 'publisher.rich-content'])
  })

  it('round-trips reorder, duplicate, configure and remove operations without touching other slots', () => {
    const original = { ...document(), slots: { main: page().blocks, footer: [] } }
    const data = puckVisualEditor.toEditor(original)
    data.content = [
      { ...data.content[1], props: { ...data.content[1].props, title: 'Configured' } },
      { ...data.content[0], props: { ...data.content[0].props, id: 'duplicate' } },
    ]
    const updated = puckVisualEditor.fromEditor(original, data)
    expect(updated.slots.main?.map((block) => block.id)).toEqual(['section-1', 'duplicate'])
    expect(updated.slots.main?.[0].props.title).toBe('Configured')
    expect(updated.slots.footer).toEqual([])
  })

  it('rejects unsafe, oversized, unknown, invalid-token and cross-site-shaped props', () => {
    const base = page()
    for (const props of [
      { title: '<script>alert(1)</script>' },
      { title: 'x'.repeat(300) },
      { title: 'ok', alignment: 'sideways' },
      { title: 'ok', media: { id: 'm1', siteId: 'other', label: 'Other', href: '/media/x' } },
      { title: 'ok', nested: { component: 'publisher.cta' } },
    ]) {
      const result = validateLayout({ ...base, blocks: [{ ...base.blocks[0], props }] })
      expect(result.errors.length).toBeGreaterThan(0)
    }
    expect(validateLayout({ ...base, version: 0 as 1 }).errors).toContain(
      'Unsupported layout schema version.',
    )
    expect(
      validateLayout({
        ...base,
        blocks: [{ id: 'new', component: 'attacker.script', componentVersion: 1, props: {} }],
      }).errors[0],
    ).toContain('preserved')
  })

  it('supports session actions and immutable publication while article composition stays canonical', () => {
    let layout = page()
    layout = applyLayoutAction(layout, { type: 'move', id: 'section-5', to: 0 })
    layout = applyLayoutAction(layout, { type: 'duplicate', id: 'section-0', newId: 'hero-copy' })
    layout = applyLayoutAction(layout, { type: 'delete', id: 'hero-copy' })
    expect(publishLayout(layout, ['layout:publish']).publishedRevision).toBe(layout.revision)
    const article = resolveTemplate(resolveTheme('neutral-starter'), 'article', 'article')
    expect(article.slots.main?.allowedComponents).toEqual(['publisher.editorial'])
    expect(article.slots.main?.allowedComponents).not.toContain('publisher.rich-content')
  })
})
