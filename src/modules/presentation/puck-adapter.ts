import type { Data } from '@puckeditor/core'
import type { VisualEditor } from './contracts'

/** Puck edits main; other slots and opaque block metadata remain lossless. */
export const puckVisualEditor: VisualEditor<Data> = {
  id: 'puck',
  version: '1.0.0',
  toEditor(document) {
    return {
      content: (document.slots.main ?? []).map((block) => ({
        type: block.component,
        props: { ...block.props, id: block.id },
      })),
      root: { props: {} },
    } as Data
  },
  fromEditor(original, data) {
    const document = structuredClone(original)
    const ids = new Set<string>()
    document.slots.main = data.content.map((item) => {
      const id = String(item.props.id)
      if (!id || id === 'undefined' || ids.has(id))
        throw new Error('Editor block ids must be unique.')
      ids.add(id)
      const previous = original.slots.main?.find((block) => block.id === id)
      const props: Record<string, unknown> = { ...item.props }
      delete props.id
      return {
        ...previous,
        id,
        component: item.type,
        componentVersion: previous?.component === item.type ? previous.componentVersion : 1,
        props,
      }
    })
    return document
  },
}
