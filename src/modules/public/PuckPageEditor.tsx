'use client'

import { Puck, type Config, type Data } from '@puckeditor/core'

import {
  applyLayoutAction,
  componentRegistry,
  type BuilderPermission,
  type PageLayout,
  publishLayout,
} from './page-builder'

type PuckBlock = { type: string; props: Record<string, unknown> }

// Puck is intentionally an interaction adapter. This conversion is the only
// Puck-shaped data in the application, so replacing the canvas never migrates
// stored layouts or public rendering.
export function toPuckData(layout: PageLayout): Data {
  return {
    content: layout.blocks.map((block) => ({
      type: block.component,
      props: { ...block.props, _layoutBlockId: block.id },
    })),
    root: { props: {} },
  } as unknown as Data
}

export function fromPuckData(layout: PageLayout, data: Data): PageLayout {
  const content = (data as unknown as { content?: PuckBlock[] }).content ?? []
  let next: PageLayout = { ...layout, blocks: [] }
  for (const [index, block] of content.entries()) {
    const id =
      typeof block.props._layoutBlockId === 'string'
        ? block.props._layoutBlockId
        : `puck-${index + 1}`
    const props = { ...block.props }
    delete props._layoutBlockId
    const definition = componentRegistry[block.type]
    if (!definition) continue
    next = applyLayoutAction(next, {
      type: 'undo-delete',
      at: next.blocks.length,
      block: { id, component: definition.id, componentVersion: definition.version, props },
    })
  }
  return next
}

const puckConfig = {
  components: Object.fromEntries(
    Object.values(componentRegistry).map((definition) => [
      definition.id,
      {
        fields: Object.fromEntries(
          Object.entries(definition.fields).map(([name, kind]) => [
            name,
            { type: kind === 'boolean' ? 'radio' : kind === 'number' ? 'number' : 'text' },
          ]),
        ),
        render: (props: Record<string, unknown>) => definition.render(props),
      },
    ]),
  ),
} as unknown as Config

export function PuckPageEditor({
  layout,
  permissions,
  onDraft,
  onPublish,
}: {
  layout: PageLayout
  permissions: BuilderPermission[]
  onDraft: (layout: PageLayout) => void
  onPublish: (layout: PageLayout) => void
}) {
  return (
    <Puck
      config={puckConfig}
      data={toPuckData(layout)}
      permissions={{
        drag: permissions.includes('layout:edit'),
        edit: permissions.includes('layout:edit'),
      }}
      onPublish={(data) => {
        const draft = fromPuckData(layout, data)
        onDraft(draft)
        onPublish(publishLayout(draft, permissions))
      }}
    />
  )
}
