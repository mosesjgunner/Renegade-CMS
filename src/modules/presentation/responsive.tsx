import type { ReactNode } from 'react'
import type { LayoutBlock, ResponsiveVisibility } from '../public/page-builder'

/**
 * Shared responsive-visibility policy for every rendering path.
 *
 * One HTML stream serves all viewports on public pages, so visibility is
 * expressed as CSS classes (see themes/starter.css) instead of server-side
 * filtering: the wrapper is layout-transparent (`display: contents`) until
 * a media query hides it. Breakpoints match the editor's device widths —
 * mobile below 768px, tablet 768–1279px, desktop from 1280px. The
 * authenticated preview, which emulates one device server-side, filters
 * with the same map via renderLayout's viewport argument; both paths must
 * agree on which blocks a given viewport sees.
 */
export const responsiveBreakpoints = { tablet: 768, desktop: 1280 } as const

const viewports = ['mobile', 'tablet', 'desktop'] as const

export function responsiveVisibilityClassName(visible?: ResponsiveVisibility): string | undefined {
  if (!visible) return undefined
  const classes = viewports
    .filter((viewport) => visible[viewport] === false)
    .map((viewport) => `rg-hide-${viewport}`)
  return classes.length > 0 ? `rg-visibility ${classes.join(' ')}` : undefined
}

export function isVisibleAt(
  visible: ResponsiveVisibility | undefined,
  viewport: (typeof viewports)[number],
): boolean {
  return visible?.[viewport] !== false
}

export function isHiddenEverywhere(block: LayoutBlock): boolean {
  if (block.hidden) return true
  return viewports.every((viewport) => block.visible?.[viewport] === false)
}

/** Wraps a rendered block only when it carries visibility restrictions. */
export function BlockVisibility({ block, children }: { block: LayoutBlock; children: ReactNode }) {
  const className = responsiveVisibilityClassName(block.visible)
  if (!className) return <>{children}</>
  return (
    <div className={className} data-block-id={block.id}>
      {children}
    </div>
  )
}
