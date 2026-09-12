'use client'

import { Puck, type Config, type Data } from '@puckeditor/core'
import { puckVisualEditor } from '../presentation/puck-adapter'
import type { PresentationDocument } from '../presentation/contracts'
import { resolveTheme } from '../presentation/registry'

import {
  componentRegistry,
  type BuilderPermission,
  type PageLayout,
  publishLayout,
} from './page-builder'

function presentation(layout: PageLayout): PresentationDocument {
  const theme = resolveTheme(layout.themeId)
  return {
    version: 1,
    siteId: layout.siteId,
    theme: { id: theme.id, version: theme.version },
    template: { id: 'layout', version: '1.0.0' },
    surface: 'layout',
    slots: { main: layout.blocks },
  }
}
export function toPuckData(layout: PageLayout): Data {
  return puckVisualEditor.toEditor(presentation(layout))
}
export function fromPuckData(layout: PageLayout, data: Data): PageLayout {
  const document = puckVisualEditor.fromEditor(presentation(layout), data)
  return { ...layout, blocks: document.slots.main ?? [], revision: layout.revision + 1 }
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
