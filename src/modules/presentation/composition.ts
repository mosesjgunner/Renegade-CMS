import { randomUUID } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'

import { transactionPayload } from '../core/transaction-payload'
import { checkOperatorSiteAccess } from '../operations/operator-grants'
import { adapterForContentType, registeredContentTypeKeys } from './domain-templates'
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
  if (template.siteId !== siteId || template.surface !== 'template')
    throw new Error('Template scope mismatch.')
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
    /** Domain type the page will serve; validated against its adapter (S2-08). */
    contentTypeKey?: string
  },
): Promise<PageLayout> {
  const templateDoc = await payload.findByID({
    collection: 'page-layouts',
    id: args.templateId,
    overrideAccess: true,
  })
  const template = docToLayout(templateDoc as unknown as Record<string, unknown>)
  if (template.siteId !== args.siteId || template.surface !== 'template')
    throw new Error('Template scope mismatch.')
  if (template.isRetired) {
    throw new Error('Retired templates cannot be used to create new pages.')
  }
  if (args.contentTypeKey) {
    const adapter = adapterForContentType(args.contentTypeKey)
    // A required canonical body slot cannot silently degrade: a template
    // that lacks it is refused for this type, by name.
    if (
      adapter.canonicalBlockComponent &&
      !template.blocks.some((block) => block.component === adapter.canonicalBlockComponent)
    )
      throw new Error(
        `Template does not provide the canonical ${args.contentTypeKey} body slot (${adapter.canonicalBlockComponent}).`,
      )
  }

  // Block ids are preserved from the template: they are unique within the
  // new page, and the stable identity is what lets template sync tell an
  // inherited block from a local one (S2-08). Pattern instantiation keeps
  // its own fresh ids because many patterns can land on one page.
  const clonedBlocks = template.blocks.map((block) => structuredClone(block))

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

export type TemplateSyncConflict = {
  blockId: string
  component: string
  reason:
    | 'locally-modified'
    | 'canonical-body-preserved'
    | 'modified-locally-template-removed'
    | 'unverifiable-local-state'
}

export type TemplateSyncReport = {
  updated: string[]
  added: string[]
  removed: string[]
  kept: string[]
  conflicts: TemplateSyncConflict[]
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`
}

const blockFingerprint = (block: LayoutBlock): string =>
  stableStringify({
    component: block.component,
    componentVersion: block.componentVersion,
    props: block.props,
    hidden: block.hidden ?? false,
    visible: block.visible ?? null,
  })

const CANONICAL_COMPONENTS = new Set(
  registeredContentTypeKeys()
    .map((key) => adapterForContentType(key).canonicalBlockComponent)
    .filter((component): component is string => Boolean(component)),
)

/**
 * Synchronize template changes to a page draft as a three-way merge
 * (S2-08): the template revision the page last synced from is the base.
 * Inherited blocks the page never touched follow the template; blocks
 * the page modified are kept and reported as conflicts; canonical body
 * blocks (e.g. the article editorial slot) are always the page's own;
 * locally added blocks survive. Without a readable base the merge stays
 * conservative — nothing local is ever dropped.
 *
 * INVARIANT: Never surprise-update published pages! This updates the
 * DRAFT only; the published snapshot and publishedRevision are untouched
 * until the publisher explicitly publishes.
 */
export async function syncPageWithTemplate(
  payload: Payload,
  pageId: string,
): Promise<{
  page: PageLayout
  updated: boolean
  message: string
  conflicts: TemplateSyncConflict[]
  changes: TemplateSyncReport
}> {
  const empty: TemplateSyncReport = { updated: [], added: [], removed: [], kept: [], conflicts: [] }
  const pageDoc = await payload.findByID({
    collection: 'page-layouts',
    id: pageId,
    overrideAccess: true,
  })
  const page = docToLayout(pageDoc as unknown as Record<string, unknown>)
  if (!page.templateId) {
    return {
      page,
      updated: false,
      message: 'Page is not linked to any template.',
      conflicts: empty.conflicts,
      changes: empty,
    }
  }
  if (page.templateMode === 'detached') {
    return {
      page,
      updated: false,
      message: 'Page template is detached; changes are ignored.',
      conflicts: empty.conflicts,
      changes: empty,
    }
  }

  const templateDoc = await payload.findByID({
    collection: 'page-layouts',
    id: page.templateId,
    overrideAccess: true,
  })
  const template = docToLayout(templateDoc as unknown as Record<string, unknown>)
  if (template.siteId !== page.siteId || template.surface !== 'template')
    throw new Error('Template scope mismatch.')

  const templateHistory = Array.isArray(
    (templateDoc as unknown as { revisionHistory?: unknown[] }).revisionHistory,
  )
    ? ((
        templateDoc as unknown as {
          revisionHistory: Array<{ revision: number; blocks: LayoutBlock[] }>
        }
      ).revisionHistory ?? [])
    : []
  const baseEntry = templateHistory.find((entry) => entry.revision === (page.templateVersion ?? 1))
  const baseById = new Map((baseEntry?.blocks ?? []).map((block) => [block.id, block]))
  const hasBase = Boolean(baseEntry)
  const pageById = new Map(page.blocks.map((block) => [block.id, block]))
  const templateIds = new Set(template.blocks.map((block) => block.id))

  const report: TemplateSyncReport = {
    updated: [],
    added: [],
    removed: [],
    kept: [],
    conflicts: [],
  }
  const merged: LayoutBlock[] = []

  for (const templateBlock of template.blocks) {
    const pageBlock = pageById.get(templateBlock.id)
    if (!pageBlock) {
      merged.push(structuredClone(templateBlock))
      report.added.push(templateBlock.id)
      continue
    }
    const base = baseById.get(templateBlock.id)
    const pagePrint = blockFingerprint(pageBlock)
    if (CANONICAL_COMPONENTS.has(pageBlock.component)) {
      // The canonical body belongs to the page's content, never the template.
      merged.push(pageBlock)
      report.kept.push(pageBlock.id)
      if (pagePrint !== blockFingerprint(templateBlock))
        report.conflicts.push({
          blockId: pageBlock.id,
          component: pageBlock.component,
          reason: 'canonical-body-preserved',
        })
      continue
    }
    if (base && pagePrint === blockFingerprint(base)) {
      if (pagePrint !== blockFingerprint(templateBlock)) {
        merged.push(structuredClone(templateBlock))
        report.updated.push(templateBlock.id)
      } else {
        merged.push(pageBlock)
        report.kept.push(pageBlock.id)
      }
      continue
    }
    // Locally modified (or unverifiable): the page's version wins.
    merged.push(pageBlock)
    report.kept.push(pageBlock.id)
    if (base) {
      report.conflicts.push({
        blockId: pageBlock.id,
        component: pageBlock.component,
        reason: 'locally-modified',
      })
    } else if (hasBase && pagePrint !== blockFingerprint(templateBlock)) {
      report.conflicts.push({
        blockId: pageBlock.id,
        component: pageBlock.component,
        reason: 'unverifiable-local-state',
      })
    }
  }

  for (const pageBlock of page.blocks) {
    if (templateIds.has(pageBlock.id)) continue
    const base = baseById.get(pageBlock.id)
    if (base && blockFingerprint(pageBlock) === blockFingerprint(base)) {
      // Untouched inherited block the template removed: it goes away.
      report.removed.push(pageBlock.id)
      continue
    }
    merged.push(pageBlock)
    report.kept.push(pageBlock.id)
    if (base)
      report.conflicts.push({
        blockId: pageBlock.id,
        component: pageBlock.component,
        reason: 'modified-locally-template-removed',
      })
  }

  const changed =
    report.updated.length > 0 ||
    report.added.length > 0 ||
    report.removed.length > 0 ||
    (page.templateVersion ?? 1) !== template.revision
  if (!changed) {
    return {
      page,
      updated: false,
      message: `Page draft is already synchronized with template v${template.revision}.`,
      conflicts: report.conflicts,
      changes: report,
    }
  }

  const newRevision = page.revision + 1
  const updated = await payload.update({
    collection: 'page-layouts',
    id: pageId,
    overrideAccess: true,
    data: {
      blocks: merged,
      templateVersion: template.revision,
      revision: newRevision,
      revisionHistory: [
        ...(Array.isArray((pageDoc as unknown as { revisionHistory?: unknown[] }).revisionHistory)
          ? (pageDoc as unknown as { revisionHistory: unknown[] }).revisionHistory
          : []),
        {
          revision: newRevision,
          blocks: merged,
          action: 'synced-from-template',
          templateVersion: template.revision,
          conflicts: report.conflicts,
          savedAt: new Date().toISOString(),
        },
      ],
    },
  } as never)

  return {
    page: docToLayout(updated as unknown as Record<string, unknown>),
    updated: true,
    message:
      `Page draft synchronized with template v${template.revision}: ` +
      `${report.updated.length} updated, ${report.added.length} added, ${report.removed.length} removed, ` +
      `${report.conflicts.length} local override(s) kept. ` +
      'Published output remains unchanged until explicitly published.',
    conflicts: report.conflicts,
    changes: report,
  }
}

/**
 * Detach a page from its template (S2-08): the page keeps its current
 * blocks as its own and future template changes no longer apply. The
 * template link stays on the record as provenance.
 */
export async function detachPageFromTemplate(
  payload: Payload,
  pageId: string,
): Promise<PageLayout> {
  const pageDoc = await payload.findByID({
    collection: 'page-layouts',
    id: pageId,
    overrideAccess: true,
  })
  const page = docToLayout(pageDoc as unknown as Record<string, unknown>)
  if (!page.templateId) throw new Error('Page is not linked to any template.')
  if (page.templateMode === 'detached') return page
  const newRevision = page.revision + 1
  const updated = await payload.update({
    collection: 'page-layouts',
    id: pageId,
    overrideAccess: true,
    data: {
      templateMode: 'detached',
      revision: newRevision,
      revisionHistory: [
        ...(Array.isArray((pageDoc as unknown as { revisionHistory?: unknown[] }).revisionHistory)
          ? (pageDoc as unknown as { revisionHistory: unknown[] }).revisionHistory
          : []),
        {
          revision: newRevision,
          blocks: page.blocks,
          action: 'detached-from-template',
          templateId: page.templateId,
          templateVersion: page.templateVersion,
          savedAt: new Date().toISOString(),
        },
      ],
    },
  } as never)
  return docToLayout(updated as unknown as Record<string, unknown>)
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
    req?: PayloadRequest
  },
): Promise<PageLayout> {
  const existing = await payload.findByID({
    collection: 'page-layouts',
    id: args.layoutId,
    overrideAccess: args.req ? false : true,
    req: args.req,
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
    overrideAccess: args.req ? false : true,
    req: args.req,
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

/** Raised when a presentation import targets a site the caller holds no grant for. */
export class PresentationImportAccessError extends Error {
  constructor(siteId: string) {
    super(`Presentation import is not authorized for site "${siteId}".`)
    this.name = 'PresentationImportAccessError'
  }
}

export type PresentationImportConflict = {
  layoutPath: string
  targetRevision: number
  packageRevision: number
}

export type PresentationImportResult = ImportValidationResult & {
  importedCount: number
  conflicts: PresentationImportConflict[]
}

type PreparedImportLayout = {
  layout: PageLayout
  existing?: Record<string, unknown>
  /** Target-site template id when the reference already exists in the target. */
  templateTargetId?: string
  /** Blocks with link/media references already rebound to the target site. */
  blocks: LayoutBlock[]
  /** Package layout ids that must be written before this layout. */
  dependsOn: Set<string>
}

function isReferenceValue(
  value: unknown,
): value is { id: string; siteId: string; label?: string; href?: string } {
  if (!value || typeof value !== 'object') return false
  const ref = value as Record<string, unknown>
  return typeof ref.id === 'string' && typeof ref.siteId === 'string'
}

async function findTargetLayout(
  payload: Payload,
  siteId: string,
  where: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> {
  const result = await payload.find({
    collection: 'page-layouts',
    where: { and: [{ site: { equals: siteId } }, where] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  return (result.docs[0] as unknown as Record<string, unknown>) ?? undefined
}

/**
 * Resolve every reference a package layout makes against the authorized target
 * site. Package-internal template/pattern identities become write-order
 * dependencies; link/media references are rebound to target records by
 * canonical path / filename, mirroring starter binding. Anything that cannot
 * resolve inside the target site is an incompatibility — an import never
 * writes a reference that points at another site's records.
 */
async function prepareImportLayouts(
  payload: Payload,
  args: { siteId: string; layouts: PageLayout[] },
): Promise<{
  prepared: PreparedImportLayout[]
  conflicts: PresentationImportConflict[]
  incompatibilities: ImportValidationResult['incompatibilities']
}> {
  const packageIds = new Set(args.layouts.map((layout) => layout.id))
  const seenPaths = new Set<string>()
  const prepared: PreparedImportLayout[] = []
  const conflicts: PresentationImportConflict[] = []
  const incompatibilities: ImportValidationResult['incompatibilities'] = []

  for (const layout of args.layouts) {
    if (seenPaths.has(layout.path)) {
      incompatibilities.push({
        layoutPath: layout.path,
        component: '*',
        reason: `Package contains more than one layout for path "${layout.path}".`,
      })
      continue
    }
    seenPaths.add(layout.path)

    const existing = await findTargetLayout(payload, args.siteId, {
      path: { equals: layout.path },
    })
    if (existing) {
      const targetRevision = Number(existing.revision ?? 1)
      if (targetRevision !== layout.revision) {
        conflicts.push({
          layoutPath: layout.path,
          targetRevision,
          packageRevision: layout.revision,
        })
      }
    }

    const dependsOn = new Set<string>()
    let templateTargetId: string | undefined
    if (layout.templateId) {
      if (packageIds.has(layout.templateId)) {
        dependsOn.add(layout.templateId)
      } else {
        const target = await findTargetLayout(payload, args.siteId, {
          id: { equals: layout.templateId },
        })
        if (!target) {
          incompatibilities.push({
            layoutPath: layout.path,
            component: '*',
            reason: `Template "${layout.templateId}" is not part of the package and does not exist in the target site.`,
          })
        } else {
          templateTargetId = String(target.id)
        }
      }
    }

    const blocks = structuredClone(layout.blocks ?? []) as LayoutBlock[]
    for (const block of blocks) {
      if (block.component === 'publisher.pattern') {
        const patternId = block.props?.patternId
        if (typeof patternId === 'string' && patternId) {
          if (packageIds.has(patternId)) {
            dependsOn.add(patternId)
          } else {
            const target = await findTargetLayout(payload, args.siteId, {
              id: { equals: patternId },
            })
            if (!target) {
              incompatibilities.push({
                layoutPath: layout.path,
                component: block.component,
                reason: `Pattern "${patternId}" is not part of the package and does not exist in the target site.`,
              })
            }
          }
        }
        continue
      }
      for (const field of ['link', 'media'] as const) {
        const reference = block.props?.[field]
        if (!isReferenceValue(reference)) continue
        if (reference.siteId === args.siteId) {
          const collection = field === 'link' ? 'content' : 'media-assets'
          const recordId = reference.id.startsWith('content:')
            ? reference.id.slice('content:'.length)
            : reference.id
          const found = await payload.find({
            collection,
            where: {
              and: [{ id: { equals: recordId } }, { site: { equals: args.siteId } }],
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          } as never)
          if (found.docs.length === 0) {
            incompatibilities.push({
              layoutPath: layout.path,
              component: block.component,
              reason: `Referenced ${field} "${reference.id}" does not exist in the target site.`,
            })
          }
          continue
        }
        // Foreign reference: rebind to a target record by its stable address.
        if (field === 'link') {
          const href = typeof reference.href === 'string' ? reference.href : ''
          const found = await payload.find({
            collection: 'content',
            where: {
              and: [{ site: { equals: args.siteId } }, { canonicalPath: { equals: href } }],
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          } as never)
          const doc = found.docs[0] as unknown as Record<string, unknown> | undefined
          if (!doc) {
            incompatibilities.push({
              layoutPath: layout.path,
              component: block.component,
              reason: `Linked content "${href}" is not available in the target site.`,
            })
          } else {
            block.props[field] = {
              id: `content:${String(doc.id)}`,
              siteId: args.siteId,
              label: reference.label ?? String(doc.title ?? href),
              href,
            }
          }
        } else {
          const href = typeof reference.href === 'string' ? reference.href : ''
          const filename = href.split('/').filter(Boolean).pop() ?? href
          const found = await payload.find({
            collection: 'media-assets',
            where: {
              and: [
                { site: { equals: args.siteId } },
                {
                  or: [
                    { originalFilename: { equals: filename } },
                    { filename: { equals: filename } },
                  ],
                },
              ],
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          } as never)
          const doc = found.docs[0] as unknown as Record<string, unknown> | undefined
          if (!doc) {
            incompatibilities.push({
              layoutPath: layout.path,
              component: block.component,
              reason: `Referenced media "${filename}" is not available in the target site.`,
            })
          } else {
            block.props[field] = {
              id: String(doc.id),
              siteId: args.siteId,
              label: reference.label ?? filename,
              href,
            }
          }
        }
      }
    }

    prepared.push({ layout, existing, templateTargetId, blocks, dependsOn })
  }

  return { prepared, conflicts, incompatibilities }
}

function remapPatternReferences(blocks: LayoutBlock[], idMap: Map<string, string>): LayoutBlock[] {
  return blocks.map((block) => {
    if (block.component !== 'publisher.pattern') return block
    const patternId = block.props?.patternId
    if (typeof patternId !== 'string' || !idMap.has(patternId)) return block
    return { ...block, props: { ...block.props, patternId: idMap.get(patternId) } }
  })
}

/**
 * 8. Import a presentation package into one authorized site.
 *
 * Boundary contract (S2-01): the caller's grant for the target site is
 * enforced before any validation or write; every write runs inside one
 * database transaction with the authenticated request context, so a failed
 * batch leaves no partial graph; imported template/pattern/media identities
 * are remapped to target identities; results land as drafts — a published
 * source never publishes the target, and updating a published target record
 * changes only its draft, leaving the published revision and snapshot in
 * place; a target record whose revision has moved since the package was
 * produced is a conflict and is never overwritten.
 */
export async function importPresentationPackage(
  payload: Payload,
  args: {
    siteId: string
    targetThemeId: string
    packageData: unknown
    dryRun?: boolean
    user?: Parameters<typeof checkOperatorSiteAccess>[1]
    req?: PayloadRequest
  },
): Promise<PresentationImportResult> {
  if (args.user) {
    const allowed = await checkOperatorSiteAccess(payload, args.user, args.siteId, args.req)
    if (!allowed) throw new PresentationImportAccessError(args.siteId)
  }

  const validation = validatePresentationImport(args.packageData, args.targetThemeId)
  if (!validation.valid || !validation.compatible) {
    return { ...validation, importedCount: 0, conflicts: [] }
  }

  const pkg = args.packageData as PresentationPackage
  const allLayouts = [...pkg.templates, ...pkg.patterns, ...pkg.globals, ...pkg.pages]

  if (args.dryRun) {
    const { conflicts, incompatibilities } = await prepareImportLayouts(payload, {
      siteId: args.siteId,
      layouts: allLayouts,
    })
    return {
      ...validation,
      compatible: incompatibilities.length === 0,
      incompatibilities: [...validation.incompatibilities, ...incompatibilities],
      importedCount: 0,
      conflicts,
    }
  }

  const providedTransactionID = args.req?.transactionID
  let transactionID: string | number | undefined =
    typeof providedTransactionID === 'string' || typeof providedTransactionID === 'number'
      ? providedTransactionID
      : undefined
  const ownsTransaction = !transactionID
  if (ownsTransaction) {
    transactionID = (await payload.db.beginTransaction()) ?? undefined
    if (!transactionID) {
      throw new Error('Presentation import requires transactional storage.')
    }
  }
  const req = {
    ...(args.req ?? {}),
    ...(transactionID ? { transactionID } : {}),
    ...(args.user ? { user: args.user } : {}),
  } as PayloadRequest
  const tx = transactionPayload(payload, req)
  // With an authenticated caller, collection access (operator site grants)
  // evaluates every write as a second, independent enforcement layer.
  const overrideAccess = !args.user

  try {
    const { prepared, conflicts, incompatibilities } = await prepareImportLayouts(tx, {
      siteId: args.siteId,
      layouts: allLayouts,
    })
    if (conflicts.length > 0 || incompatibilities.length > 0) {
      if (ownsTransaction && transactionID) {
        await payload.db.rollbackTransaction(transactionID).catch(() => undefined)
      }
      return {
        ...validation,
        compatible: incompatibilities.length === 0,
        incompatibilities: [...validation.incompatibilities, ...incompatibilities],
        importedCount: 0,
        conflicts,
      }
    }

    const idMap = new Map<string, string>()
    const pending = [...prepared]
    let importedCount = 0
    while (pending.length > 0) {
      let progressed = false
      for (let index = pending.length - 1; index >= 0; index--) {
        const item = pending[index]
        if (![...item.dependsOn].every((id) => idMap.has(id))) continue
        const { layout } = item
        const blocks = remapPatternReferences(item.blocks, idMap)
        const templateId = layout.templateId
          ? (idMap.get(layout.templateId) ?? item.templateTargetId)
          : undefined
        const historyEntry = {
          revision: layout.revision,
          blocks,
          unknownBlocks: layout.unknownBlocks ?? [],
          action: 'imported',
          source: 'presentation-import',
          savedAt: new Date().toISOString(),
        }
        const baseData = {
          site: args.siteId,
          name: layout.name,
          path: layout.path,
          themeId: args.targetThemeId,
          surface: layout.surface ?? 'page',
          slot: layout.slot ?? 'main',
          templateId,
          templateVersion: layout.templateVersion,
          templateMode: layout.templateMode,
          isRetired: layout.isRetired === true,
          category: layout.category,
          layoutVersion: layout.version,
          blocks,
          unknownBlocks: layout.unknownBlocks ?? [],
          revision: layout.revision,
        }
        let targetId: string
        if (item.existing) {
          // Draft-only update: status, publishedRevision and the published
          // snapshot are omitted on purpose so public output keeps serving
          // the previously published revision.
          const priorHistory = Array.isArray(item.existing.revisionHistory)
            ? (item.existing.revisionHistory as unknown[])
            : []
          const updated = await tx.update({
            collection: 'page-layouts',
            id: String(item.existing.id),
            overrideAccess,
            req,
            data: { ...baseData, revisionHistory: [...priorHistory, historyEntry] },
          } as never)
          targetId = String((updated as unknown as Record<string, unknown>).id)
        } else {
          const created = await tx.create({
            collection: 'page-layouts',
            overrideAccess,
            req,
            data: { ...baseData, status: 'draft', revisionHistory: [historyEntry] },
          } as never)
          targetId = String((created as unknown as Record<string, unknown>).id)
        }
        idMap.set(layout.id, targetId)
        pending.splice(index, 1)
        importedCount++
        progressed = true
      }
      if (!progressed) {
        throw new Error('Presentation import contains unresolvable layout references.')
      }
    }

    if (ownsTransaction && transactionID) {
      await payload.db.commitTransaction(transactionID)
    }
    return { ...validation, importedCount, conflicts: [] }
  } catch (error) {
    if (ownsTransaction && transactionID) {
      await payload.db.rollbackTransaction(transactionID).catch(() => undefined)
    }
    throw error
  }
}
