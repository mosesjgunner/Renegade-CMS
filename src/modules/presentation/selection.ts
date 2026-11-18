import type {
  ThemeManifest,
  ThemeReference,
  ThemeSelection,
  ThemeSelectionStore,
  Surface,
  Template,
} from './contracts'
import type { Configuration } from './lifecycle'
import type { LayoutBlock, TemplateInheritanceMode } from '../public/page-builder'
import { adapterForContentType, type DomainTemplateAdapter } from './domain-templates'
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

/* ------------------------------------------------------------------ */
/* Durable-flow selection                                              */
/*                                                                     */
/* The functions above state the selection policy against the pure     */
/* ThemeSelection contract. The resolver below is the same policy      */
/* implemented over the durable theme state (lifecycle.ts): the        */
/* caller resolves site and authenticated preview first              */
/* (request-theme.ts → resolveConfiguration), and the resulting        */
/* Configuration — active or preview — is the input here. There is     */
/* one precedence policy, stated once, in resolvePresentationSelection.*/
/* ------------------------------------------------------------------ */

/**
 * Route surfaces are rendering frames; domain content-type keys are data.
 * The two are related only through the domain adapter registry (S2-08)
 * plus this table of pure route frames — a content-type key is never
 * used as a surface name or vice versa. Domain keys without a registered
 * adapter resolve through the generic fallback adapter (page surface).
 */
export const contentTypeSurfaces: Readonly<Record<string, Surface>> = {
  home: 'home',
  archive: 'archive',
  search: 'search',
  '404': '404',
  layout: 'layout',
}

export function surfaceForContentType(contentTypeKey?: string | null): Surface {
  if (!contentTypeKey) return 'page'
  if (Object.hasOwn(contentTypeSurfaces, contentTypeKey)) return contentTypeSurfaces[contentTypeKey]
  return adapterForContentType(contentTypeKey).surface
}

/** Facts about a stored template document, supplied by the caller's loader. */
export type TemplateDocumentFacts = {
  id: string
  siteId: string
  surface?: string
  isRetired?: boolean
  revision?: number
  blocks: LayoutBlock[]
}

export type PresentationSelectionRequest = {
  siteId: string
  /** Durable theme state output; preview resolution already applied. */
  configuration: Configuration
  surface: Surface
  /** Domain content-type key (e.g. 'article', 'product') — never a surface. */
  contentTypeKey?: string
  documentTemplateId?: string
  documentTemplateMode?: TemplateInheritanceMode
  documentThemeOverride?: ThemeReference
  permittedThemeOverrides?: ThemeReference[]
  /** Site-level defaults: content-type key → template document id. */
  siteContentTypeDefaults?: Record<string, string>
  loadTemplateDocument?: (id: string) => Promise<TemplateDocumentFacts | undefined>
}

export type PresentationSelectionResult = {
  theme: ThemeManifest
  themeSource: 'active-configuration' | 'document-override'
  /** The domain adapter for the request's content-type key (S2-08). */
  domainAdapter?: DomainTemplateAdapter
  /** The theme template framing the surface (frame/fallback when a document wins). */
  template: Template
  templateSource:
    | 'document-override'
    | 'document-template'
    | 'site-content-type-default'
    | 'theme-content-type-default'
    | 'core-fallback'
  templateDocumentId?: string
  /** Package, theme, renderer-contract, template and document versions are distinct values. */
  versions: {
    package: string
    theme: string
    rendererContract: number
    template: string
    templateDocumentRevision?: number
  }
}

function templateDocumentAuthorized(
  facts: TemplateDocumentFacts,
  siteId: string,
  theme: ThemeManifest,
): boolean {
  if (facts.siteId !== siteId) return false
  if (facts.surface !== 'template') return false
  if (facts.isRetired === true) return false
  // Every rendered block must be served by the selected theme. Unknown
  // (preserved) blocks are not part of `blocks` and do not affect this.
  return facts.blocks.every((block) => Object.hasOwn(theme.componentRegistry, block.component))
}

/**
 * The one presentation selection policy for the durable flow.
 *
 * Precedence: site + authenticated preview (resolved by the caller into
 * `configuration`) → active package → authorized explicit document theme
 * override → authorized document template (explicit, then inherited) →
 * site content-type default → theme content-type default → compatible
 * core fallback. An unauthorized or incompatible candidate never fails
 * the selection; it falls through to the next tier.
 */
export async function resolvePresentationSelection(
  request: PresentationSelectionRequest,
): Promise<PresentationSelectionResult> {
  let theme = resolveTheme(request.configuration.renderer)
  let themeSource: PresentationSelectionResult['themeSource'] = 'active-configuration'
  const override = request.documentThemeOverride
  if (
    override &&
    (request.permittedThemeOverrides ?? []).some(
      (permitted) => permitted.id === override.id && permitted.version === override.version,
    )
  ) {
    try {
      validateThemeReference(override)
      theme = resolveTheme(override.id)
      themeSource = 'document-override'
    } catch {
      // An override that fails validation is not authorized; keep the active theme.
    }
  }

  const surfaceTemplate = theme.templateRegistry[request.surface]
  const hasSurfaceTemplate = Boolean(surfaceTemplate?.contentTypes.includes(request.surface))
  const template = hasSurfaceTemplate ? surfaceTemplate : resolveTemplate(theme, request.surface)
  let templateSource: PresentationSelectionResult['templateSource'] = hasSurfaceTemplate
    ? 'theme-content-type-default'
    : 'core-fallback'
  let templateDocumentId: string | undefined
  let templateDocumentRevision: number | undefined

  const tryTemplateDocument = async (
    id: string | undefined,
    source: PresentationSelectionResult['templateSource'],
  ): Promise<boolean> => {
    if (!id || !request.loadTemplateDocument) return false
    const facts = await request.loadTemplateDocument(id)
    if (!facts || !templateDocumentAuthorized(facts, request.siteId, theme)) return false
    templateSource = source
    templateDocumentId = facts.id
    templateDocumentRevision = facts.revision
    return true
  }

  if (request.documentTemplateMode !== 'detached') {
    await tryTemplateDocument(
      request.documentTemplateId,
      request.documentTemplateMode === 'explicit' ? 'document-override' : 'document-template',
    )
  }
  if (!templateDocumentId && request.contentTypeKey && request.siteContentTypeDefaults) {
    await tryTemplateDocument(
      request.siteContentTypeDefaults[request.contentTypeKey],
      'site-content-type-default',
    )
  }

  return {
    theme,
    themeSource,
    domainAdapter: request.contentTypeKey
      ? adapterForContentType(request.contentTypeKey)
      : undefined,
    template,
    templateSource,
    templateDocumentId,
    versions: {
      package: request.configuration.version,
      theme: theme.version,
      rendererContract: theme.contractVersion,
      template: template.version,
      templateDocumentRevision,
    },
  }
}
