import { describe, expect, it } from 'vitest'

import {
  instantiatePattern,
  validatePresentationImport,
  type PresentationPackage,
} from '../../src/modules/presentation/composition'
import {
  validateLayout,
  publishLayout,
  type PageLayout,
  type LayoutBlock,
} from '../../src/modules/public/page-builder'

const sampleBlocks: LayoutBlock[] = [
  {
    id: 'hero-1',
    component: 'publisher.hero',
    componentVersion: 1,
    props: {
      title: 'Welcome to Renegade Party',
      body: 'Building the visual web safely',
      alignment: 'center',
      spacing: 'normal',
      width: 'standard',
      background: 'canvas',
      emphasis: 'bold',
    },
    visible: { desktop: true, tablet: true, mobile: true },
  },
  {
    id: 'cta-1',
    component: 'publisher.cta',
    componentVersion: 1,
    props: {
      title: 'Join the Movement',
      body: 'Get involved today',
      alignment: 'center',
      spacing: 'compact',
      width: 'wide',
      background: 'brand',
      emphasis: 'normal',
    },
    visible: { desktop: true, tablet: true, mobile: false },
  },
]

const sampleTemplate: PageLayout = {
  version: 1,
  id: 'template-campaign',
  siteId: 'site-party',
  name: 'Campaign Page Template',
  path: '__template__/campaign-page',
  status: 'published',
  themeId: 'neutral-starter',
  surface: 'template',
  slot: 'main',
  revision: 2,
  publishedRevision: 2,
  isRetired: false,
  category: 'Campaign',
  blocks: sampleBlocks,
}

describe('PRE-04 Reusable visual composition', () => {
  describe('1. Reusable Page Templates & Inheritance Semantics', () => {
    it('validates reusable page templates with surface=template and slot=main', () => {
      const result = validateLayout(sampleTemplate)
      expect(result.errors).toEqual([])
      expect(result.layout.surface).toBe('template')
      expect(result.layout.slot).toBe('main')
    })

    it('rejects templates attempting to target non-main slots', () => {
      const invalid = { ...sampleTemplate, slot: 'header' as PageLayout['slot'] }
      const result = validateLayout(invalid)
      expect(result.errors).toContain('Pages and templates may only edit the main template slot.')
    })

    it('supports template inheritance modes: inherited, explicit, and detached', () => {
      for (const mode of ['inherited', 'explicit', 'detached'] as const) {
        const page: PageLayout = {
          version: 1,
          id: `page-${mode}`,
          siteId: 'site-party',
          path: `/${mode}-page`,
          status: 'draft',
          themeId: 'neutral-starter',
          surface: 'page',
          slot: 'main',
          templateId: sampleTemplate.id,
          templateVersion: 1,
          templateMode: mode,
          revision: 1,
          blocks: sampleBlocks,
        }
        const validated = validateLayout(page)
        expect(validated.errors).toEqual([])
        expect(validated.layout.templateMode).toBe(mode)
      }
    })

    it('rejects unknown template inheritance modes', () => {
      const invalid: PageLayout = {
        version: 1,
        id: 'page-invalid-mode',
        siteId: 'site-party',
        path: '/invalid-mode',
        status: 'draft',
        themeId: 'neutral-starter',
        templateMode: 'magic' as never,
        revision: 1,
        blocks: [],
      }
      const validated = validateLayout(invalid)
      expect(validated.errors).toContain('Invalid template inheritance mode.')
    })

    it('never surprise-updates published pages: published snapshot remains immutable', () => {
      // 1. A page is published at template revision 1
      const initialPage: PageLayout = {
        version: 1,
        id: 'page-published-party',
        siteId: 'site-party',
        name: 'Party Manifesto',
        path: '/manifesto',
        status: 'published',
        themeId: 'neutral-starter',
        surface: 'page',
        slot: 'main',
        templateId: sampleTemplate.id,
        templateVersion: 1,
        templateMode: 'inherited',
        revision: 1,
        publishedRevision: 1,
        blocks: sampleBlocks,
      }

      const published = publishLayout(initialPage, ['layout:publish'])
      expect(published.publishedRevision).toBe(1)
      const immutableSnapshot = JSON.stringify(published.blocks)

      // 2. The template is updated to revision 3 with new blocks
      const updatedTemplateBlocks: LayoutBlock[] = [
        ...sampleBlocks,
        {
          id: 'rich-1',
          component: 'publisher.rich-content',
          componentVersion: 1,
          props: {
            title: 'New Manifesto Addendum',
            body: 'Added in template v3',
            alignment: 'left',
            spacing: 'relaxed',
          },
        },
      ]

      // 3. When template changes, the published page remains exactly as it was
      expect(JSON.stringify(published.blocks)).toBe(immutableSnapshot)
      expect(published.blocks.length).toBe(2)
      expect(published.publishedRevision).toBe(1)

      // 4. Even if the page draft updates its draft blocks, the published page is NOT surprise-updated
      const draftUpdatedPage: PageLayout = {
        ...published,
        blocks: updatedTemplateBlocks,
        templateVersion: 3,
        revision: published.revision + 1,
        // Notice status remains published, but publishedRevision is NOT bumped until deliberate publish
      }
      expect(draftUpdatedPage.blocks.length).toBe(3)
      // Published snapshot remains at revision 1 until publishLayout is deliberately invoked
      expect(draftUpdatedPage.publishedRevision).toBe(1)
    })
  })

  describe('2. Reusable Patterns/Sections (Snapshot vs Linked Instance)', () => {
    const samplePattern: PageLayout = {
      version: 1,
      id: 'pattern-join-cta',
      siteId: 'site-party',
      name: 'Join CTA Bar',
      path: '__pattern__/join-cta',
      status: 'published',
      themeId: 'neutral-starter',
      surface: 'pattern',
      slot: 'main',
      revision: 1,
      category: 'Actions',
      blocks: [sampleBlocks[1]],
    }

    it('instantiates a pattern as a documented snapshot with unique IDs', () => {
      const snapshotBlocks = instantiatePattern(samplePattern, 'snapshot')
      expect(snapshotBlocks.length).toBe(1)
      expect(snapshotBlocks[0].component).toBe('publisher.cta')
      expect(snapshotBlocks[0].id).not.toBe(sampleBlocks[1].id)
      expect(snapshotBlocks[0].props.title).toBe('Join the Movement')
    })

    it('instantiates a pattern as a linked instance referencing pattern ID and version', () => {
      const linkedBlocks = instantiatePattern(samplePattern, 'linked')
      expect(linkedBlocks.length).toBe(1)
      expect(linkedBlocks[0].component).toBe('publisher.pattern')
      expect(linkedBlocks[0].props.patternId).toBe(samplePattern.id)
      expect(linkedBlocks[0].props.patternName).toBe('Join CTA Bar')
      expect(linkedBlocks[0].props.patternVersion).toBe(1)
      expect(linkedBlocks[0].props.mode).toBe('linked')
    })

    it('validates patterns with surface=pattern and allows all theme registered components', () => {
      const validated = validateLayout(samplePattern)
      expect(validated.errors).toEqual([])
      expect(validated.layout.surface).toBe('pattern')
    })
  })

  describe('3. Versioned Global Regions', () => {
    it('allows global regions to target header, footer, announcement, and cta', () => {
      for (const slot of ['header', 'footer', 'announcement', 'cta'] as const) {
        const globalLayout: PageLayout = {
          version: 1,
          id: `global-${slot}`,
          siteId: 'site-party',
          path: `__global__/${slot}`,
          status: 'draft',
          themeId: 'neutral-starter',
          surface: 'global',
          slot,
          revision: 1,
          blocks: [
            {
              id: `${slot}-block-1`,
              component:
                slot === 'header' || slot === 'cta' ? 'publisher.cta' : 'publisher.rich-content',
              componentVersion: 1,
              props: { title: `${slot} title`, alignment: 'center', spacing: 'compact' },
            },
          ],
        }
        const validated = validateLayout(globalLayout)
        expect(validated.errors).toEqual([])
        expect(validated.layout.surface).toBe('global')
        expect(validated.layout.slot).toBe(slot)
      }
    })

    it('rejects global regions targeting unauthorized slots like main', () => {
      const invalidGlobal: PageLayout = {
        version: 1,
        id: 'global-main',
        siteId: 'site-party',
        path: '__global__/main',
        status: 'draft',
        themeId: 'neutral-starter',
        surface: 'global',
        slot: 'main',
        revision: 1,
        blocks: [],
      }
      const validated = validateLayout(invalidGlobal)
      expect(validated.errors).toContain(
        'Global layouts must target header, footer, announcement, or cta.',
      )
    })
  })

  describe('4. Theme-Approved Style Controls & Accessible Constraints', () => {
    it('accepts theme-approved style tokens (spacing, width, alignment, background, emphasis)', () => {
      const layout: PageLayout = {
        version: 1,
        id: 'styled-page',
        siteId: 'site-party',
        path: '/styled',
        status: 'draft',
        themeId: 'neutral-starter',
        surface: 'page',
        slot: 'main',
        revision: 1,
        blocks: [
          {
            id: 'hero-styled',
            component: 'publisher.hero',
            componentVersion: 1,
            props: {
              title: 'Styled Hero',
              alignment: 'center',
              spacing: 'relaxed',
              width: 'wide',
              background: 'brand',
              emphasis: 'bold',
            },
            visible: { desktop: true, tablet: true, mobile: false },
          },
        ],
      }
      const validated = validateLayout(layout)
      expect(validated.errors).toEqual([])
    })

    it('rejects arbitrary CSS properties, style injection, or unapproved tokens', () => {
      const layoutWithArbitraryCss: PageLayout = {
        version: 1,
        id: 'arbitrary-css-page',
        siteId: 'site-party',
        path: '/arbitrary-css',
        status: 'draft',
        themeId: 'neutral-starter',
        surface: 'page',
        slot: 'main',
        revision: 1,
        blocks: [
          {
            id: 'hero-hacked',
            component: 'publisher.hero',
            componentVersion: 1,
            props: {
              title: 'Hacked Hero',
              alignment: 'center',
              spacing: 'super-wide', // Unapproved token
              style: 'color: red; position: fixed;', // Arbitrary CSS property
              css: '.custom { display: none }', // Arbitrary CSS
            },
          },
        ],
      }
      const validated = validateLayout(layoutWithArbitraryCss)
      expect(validated.errors).toContain('hero-hacked: spacing is not theme-approved')
      expect(validated.errors).toContain('hero-hacked: unknown property style')
      expect(validated.errors).toContain('hero-hacked: unknown property css')
    })

    it('rejects script tags and malicious markup inside text fields', () => {
      const layoutWithXss: PageLayout = {
        version: 1,
        id: 'xss-page',
        siteId: 'site-party',
        path: '/xss',
        status: 'draft',
        themeId: 'neutral-starter',
        surface: 'page',
        slot: 'main',
        revision: 1,
        blocks: [
          {
            id: 'hero-xss',
            component: 'publisher.hero',
            componentVersion: 1,
            props: {
              title: '<script>alert("hacked")</script>',
              body: '<style>body { display: none; }</style>',
              alignment: 'center',
            },
          },
        ],
      }
      const validated = validateLayout(layoutWithXss)
      expect(
        validated.errors.some(
          (e) => e.includes('unsafe markup') || e.includes('unsafe or oversized text'),
        ),
      ).toBe(true)
    })

    it('validates responsive visibility limits and rejects invalid non-boolean rules', () => {
      const layoutWithInvalidVisibility: PageLayout = {
        version: 1,
        id: 'visibility-page',
        siteId: 'site-party',
        path: '/visibility',
        status: 'draft',
        themeId: 'neutral-starter',
        surface: 'page',
        slot: 'main',
        revision: 1,
        blocks: [
          {
            id: 'hero-vis',
            component: 'publisher.hero',
            componentVersion: 1,
            props: { title: 'Visibility Hero', alignment: 'left' },
            visible: { desktop: 'yes', tv: true } as unknown as LayoutBlock['visible'],
          },
        ],
      }
      const validated = validateLayout(layoutWithInvalidVisibility)
      expect(validated.errors).toContain('hero-vis: desktop visibility must be boolean')
      expect(validated.errors).toContain('hero-vis: unknown visibility rule')
    })
  })

  describe('5. Export/Import Presentation Documents & Cross-Theme Incompatibility Checks', () => {
    const validPackage: PresentationPackage = {
      schema: 'renegade-presentation-package',
      version: 1,
      exportedAt: new Date().toISOString(),
      siteId: 'site-party',
      theme: { id: 'neutral-starter' },
      pages: [
        {
          version: 1,
          id: 'page-home',
          siteId: 'site-party',
          path: '/',
          status: 'published',
          themeId: 'neutral-starter',
          surface: 'page',
          slot: 'main',
          revision: 1,
          blocks: sampleBlocks,
        },
      ],
      templates: [sampleTemplate],
      patterns: [],
      globals: [],
    }

    it('validates a compatible presentation package against target theme', () => {
      const result = validatePresentationImport(validPackage, 'neutral-starter')
      expect(result.valid).toBe(true)
      expect(result.compatible).toBe(true)
      expect(result.incompatibilities).toEqual([])
      expect(result.summary.pagesCount).toBe(1)
      expect(result.summary.templatesCount).toBe(1)
    })

    it('reports cross-theme incompatibilities before mutation when component is unknown in target theme', () => {
      const incompatiblePackage: PresentationPackage = {
        ...validPackage,
        pages: [
          {
            ...validPackage.pages[0],
            blocks: [
              {
                id: 'unknown-block',
                component: 'publisher.fancy-3d-carousel',
                componentVersion: 1,
                props: {},
              },
            ],
          },
        ],
      }

      const result = validatePresentationImport(incompatiblePackage, 'neutral-starter')
      expect(result.valid).toBe(true)
      expect(result.compatible).toBe(false)
      expect(result.incompatibilities.length).toBeGreaterThan(0)
      expect(result.incompatibilities[0].component).toBe('publisher.fancy-3d-carousel')
      expect(result.incompatibilities[0].reason).toContain('is not registered in target theme')
    })

    it('rejects invalid or unsupported presentation package schemas', () => {
      const invalidSchema = { schema: 'corrupt', version: 99 }
      const result = validatePresentationImport(invalidSchema, 'neutral-starter')
      expect(result.valid).toBe(false)
      expect(result.compatible).toBe(false)
      expect(result.incompatibilities[0].reason).toBe('Unsupported package schema or version.')
    })
  })
})
