import type { Data } from '@puckeditor/core'
import type { ThemeManifest, ThemeSlot, VisualEditor } from './contracts'
import { resolveTemplate, resolveTheme } from './registry'
import { slotFieldNames, type LayoutBlock } from '../public/page-builder'

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

type EditorItem = { type: string; props: Record<string, unknown> }

function blockToEditorItem(block: LayoutBlock, theme: ThemeManifest): EditorItem {
  const props: Record<string, unknown> = { ...block.props, id: block.id }
  const definition = theme.componentRegistry[block.component]
  if (definition) {
    for (const field of slotFieldNames(definition)) {
      const children = Array.isArray(block.props[field])
        ? (block.props[field] as LayoutBlock[])
        : []
      props[field] = children.map((child) => blockToEditorItem(child, theme))
    }
  }
  return { type: block.component, props }
}

function editorItemToBlock(
  item: EditorItem,
  context: {
    theme: ThemeManifest
    previousBlocks: LayoutBlock[]
    seen: Set<string>
    topLevel: boolean
  },
): LayoutBlock {
  // Puck prefixes generated ids with namespaced types (publisher.hero).
  // Portable block ids use underscores; keep the mapping stable across edits.
  const rawId = String(item.props.id).replaceAll('.', '_')
  if (!rawId || rawId === 'undefined') throw new Error('Editor block ids must be unique.')
  let id = rawId
  if (context.seen.has(id)) {
    // Top-level duplicates are corrupt editor data and keep the historical
    // hard failure. Duplicated containers legitimately clone child ids, so
    // children are uniquified deterministically instead of losing the edit.
    if (context.topLevel) throw new Error('Editor block ids must be unique.')
    let suffix = 2
    while (context.seen.has(`${rawId}-${suffix}`)) suffix += 1
    id = `${rawId}-${suffix}`
  }
  context.seen.add(id)
  const previous = context.previousBlocks.find((block) => block.id === rawId)
  const props: Record<string, unknown> = { ...item.props }
  delete props.id
  const definition = context.theme.componentRegistry[item.type]
  if (definition) {
    for (const field of slotFieldNames(definition)) {
      const children = Array.isArray(props[field]) ? (props[field] as EditorItem[]) : []
      const previousChildren =
        previous && Array.isArray(previous.props[field])
          ? (previous.props[field] as LayoutBlock[])
          : []
      props[field] = children.map((child) =>
        editorItemToBlock(child, {
          theme: context.theme,
          previousBlocks: previousChildren,
          seen: context.seen,
          topLevel: false,
        }),
      )
    }
  }
  return {
    ...previous,
    id,
    component: item.type,
    componentVersion: previous?.component === item.type ? previous.componentVersion : 1,
    props,
  }
}

/** Puck edits main; other slots and opaque block metadata remain lossless. */
export const puckVisualEditor: VisualEditor<Data> = {
  id: 'puck',
  version: '1.0.0',
  toEditor(document) {
    const slot = resolveActiveSlot(document.slots)
    const theme = resolveTheme(document.theme.id)
    return {
      content: (document.slots[slot] ?? []).map((block) => blockToEditorItem(block, theme)),
      root: { props: {} },
    } as Data
  },
  fromEditor(original, data) {
    const document = structuredClone(original)
    const slot = resolveActiveSlot(document.slots)
    const theme = resolveTheme(document.theme.id)
    const seen = new Set<string>()
    const previousBlocks = document.slots[slot] ?? []
    document.slots[slot] = (data.content as unknown as EditorItem[]).map((item) =>
      editorItemToBlock(item, { theme, previousBlocks, seen, topLevel: true }),
    )
    return document
  },
}
