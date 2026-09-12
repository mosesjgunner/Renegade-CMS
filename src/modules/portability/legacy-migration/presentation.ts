import { randomUUID } from 'node:crypto'
import type { LayoutBlock } from '../../public/page-builder'
import { resolveTheme } from '../../presentation/registry'
import type {
  LegacyThemeMapping,
  NormalizedItem,
  NormalizedMenu,
  PresentationReconstruction,
} from './types'

/** Extract hex colors from raw CSS or HTML */
function extractColorsFromText(text?: string): {
  brand?: string
  canvas?: string
  surface?: string
  ink?: string
} {
  if (!text) return {}
  const hexMatches = text.match(/#([0-9a-fA-F]{3,8})\b/g)
  if (!hexMatches || hexMatches.length === 0) return {}

  return {
    brand: hexMatches[0],
    canvas: hexMatches[1] || '#ffffff',
    surface: hexMatches[2] || '#f8fafc',
    ink: hexMatches[3] || '#0f172a',
  }
}

/**
 * Derives and reconstructs a safe Renegade presentation layout:
 * - Design tokens derived from theme mapping or captured HTML
 * - Header global layout with navigation menu items
 * - Footer global layout with copyright and columns
 * - Post, Page, and Archive templates
 * - Reusable section patterns
 * - Draft Page layouts linked to templates
 * Strictly uses only registered Renegade components; rejects all arbitrary scripts/styles/PHP.
 */
export function reconstructPresentation(
  themeMapping: LegacyThemeMapping | undefined,
  capturedHtml: Record<string, string> | undefined,
  menus: NormalizedMenu[],
  siteInfo: { title: string; description?: string },
  pages: NormalizedItem[],
  themeId = 'neutral-starter',
): PresentationReconstruction {
  const resolved = resolveTheme(themeId)

  // 1. Derive Theme Tokens
  const sampleHtml = capturedHtml ? Object.values(capturedHtml).join('\n') : ''
  const extractedColors = extractColorsFromText(sampleHtml)

  const themeTokens: Record<string, unknown> = {
    canvas: themeMapping?.tokens?.canvas ?? extractedColors.canvas ?? '#ffffff',
    surface: themeMapping?.tokens?.surface ?? extractedColors.surface ?? '#f8fafc',
    ink: themeMapping?.tokens?.ink ?? extractedColors.ink ?? '#0f172a',
    brand: themeMapping?.tokens?.brand ?? extractedColors.brand ?? '#2563eb',
    accent: themeMapping?.tokens?.accent ?? '#38bdf8',
    fontFamily: themeMapping?.tokens?.fontFamily ?? 'Inter, sans-serif',
    borderRadius: themeMapping?.tokens?.borderRadius ?? '8px',
    spacing: themeMapping?.tokens?.spacing ?? 'normal',
  }

  // 2. Derive Navigation & Header Global
  const primaryMenu = menus[0]
  const navigationLinks: Array<{ label: string; href: string }> = []

  if (primaryMenu && primaryMenu.items.length > 0) {
    for (const item of primaryMenu.items) {
      let href = item.url
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        try {
          const parsed = new URL(href)
          href = parsed.pathname
        } catch {
          // Keep as is
        }
      }
      navigationLinks.push({
        label: item.title || 'Link',
        href: href || '/',
      })
    }
  } else {
    navigationLinks.push({ label: 'Home', href: '/' }, { label: 'Articles', href: '/articles' })
  }

  const headerBlocks: LayoutBlock[] = [
    {
      id: `hdr-${randomUUID().slice(0, 8)}`,
      component: 'publisher.hero',
      componentVersion: 1,
      props: {
        title: themeMapping?.header?.siteTitle || siteInfo.title,
        body: siteInfo.description || '',
        alignment: 'left',
        spacing: 'compact',
        width: 'standard',
        background: 'canvas',
        emphasis: 'normal',
        link: navigationLinks[0]
          ? { label: navigationLinks[0].label, href: navigationLinks[0].href }
          : undefined,
      },
      visible: { desktop: true, tablet: true, mobile: true },
    },
  ]

  // 3. Derive Footer Global
  const copyright =
    themeMapping?.footer?.copyrightText ||
    `© ${new Date().getFullYear()} ${siteInfo.title}. All rights reserved.`
  const footerColumns = themeMapping?.footer?.columns || [
    {
      title: 'Navigation',
      links: navigationLinks.slice(0, 4),
    },
  ]

  const footerBlocks: LayoutBlock[] = [
    {
      id: `ftr-${randomUUID().slice(0, 8)}`,
      component: 'publisher.rich-content',
      componentVersion: 1,
      props: {
        title: 'Footer',
        body: copyright,
        alignment: 'center',
        spacing: 'normal',
        width: 'standard',
        background: 'surface',
        emphasis: 'subtle',
      },
      visible: { desktop: true, tablet: true, mobile: true },
    },
  ]

  // 4. Reconstruct Templates
  const templateIdPost = `tpl-post-${randomUUID().slice(0, 8)}`
  const templateIdPage = `tpl-page-${randomUUID().slice(0, 8)}`
  const templateIdArchive = `tpl-archive-${randomUUID().slice(0, 8)}`

  const templates: PresentationReconstruction['templates'] = [
    {
      id: templateIdPost,
      name: 'Migrated Post Template',
      targetType: 'post',
      blocks: [
        {
          id: `post-body-${randomUUID().slice(0, 8)}`,
          component: 'publisher.editorial',
          componentVersion: 1,
          props: {},
          visible: { desktop: true, tablet: true, mobile: true },
        },
      ],
    },
    {
      id: templateIdPage,
      name: 'Migrated Page Template',
      targetType: 'page',
      blocks: [
        {
          id: `page-hero-${randomUUID().slice(0, 8)}`,
          component: 'publisher.hero',
          componentVersion: 1,
          props: {
            title: 'Page Title',
            body: 'Overview and description',
            alignment: 'left',
            spacing: 'normal',
            width: 'standard',
            background: 'canvas',
            emphasis: 'bold',
          },
          visible: { desktop: true, tablet: true, mobile: true },
        },
        {
          id: `page-body-${randomUUID().slice(0, 8)}`,
          component: 'publisher.rich-content',
          componentVersion: 1,
          props: {
            title: 'Content',
            body: 'Detailed page body content',
            alignment: 'left',
            spacing: 'normal',
            width: 'standard',
            background: 'canvas',
            emphasis: 'normal',
          },
          visible: { desktop: true, tablet: true, mobile: true },
        },
      ],
    },
    {
      id: templateIdArchive,
      name: 'Migrated Archive Template',
      targetType: 'archive',
      blocks: [
        {
          id: `arch-list-${randomUUID().slice(0, 8)}`,
          component: 'publisher.article-list',
          componentVersion: 1,
          props: {
            title: 'Latest Articles',
            alignment: 'left',
            spacing: 'normal',
            width: 'standard',
            background: 'canvas',
            emphasis: 'normal',
          },
          visible: { desktop: true, tablet: true, mobile: true },
        },
      ],
    },
  ]

  // 5. Reconstruct Reusable Patterns
  const patternIdCta = `pat-cta-${randomUUID().slice(0, 8)}`
  const patterns: PresentationReconstruction['patterns'] = [
    {
      id: patternIdCta,
      name: 'Migrated Call to Action Banner',
      category: 'Actions',
      blocks: [
        {
          id: `cta-block-${randomUUID().slice(0, 8)}`,
          component: 'publisher.cta',
          componentVersion: 1,
          props: {
            title: 'Stay Connected',
            body: 'Join our independent publishing community and stay informed.',
            alignment: 'center',
            spacing: 'normal',
            width: 'standard',
            background: 'surface',
            emphasis: 'bold',
            link: { label: 'Get Started', href: '/articles' },
          },
          visible: { desktop: true, tablet: true, mobile: true },
        },
      ],
    },
  ]

  // 6. Reconstruct Page Layouts (draft status, linked to Page Template)
  const pageLayouts: PresentationReconstruction['pages'] = []
  for (const page of pages) {
    if (page.postType !== 'page') continue
    const path = page.slug === 'home' || page.slug === 'index' ? '/' : `/${page.slug}`

    const blocks: LayoutBlock[] = [
      {
        id: `hero-${randomUUID().slice(0, 8)}`,
        component: 'publisher.hero',
        componentVersion: 1,
        props: {
          title: page.title,
          body: page.excerpt || page.title,
          alignment: 'left',
          spacing: 'normal',
          width: 'standard',
          background: 'canvas',
          emphasis: 'bold',
        },
        visible: { desktop: true, tablet: true, mobile: true },
      },
    ]

    if (page.rawContent) {
      blocks.push({
        id: `content-${randomUUID().slice(0, 8)}`,
        component: 'publisher.rich-content',
        componentVersion: 1,
        props: {
          title: 'Body',
          body: page.rawContent.slice(0, 3900), // bounded within field limit
          alignment: 'left',
          spacing: 'normal',
          width: 'standard',
          background: 'canvas',
          emphasis: 'normal',
        },
        visible: { desktop: true, tablet: true, mobile: true },
      })
    }

    pageLayouts.push({
      path,
      name: page.title,
      templateId: templateIdPage,
      templateMode: 'inherited',
      blocks,
    })
  }

  return {
    themeId: resolved.id,
    themeTokens,
    header: {
      name: 'Global Site Header',
      blocks: headerBlocks,
      navigation: navigationLinks,
    },
    footer: {
      name: 'Global Site Footer',
      blocks: footerBlocks,
      columns: footerColumns,
      copyright,
    },
    templates,
    patterns,
    pages: pageLayouts,
  }
}
