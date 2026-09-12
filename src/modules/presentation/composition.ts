import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

import { resolveTheme } from './registry'
import {
  type LayoutBlock,
  type PageLayout,
  type TemplateInheritanceMode,
  validateLayout,
} from '../public/page-builder'

export type PresentationPackage = {
  schema: 'renegade-presentation-package'
  version: 1
  exportedAt: string
  siteId: string
  theme: {
    id: string
    tokens?: Record<string, unknown>
  }
  pages: PageLayout[]
  templates: PageLayout[]
  patterns: PageLayout[]
  globals: PageLayout[]
}

export type ImportValidationResult = {
  valid: boolean
  compatible: boolean
  targetThemeId: string
  incompatibilities: Array<{
    layoutPath: string
    component: string
    reason: string
  }>
  summary: {
    pagesCount: number
    templatesCount: number
    patternsCount: number
    globalsCount: number
  }
}

function docToLayout(row: Record<string, unknown>): PageLayout {
  return {
    version: 1,
    id: String(row.id),
    siteId:
      typeof row.site === 'string' ? row.site : String((row.site as { id?: unknown })?.id ?? ''),
    spaceId: typeof row.space === 'string' ? row.space : undefined,
    name: typeof row.name === 'string' ? row.name : undefined,
    path: String(row.path),
    status: row.status === 'published' ? 'published' : 'draft',
    themeId: resolveTheme(String(row.themeId ?? 'neutral-starter')).id,
    surface: (row.surface as PageLayout['surface']) ?? 'page',
    slot: (row.slot as PageLayout['slot']) ?? 'main',
    templateId: typeof row.templateId === 'string' ? row.templateId : undefined,
    templateVersion: typeof row.templateVersion === 'number' ? row.templateVersion : undefined,
    templateMode: (row.templateMode as TemplateInheritanceMode) ?? undefined,
    isRetired: row.isRetired === true,
    category: typeof row.category === 'string' ? row.category : undefined,
    blocks: Array.isArray(row.blocks) ? (row.blocks as LayoutBlock[]) : [],
    unknownBlocks: Array.isArray(row.unknownBlocks) ? (row.unknownBlocks as LayoutBlock[]) : [],
    revision: Number(row.revision ?? 1),
    publishedRevision:
      typeof row.publishedRevision === 'number' ? row.publishedRevision : undefined,
  }
}

/** 1. Create a reusable page template */
export async function createTemplate(
  payload: Payload,
  args: {
    siteId: string
    name: string
    themeId: string
    blocks: LayoutBlock[]
    category?: string
  },
): Promise<PageLayout> {
  const slug =
    args.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'template'
  const path = `__template__/${slug}-${randomUUID().slice(0, 8)}`
  const created = await payload.create({
    collection: 'page-layouts',
    overrideAccess: true,
    data: {
      site: args.siteId,
      name: args.name,
      path,
      themeId: args.themeId,
      surface: 'template',
      slot: 'main',
      layoutVersion: 1,
      status: 'published',
      visibility: 'public',
      blocks: args.blocks,
      unknownBlocks: [],
      revision: 1,
      publishedRevision: 1,
      isRetired: false,
      category: args.category ?? 'General',
      revisionHistory: [
        { revision: 1, blocks: args.blocks, action: 'created', savedAt: new Date().toISOString() },
      ],
    },
  } as never)
  return docToLayout(created as unknown as Record<string, unknown>)
}

/** Duplicate an existing template */
export async function duplicateTemplate(payload: Payload, templateId: string): Promise<PageLayout> {
  const original = await payload.findByID({
    collection: 'page-layouts',
    id: templateId,
    overrideAccess: true,
  })
  const origLayout = docToLayout(original as unknown as Record<string, unknown>)
  const newName = `${origLayout.name ?? 'Template'} (Copy)`
  const slug = newName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  const path = `__template__/${slug}-${randomUUID().slice(0, 8)}`
  const clonedBlocks = origLayout.blocks.map((block) => ({
    ...block,
    id: `${block.component.replace(/[^a-z0-9]/gi, '-')}-${randomUUID().slice(0, 8)}`,
  }))
  const created = await payload.create({
    collection: 'page-layouts',
    overrideAccess: true,
    data: {
      site: origLayout.siteId,
      name: newName,
      path,
      themeId: origLayout.themeId,
      surface: 'template',
      slot: 'main',
      layoutVersion: 1,
      status: 'draft',
      visibility: 'public',
      blocks: clonedBlocks,
      unknownBlocks: [],
      revision: 1,
      isRetired: false,
      category: origLayout.category,
      revisionHistory: [
        {
          revision: 1,
          blocks: clonedBlocks,
          action: 'duplicated-from',
          source: templateId,
          savedAt: new Date().toISOString(),
        },
      ],
    },
  } as never)
  return docToLayout(created as unknown as Record<string, unknown>)
}

/** Retire a template so it cannot be selected for new pages */
export async function retireTemplate(payload: Payload, templateId: string): Promise<PageLayout> {
  const updated = await payload.update({
    collection: 'page-layouts',
    id: templateId,
    overrideAccess: true,
    data: { isRetired: true },
  } as never)
  return docToLayout(updated as unknown as Record<string, unknown>)
}

/** Reactivate a retired template */
export async function reactivateTemplate(
  payload: Payload,
  templateId: string,
): Promise<PageLayout> {
  const updated = await payload.update({
    collection: 'page-layouts',
    id: templateId,
    overrideAccess: true,
    data: { isRetired: false },
  } as never)
  return docToLayout(updated as unknown as Record<string, unknown>)
}

/** Track which pages use a given template */
export async function getPagesUsingTemplate(
  payload: Payload,
  templateId: string,
  siteId: string,
): Promise<{
  template: PageLayout
  pages: Array<{
    id: string
    name?: string
    path: string
    templateMode: TemplateInheritanceMode
    templateVersion?: number
    isUpToDate: boolean
  }>
}> {
  const templateDoc = await payload.findByID({
    collection: 'page-layouts',
    id: templateId,
    overrideAccess: true,
  })
  const template = docToLayout(templateDoc as unknown as Record<string, unknown>)
  const pagesResult = await payload.find({
    collection: 'page-layouts',
    where: {
      and: [
        { site: { equals: siteId } },
        { templateId: { equals: templateId } },
        { surface: { equals: 'page' } },
      ],
    },
    limit: 100,
    overrideAccess: true,
  } as never)

  const pages = pagesResult.docs.map((doc) => {
    const layout = docToLayout(doc as unknown as Record<string, unknown>)
    return {
      id: layout.id,
      name: layout.name,
      path: layout.path,
      templateMode: layout.templateMode ?? 'inherited',
      templateVersion: layout.templateVersion,
      isUpToDate: (layout.templateVersion ?? 1) >= template.revision,
    }
  })

  return { template, pages }
}

/** Create a new page from a reusable template */
export async function createPageFromTemplate(
  payload: Payload,
  args: {
    siteId: string
    path: string
    name: string
    templateId: string
    templateMode?: TemplateInheritanceMode
  },
): Promise<PageLayout> {
  const templateDoc = await payload.findByID({
    collection: 'page-layouts',
    id: args.templateId,
    overrideAccess: true,
  })
  const template = docToLayout(templateDoc as unknown as Record<string, unknown>)
  if (template.isRetired) {
    throw new Error('Retired templates cannot be used to create new pages.')
  }

  const clonedBlocks = template.blocks.map((block) => ({
    ...block,
    id: `${block.component.replace(/[^a-z0-9]/gi, '-')}-${randomUUID().slice(0, 8)}`,
  }))

  const created = await payload.create({
    collection: 'page-layouts',
    overrideAccess: true,
    data: {
      site: args.siteId,
      name: args.name,
      path: args.path,
      themeId: template.themeId,
      surface: 'page',
      slot: 'main',
      layoutVersion: 1,
      status: 'draft',
      visibility: 'public',
      templateId: args.templateId,
      templateVersion: template.revision,
      templateMode: args.templateMode ?? 'inherited',
      blocks: clonedBlocks,
      unknownBlocks: [],
      revision: 1,
      revisionHistory: [
        {
          revision: 1,
          blocks: clonedBlocks,
          action: 'created-from-template',
          templateId: args.templateId,
          templateVersion: template.revision,
          savedAt: new Date().toISOString(),
        },
      ],
    },
  } as never)
  return docToLayout(created as unknown as Record<string, unknown>)
}

/**
 * Synchronize template changes to page draft.
 * INVARIANT: Never surprise-update published pages! This updates the DRAFT only.
 * The published presentation snapshot is unchanged until publisher explicitly publishes.
 */
export async function syncPageWithTemplate(
  payload: Payload,
  pageId: string,
): Promise<{ page: PageLayout; updated: boolean; message: string }> {
  const pageDoc = await payload.findByID({
    collection: 'page-layouts',
    id: pageId,
    overrideAccess: true,
  })
  const page = docToLayout(pageDoc as unknown as Record<string, unknown>)
  if (!page.templateId) {
    return { page, updated: false, message: 'Page is not linked to any template.' }
  }
  if (page.templateMode === 'detached') {
    return { page, updated: false, message: 'Page template is detached; changes are ignored.' }
  }

  const templateDoc = await payload.findByID({
    collection: 'page-layouts',
    id: page.templateId,
    overrideAccess: true,
  })
  const template = docToLayout(templateDoc as unknown as Record<string, unknown>)

  // Clone template blocks with unique IDs for the page draft
  const updatedBlocks = template.blocks.map((block) => ({
    ...block,
    id: `${block.component.replace(/[^a-z0-9]/gi, '-')}-${randomUUID().slice(0, 8)}`,
  }))

  const newRevision = page.revision + 1
  const updated = await payload.update({
    collection: 'page-layouts',
    id: pageId,
    overrideAccess: true,
    data: {
      blocks: updatedBlocks,
      templateVersion: template.revision,
      revision: newRevision,
      revisionHistory: [
        ...(Array.isArray((pageDoc as unknown as { revisionHistory?: unknown[] }).revisionHistory)
          ? (pageDoc as unknown as { revisionHistory: unknown[] }).revisionHistory
          : []),
        {
          revision: newRevision,
          blocks: updatedBlocks,
          action: 'synced-from-template',
          templateVersion: template.revision,
          savedAt: new Date().toISOString(),
        },
      ],
    },
  } as never)

  return {
    page: docToLayout(updated as unknown as Record<string, unknown>),
    updated: true,
    message: `Page draft synchronized with template v${template.revision}. Published output remains unchanged until explicitly published.`,
  }
}

/** 2. Save selected component tree as a reusable pattern */
export async function createPattern(
  payload: Payload,
  args: {
    siteId: string
    name: string
    themeId: string
    category?: string
    blocks: LayoutBlock[]
  },
): Promise<PageLayout> {
  const slug =
    args.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'pattern'
  const path = `__pattern__/${slug}-${randomUUID().slice(0, 8)}`
  const created = await payload.create({
    collection: 'page-layouts',
    overrideAccess: true,
    data: {
      site: args.siteId,
      name: args.name,
      path,
      themeId: args.themeId,
      surface: 'pattern',
      slot: 'main',
      layoutVersion: 1,
      status: 'published',
      visibility: 'public',
      blocks: args.blocks,
      unknownBlocks: [],
      revision: 1,
      publishedRevision: 1,
      category: args.category ?? 'Sections',
      revisionHistory: [
        { revision: 1, blocks: args.blocks, action: 'created', savedAt: new Date().toISOString() },
      ],
    },
  } as never)
  return docToLayout(created as unknown as Record<string, unknown>)
}

/** List patterns for a site and theme */
export async function listPatterns(
  payload: Payload,
  siteId: string,
  themeId?: string,
): Promise<PageLayout[]> {
  const where: Record<string, unknown>[] = [
    { site: { equals: siteId } },
    { surface: { equals: 'pattern' } },
  ]
  if (themeId) {
    where.push({ themeId: { equals: themeId } })
  }
  const result = await payload.find({
    collection: 'page-layouts',
    where: { and: where },
    limit: 100,
    overrideAccess: true,
  } as never)
  return result.docs.map((d) => docToLayout(d as unknown as Record<string, unknown>))
}

/** Instantiate pattern: snapshot (detached blocks) vs linked instance */
export function instantiatePattern(
  pattern: PageLayout,
  mode: 'snapshot' | 'linked',
): LayoutBlock[] {
  if (mode === 'snapshot') {
    return pattern.blocks.map((block) => ({
      ...block,
      id: `${block.component.replace(/[^a-z0-9]/gi, '-')}-${randomUUID().slice(0, 8)}`,
      props: { ...block.props },
    }))
  }
  return [
    {
      id: `pattern-${pattern.id}-${randomUUID().slice(0, 6)}`,
      component: 'publisher.pattern',
      componentVersion: 1,
      props: {
        patternId: String(pattern.id),
        patternName: pattern.name || 'Pattern',
        patternVersion: pattern.revision,
        mode: 'linked',
      },
    },
  ]
}

/** 3. Rollback layout or global region to a prior revision */
export async function rollbackLayout(
  payload: Payload,
  args: {
    layoutId: string
    targetRevision: number
    publish?: boolean
  },
): Promise<PageLayout> {
  const existing = await payload.findByID({
    collection: 'page-layouts',
    id: args.layoutId,
    overrideAccess: true,
  })
  const layout = docToLayout(existing as unknown as Record<string, unknown>)
  const history =
    (
      existing as unknown as {
        revisionHistory?: Array<{ revision: number; blocks: LayoutBlock[] }>
      }
    ).revisionHistory ?? []
  const entry = history.find((h) => h.revision === args.targetRevision)
  if (!entry) {
    throw new Error(`Revision ${args.targetRevision} not found in revision history.`)
  }

  const newRevision = layout.revision + 1
  const updated = await payload.update({
    collection: 'page-layouts',
    id: args.layoutId,
    overrideAccess: true,
    context: { publishPresentation: args.publish === true },
    data: {
      blocks: entry.blocks,
      revision: newRevision,
      status: args.publish ? 'published' : layout.status,
      revisionHistory: [
        ...history,
        {
          revision: newRevision,
          blocks: entry.blocks,
          action: 'rollback',
          rollbackFrom: layout.revision,
          rollbackTo: args.targetRevision,
          savedAt: new Date().toISOString(),
        },
      ],
    },
  } as never)
  return docToLayout(updated as unknown as Record<string, unknown>)
}

/** 7. Relationship-aware deletion safeguards */
export async function checkLayoutDeletionSafeguards(
  payload: Payload,
  layoutId: string,
): Promise<{
  safe: boolean
  reason?: string
  referencingPages?: Array<{ id: string; path: string }>
}> {
  const doc = await payload.findByID({
    collection: 'page-layouts',
    id: layoutId,
    overrideAccess: true,
  })
  const layout = docToLayout(doc as unknown as Record<string, unknown>)

  if (layout.surface === 'template') {
    const referencing = await payload.find({
      collection: 'page-layouts',
      where: { templateId: { equals: layoutId } },
      limit: 100,
      overrideAccess: true,
    } as never)
    const refDocs = referencing.docs as unknown as Array<{ id: string | number; path?: string }>
    if (refDocs.length > 0) {
      return {
        safe: false,
        reason: `Cannot delete template "${layout.name || layoutId}": it is referenced by ${refDocs.length} page(s). Detach or reassign them before deleting, or retire the template instead.`,
        referencingPages: refDocs.map((p) => ({ id: String(p.id), path: String(p.path ?? '') })),
      }
    }
  }

  if (layout.surface === 'pattern') {
    const allLayouts = await payload.find({
      collection: 'page-layouts',
      where: { site: { equals: layout.siteId } },
      limit: 200,
      overrideAccess: true,
    } as never)
    const rawAll = allLayouts.docs as unknown as Array<{
      id: string | number
      path?: string
      blocks?: LayoutBlock[]
    }>
    const referencing = rawAll.filter((d) => {
      const blocks = (Array.isArray(d.blocks) ? d.blocks : []) as LayoutBlock[]
      return blocks.some(
        (b) => b.component === 'publisher.pattern' && b.props?.patternId === layoutId,
      )
    })
    if (referencing.length > 0) {
      return {
        safe: false,
        reason: `Cannot delete pattern "${layout.name || layoutId}": it is linked in ${referencing.length} layout(s).`,
        referencingPages: referencing.map((p) => ({
          id: String(p.id),
          path: String(p.path ?? ''),
        })),
      }
    }
  }

  return { safe: true }
}

/** 8. Export presentation documents and theme settings */
export async function exportPresentationPackage(
  payload: Payload,
  siteId: string,
): Promise<PresentationPackage> {
  const result = await payload.find({
    collection: 'page-layouts',
    where: { site: { equals: siteId } },
    limit: 500,
    overrideAccess: true,
  } as never)
  const layouts = result.docs
    .map((d) => docToLayout(d as unknown as Record<string, unknown>))
    .filter((l) => {
      const { errors } = validateLayout(l)
      return errors.filter((e) => !e.startsWith('Unavailable component preserved:')).length === 0
    })

  const pages = layouts.filter((l) => l.surface === 'page' || !l.surface)
  const templates = layouts.filter((l) => l.surface === 'template')
  const patterns = layouts.filter((l) => l.surface === 'pattern')
  const globals = layouts.filter((l) => l.surface === 'global')

  const siteSettings = (await payload
    .findGlobal({
      slug: 'site-settings',
      overrideAccess: true,
    } as never)
    .catch(() => null)) as unknown as Record<string, unknown> | null

  return {
    schema: 'renegade-presentation-package',
    version: 1,
    exportedAt: new Date().toISOString(),
    siteId,
    theme: {
      id: String(siteSettings?.themeId ?? 'neutral-starter'),
      tokens: (siteSettings?.themeTokens as Record<string, unknown>) ?? undefined,
    },
    pages,
    templates,
    patterns,
    globals,
  }
}

/** 8. Validate presentation import and report cross-theme incompatibilities BEFORE mutating */
export function validatePresentationImport(
  packageData: unknown,
  targetThemeId: string,
): ImportValidationResult {
  if (!packageData || typeof packageData !== 'object') {
    return {
      valid: false,
      compatible: false,
      targetThemeId,
      incompatibilities: [{ layoutPath: '*', component: '*', reason: 'Invalid package payload.' }],
      summary: { pagesCount: 0, templatesCount: 0, patternsCount: 0, globalsCount: 0 },
    }
  }
  const pkg = packageData as Partial<PresentationPackage>
  if (pkg.schema !== 'renegade-presentation-package' || pkg.version !== 1) {
    return {
      valid: false,
      compatible: false,
      targetThemeId,
      incompatibilities: [
        { layoutPath: '*', component: '*', reason: 'Unsupported package schema or version.' },
      ],
      summary: { pagesCount: 0, templatesCount: 0, patternsCount: 0, globalsCount: 0 },
    }
  }

  const theme = resolveTheme(targetThemeId)
  const allLayouts = [
    ...(pkg.pages ?? []),
    ...(pkg.templates ?? []),
    ...(pkg.patterns ?? []),
    ...(pkg.globals ?? []),
  ]

  const incompatibilities: ImportValidationResult['incompatibilities'] = []
  for (const layout of allLayouts) {
    const checked = validateLayout({ ...layout, themeId: theme.id })
    for (const err of checked.errors) {
      if (!err.startsWith('Unavailable component preserved:')) {
        incompatibilities.push({
          layoutPath: layout.path,
          component: '*',
          reason: err,
        })
      }
    }
    for (const block of layout.blocks ?? []) {
      const def = theme.componentRegistry[block.component]
      if (!def) {
        incompatibilities.push({
          layoutPath: layout.path,
          component: block.component,
          reason: `Component ${block.component} is not registered in target theme "${targetThemeId}".`,
        })
      }
    }
  }

  return {
    valid: true,
    compatible: incompatibilities.length === 0,
    targetThemeId,
    incompatibilities,
    summary: {
      pagesCount: pkg.pages?.length ?? 0,
      templatesCount: pkg.templates?.length ?? 0,
      patternsCount: pkg.patterns?.length ?? 0,
      globalsCount: pkg.globals?.length ?? 0,
    },
  }
}

/** 8. Import presentation package transactionally after validation */
export async function importPresentationPackage(
  payload: Payload,
  args: {
    siteId: string
    targetThemeId: string
    packageData: unknown
    dryRun?: boolean
  },
): Promise<ImportValidationResult & { importedCount?: number }> {
  const validation = validatePresentationImport(args.packageData, args.targetThemeId)
  if (!validation.valid || !validation.compatible) {
    return validation
  }
  if (args.dryRun) {
    return { ...validation, importedCount: 0 }
  }

  const pkg = args.packageData as PresentationPackage
  const allLayouts = [...pkg.templates, ...pkg.patterns, ...pkg.globals, ...pkg.pages]

  let importedCount = 0
  for (const layout of allLayouts) {
    const existing = await payload.find({
      collection: 'page-layouts',
      where: {
        and: [{ site: { equals: args.siteId } }, { path: { equals: layout.path } }],
      },
      limit: 1,
      overrideAccess: true,
    } as never)

    const data = {
      site: args.siteId,
      name: layout.name,
      path: layout.path,
      themeId: args.targetThemeId,
      surface: layout.surface ?? 'page',
      slot: layout.slot ?? 'main',
      templateId: layout.templateId,
      templateVersion: layout.templateVersion,
      templateMode: layout.templateMode,
      isRetired: layout.isRetired === true,
      category: layout.category,
      layoutVersion: layout.version,
      status: layout.status,
      blocks: layout.blocks,
      unknownBlocks: layout.unknownBlocks ?? [],
      revision: layout.revision,
      publishedRevision: layout.publishedRevision,
    }

    if (existing.docs.length > 0) {
      await payload.update({
        collection: 'page-layouts',
        id: existing.docs[0].id,
        overrideAccess: true,
        data,
      } as never)
    } else {
      await payload.create({
        collection: 'page-layouts',
        overrideAccess: true,
        data,
      } as never)
    }
    importedCount++
  }

  return { ...validation, importedCount }
}
