import type { ReactNode } from 'react'
import type { Surface } from './contracts'
import { resolveTheme, resolveSurfaceTemplate, isSupportedSurface } from './registry'
import { TemplateInspector } from './TemplateInspector'

export function PresentationSurface({
  themeId,
  surface,
  entryOverride,
  conditionalVariant,
  record,
  children,
  showInspector = true,
}: {
  themeId?: string
  surface: Surface | (string & {})
  entryOverride?: string | null
  conditionalVariant?: string | null
  record?: object | null
  children: ReactNode
  showInspector?: boolean
}) {
  const theme = resolveTheme(themeId)

  // Explicit gap verification: if domain/surface is unsupported, show explicit gap instead of a fake template!
  if (!isSupportedSurface(surface as string)) {
    return (
      <div
        data-testid="unsupported-domain-gap"
        data-surface={surface}
        data-presentation-gap="unsupported-domain"
        role="alert"
        className="renegade-domain-gap p-6 m-4 border-2 border-red-500 bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-200 rounded-lg max-w-4xl mx-auto"
      >
        <h2 className="text-lg font-bold">
          Explicit Domain Gap: Unsupported Domain &ldquo;{surface}&rdquo;
        </h2>
        <p className="mt-1 text-sm">
          No registered template or fallback exists for domain &ldquo;{surface}&rdquo; in theme
          &ldquo;
          {theme.id}&rdquo;. Renegade CMS strictly prohibits fake or synthetic templates for
          unsupported domains.
        </p>
      </div>
    )
  }

  const rec = record as Record<string, unknown> | null | undefined

  // Derive entryOverride and conditionalVariant from record if not explicitly passed
  const effectiveOverride =
    entryOverride ??
    (typeof rec?.presentationTemplate === 'string'
      ? (rec.presentationTemplate as string)
      : typeof rec?.templateId === 'string'
        ? (rec.templateId as string)
        : typeof rec?.template === 'string'
          ? (rec.template as string)
          : null)

  const effectiveVariant =
    conditionalVariant ??
    (typeof rec?.templateVariant === 'string'
      ? (rec.templateVariant as string)
      : typeof rec?.format === 'string' && rec.format === 'featured'
        ? `${surface}-featured`
        : null)

  const resolution = resolveSurfaceTemplate({
    theme,
    surface: surface as Surface,
    entryOverride: effectiveOverride,
    conditionalVariant: effectiveVariant,
  })

  const renderedContent = resolution.template.render({ main: children })

  return (
    <div
      data-surface={surface}
      data-surface-container={surface}
      data-template-id={resolution.selectedTemplateId}
      data-template-precedence={resolution.selectedLevel}
      className="renegade-surface-container"
    >
      {renderedContent}
      {showInspector ? <TemplateInspector resolution={resolution} /> : null}
    </div>
  )
}
