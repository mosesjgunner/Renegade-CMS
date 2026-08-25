import { describe, expect, it } from 'vitest'
import {
  applyLayoutAction,
  canRenderLayout,
  componentRegistry,
  installRecipe,
  migrateLayout,
  previewRecipe,
  publishLayout,
  registerDeveloperComponent,
  validateLayout,
} from '../../src/modules/public/page-builder'

describe('portable page builder', () => {
  it('edits, reorders, duplicates, hides, deletes/undoes, previews and publishes a starter layout', () => {
    let page = previewRecipe('writer-blogger', 'site-1')
    page = applyLayoutAction(page, {
      type: 'edit',
      id: 'writer-blogger-1',
      props: { title: 'A useful publication' },
    })
    page = applyLayoutAction(page, { type: 'duplicate', id: 'writer-blogger-1', newId: 'hero-2' })
    page = applyLayoutAction(page, { type: 'move', id: 'hero-2', to: 0 })
    page = applyLayoutAction(page, { type: 'toggle-hidden', id: 'hero-2' })
    const deleted = page.blocks.find((block) => block.id === 'hero-2')!
    page = applyLayoutAction(page, { type: 'delete', id: 'hero-2' })
    page = applyLayoutAction(page, { type: 'undo-delete', block: deleted, at: 0 })
    expect(page.blocks[0].props.title).toBe('A useful publication')
    expect(() => publishLayout(page, ['layout:edit'])).toThrow('Publish permission')
    page = publishLayout(page, ['layout:edit', 'layout:publish'])
    expect(canRenderLayout(page, { visibility: 'public', status: 'published' })).toBe(true)
  })
  it('renders the same structured layout through both themes and preserves removed components', () => {
    const page = previewRecipe('organization', 'site-1')
    expect(migrateLayout({ ...page, themeId: 'neutral-starter' }).blocks).toHaveLength(
      page.blocks.length,
    )
    const unavailable = {
      ...page,
      blocks: [{ id: 'old', component: 'retired.banner', componentVersion: 1, props: {} }],
    }
    const checked = validateLayout(unavailable)
    expect(checked.layout.unknownBlocks).toHaveLength(1)
    expect(checked.errors[0]).toContain('preserved')
  })
  it('uses guided placeholders and safe, idempotent starter installation', () => {
    const page = installRecipe(undefined, 'photographer-portfolio', 'site-1')
    expect(() => installRecipe(page, 'photographer-portfolio', 'site-1')).toThrow('already exists')
    expect(page.blocks[0].placeholder?.actions).toContain('media-browse')
    const replaced = applyLayoutAction(page, {
      type: 'replace-placeholder',
      id: page.blocks[0].id,
      mediaId: 'media-1',
    })
    expect(replaced.blocks[0].placeholder).toBeUndefined()
    expect(componentRegistry['publisher.custom-embed'].fields.url).toBe('text')
    expect(() => registerDeveloperComponent(componentRegistry['publisher.hero'], [])).toThrow(
      'permission',
    )
  })
})
