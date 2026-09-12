import type { EditorialPresentation } from './persistence'
import { resolveTheme, resolveTemplate } from '../presentation/registry'

export function EditorialArticleView({
  article,
  themeId,
}: {
  article: EditorialPresentation
  themeId?: string
}) {
  const theme = resolveTheme(themeId)
  const template = resolveTemplate(theme, article.contentType === 'page' ? 'page' : 'article')
  return template.render({
    main: theme.componentRegistry['publisher.editorial'].render({ article }),
  })
}
