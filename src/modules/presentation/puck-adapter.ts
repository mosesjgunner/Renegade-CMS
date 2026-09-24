import type { Data } from '@puckeditor/core'
import type { ThemeSlot, VisualEditor } from './contracts'
import { resolveTemplate, resolveTheme } from './registry'

export type PaletteCategory = { id: string; label: string; components: string[] }

function resolveActiveSlot(slots: Record<string, unknown>): ThemeSlot {
  if (slots.main) return 'main'
  if (slots.header) return 'header'
  if (slots.footer) return 'footer'
  if (slots.announcement) return 'announcement'
  if (slots.cta) return 'cta'
  return (Object.keys(slots)[0] as ThemeSlot) ?? 'main'
}

/** The palette is derived from the selected theme, template and slot; the client cannot expand it. */
export function paletteFor(
  document: Parameters<VisualEditor<Data>['toEditor']>[0],
): PaletteCategory[] {
  const theme = resolveTheme(document.theme.id)
  const template = resolveTemplate(theme, document.surface, document.template.id)
  const slot = resolveActiveSlot(document.slots)
  const allowed = new Set(template.slots[slot]?.allowedComponents ?? [])
  const grouped = new Map<string, string[]>()
  for (const component of Object.values(theme.componentRegistry)) {
    if (!allowed.has(component.id) || component.id === 'publisher.editorial') continue
    const list = grouped.get(component.category) ?? []
    list.push(component.id)
    grouped.set(component.category, list)
  }
  return [...grouped.entries()].map(([label, components]) => ({
    id: label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
    label,
    components,
  }))
}

/** Puck edits main; other slots and opaque block metadata remain lossless. */
export const puckVisualEditor: VisualEditor<Data> = {
  id: 'puck',
  version: '1.0.0',
  toEditor(document) {
    const slot = resolveActiveSlot(document.slots)
    return {
      content: (document.slots[slot] ?? []).map((block) => ({
        type: block.component,
        props: { ...block.props, id: block.id },
      })),
      root: { props: {} },
    } as Data
  },
  fromEditor(original, data) {
    const document = structuredClone(original)
    const slot = resolveActiveSlot(document.slots)
    const ids = new Set<string>()
    document.slots[slot] = data.content.map((item) => {
      const id = String(item.props.id)
      if (!id || id === 'undefined' || ids.has(id))
        throw new Error('Editor block ids must be unique.')
      ids.add(id)
      const previous = original.slots[slot]?.find((block) => block.id === id)
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
