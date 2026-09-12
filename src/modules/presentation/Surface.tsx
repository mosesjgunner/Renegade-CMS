import type { ReactNode } from 'react'
import type { Surface } from './contracts'
import { resolveTheme, resolveTemplate } from './registry'

export function PresentationSurface({
  themeId,
  surface,
  children,
}: {
  themeId?: string
  surface: Surface
  children: ReactNode
}) {
  return resolveTemplate(resolveTheme(themeId), surface).render({ main: children })
}
