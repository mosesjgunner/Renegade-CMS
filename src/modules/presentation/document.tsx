import { Fragment } from 'react'
import type { PresentationDocument, ThemeManifest } from './contracts'
import { resolveTemplate } from './registry'

/** Never edits the input or upgrades a missing component implicitly. */
export function renderPresentation(document: PresentationDocument, theme: ThemeManifest) {
  if (
    document.version !== 1 ||
    document.theme.id !== theme.id ||
    document.theme.version !== theme.version
  )
    throw new Error('Presentation migration required; original preserved.')
  const template = resolveTemplate(theme, document.surface, document.template.id)
  if (template.id === document.template.id && template.version !== document.template.version)
    throw new Error('Template migration required; original preserved.')
  const slots = Object.fromEntries(
    Object.entries(template.slots).map(([name, definition]) => {
      if (definition.required && !Object.hasOwn(document.slots, name))
        throw new Error(`Required slot missing: ${name}`)
      const blocks = document.slots[name as keyof typeof document.slots] ?? []
      return [
        name,
        blocks
          .filter((block) => !block.hidden)
          .map((block) => {
            const component = Object.hasOwn(theme.componentRegistry, block.component)
              ? theme.componentRegistry[block.component]
              : undefined
            const available =
              component &&
              definition.allowedComponents.includes(block.component) &&
              component.version === block.componentVersion &&
              !component.validate(block.props).length
            return (
              <Fragment key={block.id}>
                {available ? (
                  component.render(block.props)
                ) : (
                  <section data-unavailable-component={block.component}>
                    This section is unavailable.
                  </section>
                )}
              </Fragment>
            )
          }),
      ]
    }),
  )
  return template.render(slots)
}
export function migratePresentation(
  document: PresentationDocument,
  target: ThemeManifest,
): PresentationDocument {
  if (document.version !== 1 || document.theme.id !== target.id)
    throw new Error('Unsupported presentation migration.')
  if (document.theme.version === target.version) return structuredClone(document)
  const migration = target.migrations.find(
    (item) => item.from === document.theme.version && item.to === target.version,
  )
  if (!migration) throw new Error('Missing explicit migration; original preserved.')
  const next = migration.migrate(structuredClone(document))
  if (
    next.siteId !== document.siteId ||
    next.contentId !== document.contentId ||
    next.theme.id !== target.id ||
    next.theme.version !== target.version
  )
    throw new Error('Invalid migration result.')
  renderPresentation(next, target)
  return next
}
