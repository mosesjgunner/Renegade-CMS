import { Fragment, type ReactNode } from 'react'
import type { PresentationDocument, ThemeManifest } from './contracts'
import { BlockVisibility } from './responsive'
import { resolveTemplate } from './registry'
import {
  isAllowedChildComponent,
  isContainerDefinition,
  slotFieldNames,
  type LayoutBlock,
} from '../public/page-builder'

function unavailableSection(component: string): ReactNode {
  return <section data-unavailable-component={component}>This section is unavailable.</section>
}

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

  const renderChild = (child: LayoutBlock): ReactNode => {
    const definition = Object.hasOwn(theme.componentRegistry, child.component)
      ? theme.componentRegistry[child.component]
      : undefined
    const available =
      definition &&
      isAllowedChildComponent(definition) &&
      definition.version === child.componentVersion &&
      !definition.validate(child.props).length
    if (!available || !definition) return unavailableSection(child.component)
    // A resolved pattern renders its body wherever it sits, columns included.
    if (
      child.component === 'publisher.pattern' &&
      (child.props.patternResolution || typeof child.props.patternUnavailable === 'string')
    )
      return renderBlock(child, null)
    return definition.render(child.props)
  }

  const renderBlock = (block: LayoutBlock, allowedComponents: string[] | null): ReactNode => {
    const component = Object.hasOwn(theme.componentRegistry, block.component)
      ? theme.componentRegistry[block.component]
      : undefined
    const available =
      component &&
      (allowedComponents === null || allowedComponents.includes(block.component)) &&
      component.version === block.componentVersion &&
      !component.validate(block.props).length
    if (!available || !component) return unavailableSection(block.component)
    if (block.component === 'publisher.pattern') {
      // Linked patterns render their resolved published body (S2-07);
      // without a resolution the component's reference card is the
      // editor-facing state, and an explicit resolver reason wins.
      const resolution = block.props.patternResolution as
        | { name: string; version: number; blocks: LayoutBlock[] }
        | undefined
      if (resolution) {
        return (
          <div
            data-pattern-instance={String(block.props.patternId ?? '')}
            data-pattern-name={resolution.name}
            data-pattern-mode="linked"
            data-pattern-version={resolution.version}
            data-pattern-policy="latest-published"
            className="pattern-instance"
          >
            {resolution.blocks
              .filter((child) => !child.hidden)
              .map((child) => (
                <Fragment key={child.id}>
                  <BlockVisibility block={child}>{renderBlock(child, null)}</BlockVisibility>
                </Fragment>
              ))}
          </div>
        )
      }
      if (typeof block.props.patternUnavailable === 'string') {
        return (
          <div
            data-pattern-instance={String(block.props.patternId ?? '')}
            data-pattern-unavailable={block.props.patternUnavailable}
            className="pattern-instance"
          >
            <p>{block.props.patternUnavailable}</p>
          </div>
        )
      }
    }
    if (!isContainerDefinition(component)) return component.render(block.props)
    // Container: pre-render each slot's children with the same availability
    // and visibility policy, then hand the container rendered nodes.
    const renderedProps: Record<string, unknown> = { ...block.props }
    for (const field of slotFieldNames(component)) {
      const children = Array.isArray(block.props[field])
        ? (block.props[field] as LayoutBlock[])
        : []
      renderedProps[field] = children
        .filter((child) => !child.hidden)
        .map((child) => (
          <Fragment key={child.id}>
            <BlockVisibility block={child}>{renderChild(child)}</BlockVisibility>
          </Fragment>
        ))
    }
    return component.render(renderedProps)
  }

  const slots = Object.fromEntries(
    Object.entries(template.slots).map(([name, definition]) => {
      if (definition.required && !Object.hasOwn(document.slots, name))
        throw new Error(`Required slot missing: ${name}`)
      const blocks = document.slots[name as keyof typeof document.slots] ?? []
      return [
        name,
        blocks
          .filter((block) => !block.hidden)
          .map((block) => (
            <Fragment key={block.id}>
              <BlockVisibility block={block}>
                {renderBlock(block, definition.allowedComponents)}
              </BlockVisibility>
            </Fragment>
          )),
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
