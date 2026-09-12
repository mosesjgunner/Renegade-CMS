import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  resolveTheme,
  resolveTemplate,
  validateManifest,
} from '../../src/modules/presentation/registry'
import { migratePresentation, renderPresentation } from '../../src/modules/presentation/document'
import { activateTheme, selectTheme } from '../../src/modules/presentation/selection'
import { puckVisualEditor } from '../../src/modules/presentation/puck-adapter'
import type { PresentationDocument, ThemeSelection } from '../../src/modules/presentation/contracts'
import { previewRecipe, renderLayout } from '../../src/modules/public/page-builder'

const theme = resolveTheme('neutral-starter')
const document = (): PresentationDocument => ({
  version: 1,
  siteId: 'site-a',
  theme: { id: theme.id, version: theme.version },
  template: { id: 'layout', version: '1.0.0' },
  surface: 'layout',
  slots: {
    main: [
      {
        id: 'hero',
        component: 'publisher.hero',
        componentVersion: 1,
        props: { title: 'A publication', body: '<script>untrusted</script>' },
      },
    ],
  },
})
const selection = (): ThemeSelection => ({
  version: 1,
  siteId: 'site-a',
  revision: 4,
  active: { id: theme.id, version: '1.0.0' },
  draft: { id: 'renegade-party', version: '1.0.0' },
  permittedOverrides: [],
})

describe('PRE-00 presentation boundary', () => {
  it('validates identity, version, compatibility, components, and fallback coverage', () => {
    expect(() => validateManifest(theme)).not.toThrow()
    expect(() => validateManifest({ ...theme, version: 'latest' })).toThrow('identity')
    expect(() => validateManifest({ ...theme, renegade: '^2.0.0' })).toThrow('compatibility')
    expect(() => validateManifest({ ...theme, componentRegistry: {} })).toThrow('Unknown component')
    expect(() =>
      validateManifest({ ...theme, fallbacks: { ...theme.fallbacks, page: 'absent' } }),
    ).toThrow('fallback')
  })
  it('falls back for unknown themes/templates and rejects incompatible content types', () => {
    expect(resolveTheme('__proto__').id).toBe('neutral-starter')
    expect(resolveTemplate(theme, 'page', 'missing').id).toBe('page')
    expect(resolveTemplate(theme, 'page', 'article').id).toBe('page')
  })
  it('renders deterministic safe HTML and preserves unknown component data', () => {
    const doc = document()
    doc.slots.main!.push({
      id: 'old',
      component: 'retired.hero',
      componentVersion: 99,
      props: { original: 'retained' },
    })
    const before = JSON.stringify(doc)
    const html = renderToStaticMarkup(renderPresentation(doc, theme))
    expect(html).toContain('A publication')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('data-unavailable-component="retired.hero"')
    expect(renderToStaticMarkup(renderPresentation(doc, theme))).toBe(html)
    expect(JSON.stringify(doc)).toBe(before)
  })
  it('keeps theme tokens/registries isolated and refuses cross-theme documents', () => {
    const party = resolveTheme('renegade-party')
    expect(party.componentRegistry).not.toBe(theme.componentRegistry)
    expect(party.tokens.color).not.toBe(theme.tokens.color)
    expect(() => {
      party.tokens.color.accent = '#123456'
    }).toThrow()
    expect(() => renderPresentation(document(), party)).toThrow('migration')
  })
  it('refuses implicit theme/template/component upgrades and keeps original bytes', () => {
    const doc = document()
    expect(() => migratePresentation(doc, { ...theme, version: '2.0.0' })).toThrow(
      'explicit migration',
    )
    const changed = { ...doc, template: { id: 'layout', version: '2.0.0' } }
    expect(() => renderPresentation(changed, theme)).toThrow('Template migration')
    doc.slots.main![0].componentVersion = 2
    expect(renderToStaticMarkup(renderPresentation(doc, theme))).toContain('unavailable')
  })
  it('keeps drafts private, enforces site/override scope, and atomically activates once', async () => {
    const current = selection()
    expect(selectTheme(current, { siteId: 'site-a' }).id).toBe(theme.id)
    expect(selectTheme(current, { siteId: 'site-a', preview: true }).id).toBe('renegade-party')
    expect(selectTheme(current, { siteId: 'site-a', override: current.draft }).id).toBe(theme.id)
    expect(() => selectTheme(current, { siteId: 'site-b' })).toThrow('scope')
    let revision = 4
    const store = {
      compareAndSwap: async (_site: string, expected: number, next: ThemeSelection) => {
        if (expected !== revision) return false
        revision = next.revision
        return true
      },
    }
    expect((await activateTheme(current, store)).active.id).toBe('renegade-party')
    await expect(activateTheme(current, store)).rejects.toThrow('conflict')
    expect(current.revision).toBe(4)
  })
  it('round trips replaceable editor data without losing hidden/version/unknown fields', () => {
    const doc = document()
    doc.slots.main![0].hidden = true
    doc.slots.main![0].componentVersion = 42
    doc.slots.aside = [{ id: 'opaque', component: 'future.card', componentVersion: 8, props: {} }]
    expect(puckVisualEditor.fromEditor(doc, puckVisualEditor.toEditor(doc))).toEqual(doc)
  })
  it('loads the existing starter layout through the manifest component registry', () => {
    expect(renderToStaticMarkup(renderLayout(previewRecipe('writer-blogger', 'site-a')))).toContain(
      'Make this space yours',
    )
  })
})
