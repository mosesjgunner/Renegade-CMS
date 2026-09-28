import type { EditorialPresentation } from './persistence'
import { resolveTheme, resolveSurfaceTemplate } from '../presentation/registry'
import { TemplateInspector } from '../presentation/TemplateInspector'

export function EditorialArticleView({
  article,
  themeId,
  showInspector = true,
}: {
  article: EditorialPresentation
  themeId?: string
  showInspector?: boolean
}) {
  const theme = resolveTheme(themeId)
  const surface = article.contentType === 'page' ? 'page' : 'article'

  const effectiveOverride =
    (article as { presentationTemplate?: string; templateId?: string }).presentationTemplate ??
    (article as { templateId?: string }).templateId ??
    null

  const effectiveVariant = (article as { templateVariant?: string }).templateVariant ?? null

  const resolution = resolveSurfaceTemplate({
    theme,
    surface,
    entryOverride: effectiveOverride,
    conditionalVariant: effectiveVariant,
  })

  const renderedContent = resolution.template.render({
    main: theme.componentRegistry['publisher.editorial'].render({ article }),
  })

  return (
    <div
      data-surface={surface}
      data-template-id={resolution.selectedTemplateId}
      data-template-precedence={resolution.selectedLevel}
      className="renegade-surface-container"
    >
      {renderedContent}
      {showInspector ? <TemplateInspector resolution={resolution} /> : null}
    </div>
  )
}
