import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  resolveTheme,
  resolveSurfaceTemplate,
  isSupportedSurface,
  supportedSurfaces,
  UnsupportedSurfaceGapError,
} from '../../src/modules/presentation/registry'
import { renderPresentation } from '../../src/modules/presentation/document'
import { PresentationSurface } from '../../src/modules/presentation/Surface'
import { TemplateInspector } from '../../src/modules/presentation/TemplateInspector'
import type {
  PresentationDocument,
  Surface,
  ThemeManifest,
} from '../../src/modules/presentation/contracts'

const theme = resolveTheme('neutral-starter')

describe('PRE2-00 Template Precedence, Deterministic Fallbacks & Surface Coverage', () => {
  describe('Documented Precedence Chain (entry_override > conditional_variant > type_template > site_default)', () => {
    it('resolves Tier 1: entry override when a valid template is specified by entry', () => {
      const resolution = resolveSurfaceTemplate({
        theme,
        surface: 'article',
        entryOverride: 'article-editorial',
        conditionalVariant: 'article',
        siteDefault: 'article',
      })

      expect(resolution.template.id).toBe('article-editorial')
      expect(resolution.level).toBe('entry_override')
      expect(resolution.selectedLevel).toBe('entry_override')
      expect(resolution.precedenceChain[0]).toEqual({
        level: 'entry_override',
        candidateId: 'article-editorial',
        status: 'selected',
        reason: 'Valid compatible entry override specified on record',
      })
    })

    it('resolves Tier 2: conditional variant when entry override is absent or invalid', () => {
      // With invalid override
      const withInvalidOverride = resolveSurfaceTemplate({
        theme,
        surface: 'video',
        entryOverride: 'non-existent-template-id',
        conditionalVariant: 'video-featured',
      })

      expect(withInvalidOverride.template.id).toBe('video-featured')
      expect(withInvalidOverride.level).toBe('conditional_variant')
      expect(withInvalidOverride.precedenceChain[0].status).toBe('miss')
      expect(withInvalidOverride.precedenceChain[0].reason).toContain('not found in theme')
      expect(withInvalidOverride.precedenceChain[1].status).toBe('selected')

      // With null override
      const withNullOverride = resolveSurfaceTemplate({
        theme,
        surface: 'podcast',
        entryOverride: null,
        conditionalVariant: 'podcast-compact',
      })
      expect(withNullOverride.template.id).toBe('podcast-compact')
      expect(withNullOverride.level).toBe('conditional_variant')
      expect(withNullOverride.precedenceChain[1].status).toBe('selected')
    })

    it('resolves Tier 3: type template when neither override nor variant are supplied', () => {
      const surfacesToTest: Surface[] = [
        'home',
        'page',
        'article',
        'profile',
        'archive',
        'book',
        'podcast',
        'podcast-episode',
        'video',
        'product',
        'event',
        'forum',
        'custom-page',
      ]

      for (const surface of surfacesToTest) {
        const resolution = resolveSurfaceTemplate({
          theme,
          surface,
        })
        expect(resolution.template).toBeDefined()
        expect(resolution.surface).toBe(surface)
        expect(resolution.template.contentTypes).toContain(surface)
        expect(resolution.level).toBe('type_template')
        expect(resolution.precedenceChain.find((s) => s.level === 'type_template')?.status).toBe(
          'selected',
        )
      }
    })

    it('resolves Tier 4: site default when type template is not directly matched', () => {
      // Construct a mock theme where a surface only has a site default fallback
      const mockTheme: ThemeManifest = {
        ...theme,
        id: 'test-precedence-fallback-theme',
        templateRegistry: {
          ...theme.templateRegistry,
          // Remove default article template, leaving only fallback
        },
      }
      delete (mockTheme.templateRegistry as Record<string, unknown>)['article']

      const resolution = resolveSurfaceTemplate({
        theme: mockTheme,
        surface: 'article',
        siteDefault: 'page',
      })

      expect(resolution.template.id).toBe('page')
      expect(resolution.level).toBe('site_default')
      expect(resolution.precedenceChain.find((s) => s.level === 'site_default')?.status).toBe(
        'selected',
      )
    })

    it('strictly throws UnsupportedSurfaceGapError for unsupported domains without fake templates', () => {
      expect(() =>
        resolveSurfaceTemplate({
          theme,
          surface: 'unsupported-domain' as Surface,
        }),
      ).toThrow(UnsupportedSurfaceGapError)

      try {
        resolveSurfaceTemplate({
          theme,
          surface: 'random-unknown' as Surface,
        })
      } catch (err) {
        expect(err).toBeInstanceOf(UnsupportedSurfaceGapError)
        expect((err as UnsupportedSurfaceGapError).code).toBe('UNSUPPORTED_SURFACE')
        expect((err as UnsupportedSurfaceGapError).surface).toBe('random-unknown')
      }
    })
  })

  describe('Deterministic Component Fallbacks', () => {
    it('produces data-unavailable-component and fallback reason when component is missing', () => {
      const doc: PresentationDocument = {
        version: 1,
        siteId: 'site-a',
        theme: { id: theme.id, version: theme.version },
        template: { id: 'page', version: '1.0.0' },
        surface: 'page',
        slots: {
          main: [
            {
              id: 'missing-block-1',
              component: 'nonexistent.widget',
              componentVersion: 1,
              props: { foo: 'bar' },
            },
          ],
        },
      }

      const html = renderToStaticMarkup(renderPresentation(doc, theme))
      expect(html).toContain('data-unavailable-component="nonexistent.widget"')
      expect(html).toContain('data-fallback-reason="missing_from_registry"')
      expect(html).toContain('This section is unavailable.')
    })

    it('produces deterministic fallback when component is incompatible with slot allowlist', () => {
      // publisher.hero is in registry, but 'page' template only allows ['publisher.editorial'] in 'main'
      const doc: PresentationDocument = {
        version: 1,
        siteId: 'site-a',
        theme: { id: theme.id, version: theme.version },
        template: { id: 'page', version: '1.0.0' },
        surface: 'page',
        slots: {
          main: [
            {
              id: 'incompatible-block-1',
              component: 'publisher.hero',
              componentVersion: 1,
              props: { title: 'Test' },
            },
          ],
        },
      }

      const html = renderToStaticMarkup(renderPresentation(doc, theme))
      expect(html).toContain('data-unavailable-component="publisher.hero"')
      expect(html).toContain('data-fallback-reason="incompatible_slot"')
      expect(html).toContain('data-fallback="deterministic"')
    })

    it('produces deterministic fallback when component version validation fails', () => {
      // publisher.editorial is allowed in 'page', but has version 999 instead of 1
      const doc: PresentationDocument = {
        version: 1,
        siteId: 'site-a',
        theme: { id: theme.id, version: theme.version },
        template: { id: 'page', version: '1.0.0' },
        surface: 'page',
        slots: {
          main: [
            {
              id: 'bad-version-1',
              component: 'publisher.editorial',
              componentVersion: 999, // unsupported version
              props: { article: {} },
            },
          ],
        },
      }

      const html = renderToStaticMarkup(renderPresentation(doc, theme))
      expect(html).toContain('data-unavailable-component="publisher.editorial"')
      expect(html).toContain('data-fallback-reason="incompatible_version"')
    })

    it('executes custom fallback handler when component definition provides one', () => {
      const customTheme: ThemeManifest = {
        ...theme,
        id: 'theme-with-custom-fallback',
        componentRegistry: {
          ...theme.componentRegistry,
          'custom.failing': {
            id: 'custom.failing',
            version: 1,
            label: 'Custom failing',
            category: 'test',
            permissions: ['layout:edit'],
            capabilities: [],
            fields: {},
            validate: () => ['always fails validation'],
            fallback: (block) => (
              <div data-testid="custom-graceful-fallback">Graceful fallback for {block.id}</div>
            ),
            render: () => <div>Normal render</div>,
          },
        },
      }

      const doc: PresentationDocument = {
        version: 1,
        siteId: 'site-a',
        theme: { id: customTheme.id, version: customTheme.version },
        template: { id: 'page', version: '1.0.0' },
        surface: 'page',
        slots: {
          main: [
            {
              id: 'custom-block-fail',
              component: 'custom.failing',
              componentVersion: 1,
              props: {},
            },
          ],
        },
      }

      const html = renderToStaticMarkup(renderPresentation(doc, customTheme))
      expect(html).toContain('data-testid="custom-graceful-fallback"')
      expect(html).toContain('Graceful fallback for custom-block-fail')
    })
  })

  describe('TemplateInspector UI', () => {
    it('renders inspector metadata, active template ID, resolved level, and precedence chain', () => {
      const resolution = resolveSurfaceTemplate({
        theme,
        surface: 'video',
        conditionalVariant: 'video-featured',
      })

      const html = renderToStaticMarkup(<TemplateInspector resolution={resolution} />)

      expect(html).toContain('data-testid="template-inspector"')
      expect(html).toContain('data-template-id="video-featured"')
      expect(html).toContain('data-template-surface="video"')
      expect(html).toContain('data-template-level="conditional_variant"')
      expect(html).toContain('Template Inspector:')
      expect(html).toContain('video-featured')
      expect(html).toContain('conditional variant')
      expect(html).toContain('Chain:')
    })

    it('renders component fallback warnings if components fail', () => {
      const resolution = resolveSurfaceTemplate({
        theme,
        surface: 'podcast',
      })
      const resolutionWithFallbacks = {
        ...resolution,
        componentFallbacks: [
          {
            slot: 'main',
            component: 'media.audio',
            reason: 'missing-component',
          },
        ],
      }

      const html = renderToStaticMarkup(<TemplateInspector resolution={resolutionWithFallbacks} />)

      expect(html).toContain('data-fallback-count="1"')
      expect(html).toContain('Component Fallbacks Active')
      expect(html).toContain('media.audio')
      expect(html).toContain('missing-component')
    })
  })

  describe('PresentationSurface Component and Surface Coverage', () => {
    it('renders supported surface with children and template inspector', () => {
      const html = renderToStaticMarkup(
        <PresentationSurface surface="event" themeId="neutral-starter">
          <div data-testid="event-content">Event Details Body</div>
        </PresentationSurface>,
      )

      expect(html).toContain('data-surface-container="event"')
      expect(html).toContain('data-testid="event-content"')
      expect(html).toContain('data-testid="template-inspector"')
      expect(html).toContain('data-template-id="event"')
      expect(html).toContain('data-template-level="type_template"')
    })

    it('derives entryOverride and conditionalVariant from record properties', () => {
      const record = {
        id: 'rec-1',
        title: 'Editorial Story',
        templateVariant: 'article-editorial',
      }

      const html = renderToStaticMarkup(
        <PresentationSurface surface="article" record={record} themeId="neutral-starter">
          <div>Article Content</div>
        </PresentationSurface>,
      )

      expect(html).toContain('data-template-id="article-editorial"')
      expect(html).toContain('data-template-level="conditional_variant"')
    })

    it('renders explicit domain gap when an unsupported domain is passed', () => {
      const html = renderToStaticMarkup(
        <PresentationSurface
          surface={'unsupported-domain-xyz' as Surface}
          themeId="neutral-starter"
        >
          <div>Should not render</div>
        </PresentationSurface>,
      )

      expect(html).toContain('data-testid="unsupported-domain-gap"')
      expect(html).toContain('data-presentation-gap="unsupported-domain"')
      expect(html).toContain('data-surface="unsupported-domain-xyz"')
      expect(html).toContain('Explicit Domain Gap: Unsupported Domain')
      expect(html).toContain('unsupported-domain-xyz')
      expect(html).not.toContain('Should not render')
    })

    it('verifies all 16 PRE2-00 surfaces are recognized in supportedSurfaces inventory', () => {
      const inventory: Surface[] = [
        'page',
        'article',
        'home',
        'archive',
        'search',
        '404',
        'layout',
        'profile',
        'book',
        'podcast',
        'podcast-episode',
        'video',
        'product',
        'event',
        'forum',
        'custom-page',
      ]

      for (const surface of inventory) {
        expect(isSupportedSurface(surface)).toBe(true)
        expect(supportedSurfaces.includes(surface)).toBe(true)
      }

      expect(isSupportedSurface('fake-domain')).toBe(false)
      expect(isSupportedSurface('inventory-gap')).toBe(false)
    })
  })
})
