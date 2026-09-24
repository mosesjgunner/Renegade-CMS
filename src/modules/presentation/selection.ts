import type { ThemeReference, ThemeSelection, ThemeSelectionStore, Surface } from './contracts'
import { resolveTheme, resolveTemplate, themes } from './registry'

export function validateThemeReference(reference: ThemeReference) {
  if (
    !reference ||
    !Object.hasOwn(themes, reference.id) ||
    resolveTheme(reference.id).version !== reference.version
  )
    throw new Error('Unavailable theme version; activation refused.')
}
export function selectTheme(
  selection: ThemeSelection,
  input: { siteId: string; preview?: boolean; override?: ThemeReference },
) {
  if (selection.version !== 1 || selection.siteId !== input.siteId)
    throw new Error('Theme selection scope mismatch.')
  let reference = input.preview && selection.draft ? selection.draft : selection.active
  if (
    input.override &&
    selection.permittedOverrides.some(
      (item) => item.id === input.override?.id && item.version === input.override.version,
    )
  )
    reference = input.override
  validateThemeReference(reference)
  return resolveTheme(reference.id)
}
/** Caller authenticates preview/activation; public requests never infer preview from query strings. */
export async function activateTheme(selection: ThemeSelection, store: ThemeSelectionStore) {
  if (!selection.draft) throw new Error('No draft theme to activate.')
  selectTheme(selection, { siteId: selection.siteId, preview: true })
  const next: ThemeSelection = {
    ...selection,
    active: { ...selection.draft },
    revision: selection.revision + 1,
  }
  delete next.draft
  if (!(await store.compareAndSwap(selection.siteId, selection.revision, next)))
    throw new Error('Theme activation conflict.')
  return next
}

export function selectTemplateForSelection(
  selection: ThemeSelection,
  input: {
    siteId: string
    surface: Surface
    templateId?: string
    preview?: boolean
    override?: ThemeReference
  },
) {
  const theme = selectTheme(selection, input)
  const permitted =
    input.templateId &&
    selection.permittedTemplateOverrides?.[input.surface]?.includes(input.templateId)
  return resolveTemplate(theme, input.surface, permitted ? input.templateId : undefined)
}
