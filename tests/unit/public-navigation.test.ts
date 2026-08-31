import { describe, expect, it } from 'vitest'

import { canRenderPublic } from '../../src/modules/public/contracts'
import { normalizeNavigation, isActiveMenuItem } from '../../src/modules/public/navigation'
import { installRecipe, renderLayout } from '../../src/modules/public/page-builder'

describe('public navigation and resilient rendering', () => {
  it('normalizes editable nested menus and rejects unsafe links', () => {
    const navigation = normalizeNavigation({
      primary: [
        {
          label: 'Journal',
          href: '/journal',
          children: [{ label: 'Archive', href: '/journal/archive' }],
        },
        { label: 'Partner', href: 'https://example.test' },
        { label: 'Unsafe', href: 'javascript:alert(1)' },
      ],
      secondary: [{ label: 'About', href: '/about' }],
      footer: [{ label: 'Privacy', href: '/privacy' }],
    })
    expect(navigation.primary).toHaveLength(2)
    expect(navigation.primary[0]?.children[0]?.href).toBe('/journal/archive')
    expect(isActiveMenuItem(navigation.primary[0]!, '/journal/archive')).toBe(true)
  })

  it('keeps scheduled and future-dated records private until their publish time', () => {
    const now = new Date('2026-08-30T12:00:00Z')
    expect(canRenderPublic({ status: 'scheduled', publishedAt: '2026-08-30T12:01:00Z' }, now)).toBe(
      false,
    )
    expect(canRenderPublic({ status: 'scheduled', publishedAt: '2026-08-30T11:59:00Z' }, now)).toBe(
      true,
    )
    expect(canRenderPublic({ status: 'published', publishedAt: '2026-08-30T12:01:00Z' }, now)).toBe(
      false,
    )
  })

  it('renders a safe visible fallback for a legacy block', () => {
    const layout = installRecipe(undefined, 'writer-blogger', 'site-1')
    const rendered = renderLayout({
      ...layout,
      blocks: [{ id: 'retired', component: 'legacy.hero', componentVersion: 1, props: {} }],
    }) as Array<{ props?: Record<string, unknown> }>
    expect(rendered).toHaveLength(1)
    expect(rendered[0]?.props?.['data-unavailable-component']).toBe('legacy.hero')
  })
})
