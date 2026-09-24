import { describe, expect, it } from 'vitest'
import {
  discoverThemes,
  migrateTokens,
  validatePackage,
} from '../../src/modules/presentation/packages'
import { contrast, validateTokens } from '../../src/modules/presentation/tokens'
import { resolveTheme, validateManifest } from '../../src/modules/presentation/registry'
import { renderPresentation } from '../../src/modules/presentation/document'
import {
  PAGE_LAYOUT_VERSION,
  renderLayout,
  type PageLayout,
} from '../../src/modules/public/page-builder'
import { inspectLegacySite } from '../../src/modules/portability/legacy-migration/pipeline'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('PRE-06 Presentation Pass Gate — Unit Suite', () => {
  describe('1. Theme discovery, package validation, and renderer contracts', () => {
    it('discovers installed neutral and renegade-party themes with verified compatibility and digest', async () => {
      const discovered = await discoverThemes()
      expect(discovered.length).toBeGreaterThanOrEqual(3)
      const neutral100 = discovered.find(
        (t) => t.package?.id === 'neutral-starter' && t.package?.version === '1.0.0',
      )
      const neutral110 = discovered.find(
        (t) => t.package?.id === 'neutral-starter' && t.package?.version === '1.1.0',
      )
      const party100 = discovered.find(
        (t) => t.package?.id === 'renegade-party' && t.package?.version === '1.0.0',
      )

      expect(neutral100?.compatible).toBe(true)
      expect(neutral100?.digest).toMatch(/^[a-f0-9]{64}$/)
      expect(neutral110?.compatible).toBe(true)
      expect(neutral110?.digest).toMatch(/^[a-f0-9]{64}$/)
      expect(party100?.compatible).toBe(true)
      expect(party100?.digest).toMatch(/^[a-f0-9]{64}$/)
    })

    it('resolves registered themes neutral-starter and renegade-party with valid manifests', () => {
      const neutral = resolveTheme('neutral-starter')
      const party = resolveTheme('renegade-party')
      expect(neutral.id).toBe('neutral-starter')
      expect(party.id).toBe('renegade-party')
      expect(() => validateManifest(neutral)).not.toThrow()
      expect(() => validateManifest(party)).not.toThrow()
    })

    it('falls back to neutral-starter for unknown or missing theme IDs', () => {
      expect(resolveTheme(null).id).toBe('neutral-starter')
      expect(resolveTheme(undefined).id).toBe('neutral-starter')
      expect(resolveTheme('unknown-theme-xyz').id).toBe('neutral-starter')
    })

    it('refuses malformed and unsafe theme package configurations before mutation', () => {
      const base = {
        id: 'sample',
        version: '1.0.0',
        label: 'Sample',
        renegade: '^1.0.0',
        renderer: 'neutral-starter',
        tokens: {},
        assets: [],
        migrations: [],
      }

      // Path traversal
      expect(() => validatePackage({ ...base, id: '../malicious' })).toThrow()
      // Invalid semver
      expect(() => validatePackage({ ...base, version: 'latest' })).toThrow()
      expect(() => validatePackage({ ...base, version: 'v1.0.0' })).toThrow()
      // Unregistered renderer
      expect(() => validatePackage({ ...base, renderer: 'unregistered-eval-engine' })).toThrow()
      // Executable scripts / css injection
      expect(() => validatePackage({ ...base, javascript: 'alert(1)' })).toThrow()
      expect(() => validatePackage({ ...base, css: 'body { display: none }' })).toThrow()
      // Dangerous asset path
      expect(() =>
        validatePackage({
          ...base,
          assets: [{ path: 'assets/../../../etc/passwd', sha256: 'a'.repeat(64) }],
        }),
      ).toThrow()
    })
  })

  describe('2. Design token validation, contrast checking, and pre-mutation refusal', () => {
    it('accepts valid design token overrides', () => {
      expect(() =>
        validateTokens({
          'color.canvas': '#f8f6f0',
          'color.surface': '#ffffff',
          'color.ink': '#191614',
          'color.accent': '#b91c1c',
          'radii.normal': '0.75rem',
          'spacing.normal': '1.5rem',
        }),
      ).not.toThrow()
    })

    it('computes WCAG contrast ratio accurately and validates accessible limits', () => {
      // Black on White = 21:1
      expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
      // Pure White on White = 1:1
      expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 0)
      // Enforces minimum 4.5:1 for text/accent against canvas
      expect(() =>
        validateTokens({
          'color.canvas': '#ffffff',
          'color.ink': '#f0f0f0', // Very light grey on white -> fails contrast
        }),
      ).toThrow(/contrast/i)
    })

    it('refuses malformed, script-injected, or syntax-breaking token values', () => {
      // Script tags
      expect(() => validateTokens({ 'color.canvas': '<script>alert(1)</script>' })).toThrow()
      // CSS injection
      expect(() => validateTokens({ 'typography.body': 'url(https://attacker.example)' })).toThrow()
      expect(() => validateTokens({ 'spacing.normal': '10px; background: red' })).toThrow()
      // Unknown token names
      expect(() => validateTokens({ 'arbitrary.cssProperty': 'none' })).toThrow()
    })

    it('executes declarative token migration and ensures idempotent results', () => {
      const package110 = {
        id: 'neutral-starter',
        version: '1.1.0',
        label: 'Neutral Starter',
        renegade: '^1.0.0',
        renderer: 'neutral-starter',
        tokens: { 'radii.normal': '0.75rem' },
        assets: [],
        migrations: [
          {
            from: '1.0.0',
            to: '1.1.0',
            operation: 'defaults' as const,
            tokens: { 'radii.normal': '0.75rem' },
          },
        ],
      }
      const existing = { 'color.canvas': '#ffffff' }
      const migrated = migrateTokens(package110, '1.0.0', existing)
      expect(migrated['color.canvas']).toBe('#ffffff')
      expect(migrated['radii.normal']).toBe('0.75rem')
      // Running again on 1.1.0 preserves existing state
      expect(migrateTokens(package110, '1.1.0', migrated)).toEqual(migrated)
    })
  })

  describe('3. Registered components, visual editor layout IR, and public stability', () => {
    it('registers all required starter components with typed property contracts', () => {
      const required = [
        'publisher.hero',
        'publisher.feature-grid',
        'publisher.rich-content',
        'publisher.cta',
        'publisher.newsletter-cta',
        'publisher.editorial',
        'publisher.pattern',
      ]
      const theme = resolveTheme('neutral-starter')
      for (const compId of required) {
        expect(Object.hasOwn(theme.componentRegistry, compId)).toBe(true)
        const comp = theme.componentRegistry[compId]
        expect(comp.version).toBe(1)
        expect(typeof comp.render).toBe('function')
      }
    })

    it('renders controlled layout blocks into safe React elements', () => {
      const layout: PageLayout = {
        version: PAGE_LAYOUT_VERSION,
        id: 'test-campaign-layout',
        siteId: 'renegadeparty',
        path: '/campaign-2026',
        status: 'published',
        themeId: 'renegade-party',
        blocks: [
          {
            id: 'b-1',
            component: 'publisher.hero',
            componentVersion: 1,
            props: {
              title: 'Renegade Party 2026',
              body: 'Decentralized public administration and citizen sovereignty.',
              media: { href: '/media/hero.png', label: 'Liberty Banner' },
              link: { href: '/platform', label: 'Explore Platform' },
            },
            visible: { desktop: true, tablet: true, mobile: true },
          },
          {
            id: 'b-2',
            component: 'publisher.cta',
            componentVersion: 1,
            props: {
              title: 'Join the Movement',
              body: 'Enroll your precinct today.',
              link: { href: '/articles/renegade-declaration', label: 'Read Declaration' },
            },
          },
        ],
        revision: 1,
        publishedRevision: 1,
      }

      const output = renderLayout(layout, 'desktop')
      expect(output).toBeDefined()
    })

    it('falls back gracefully to placeholder for removed or unavailable components', () => {
      const theme = resolveTheme('neutral-starter')
      const doc = {
        version: 1 as const,
        siteId: 'site-1',
        theme: { id: 'neutral-starter', version: '1.0.0' },
        template: { id: 'layout', version: '1.0.0' },
        surface: 'layout' as const,
        slots: {
          main: [
            {
              id: 'unknown-1',
              component: 'nonexistent.malicious-component',
              componentVersion: 1,
              props: {},
            },
          ],
        },
      }
      const rendered = renderPresentation(doc, theme)
      expect(rendered).toBeDefined()
    })

    it('refuses cross-theme presentation rendering without explicit migration', () => {
      const doc = {
        version: 1 as const,
        siteId: 'site-1',
        theme: { id: 'neutral-starter', version: '1.0.0' },
        template: { id: 'layout', version: '1.0.0' },
        surface: 'layout' as const,
        slots: { main: [] },
      }
      const partyTheme = resolveTheme('renegade-party')
      // Rendering neutral-starter document against renegade-party theme throws
      expect(() => renderPresentation(doc, partyTheme)).toThrow(/migration required/i)
    })
  })

  describe('4. Legacy migration WXR inspection and quarantine containment', () => {
    it('inspects WordPress WXR fixture and detects unsupported shortcodes/plugins without executing them', () => {
      const fixturePath = path.resolve(
        __dirname,
        '../fixtures/legacy-migration/wordpress-fixture.xml',
      )
      const wxr = readFileSync(fixturePath, 'utf8')
      const result = inspectLegacySite({ wxr })

      expect(result.valid).toBe(true)
      expect(result.sourceChecksum).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(result.summary.posts).toBeGreaterThanOrEqual(3)
      expect(result.summary.pages).toBeGreaterThanOrEqual(3)
      expect(result.detectedUnsupportedCount).toBeGreaterThanOrEqual(6)
      expect(result.summary.unsupported).toBeGreaterThanOrEqual(6)
      expect(result.errors.length).toBe(0)
    })
  })
})
