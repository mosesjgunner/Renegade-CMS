import type { Payload } from 'payload'

import { slotFieldNames, type LayoutBlock } from '../public/page-builder'
import { adapterForContentType, registeredContentTypeKeys } from './domain-templates'
import { preflight, type Configuration } from './lifecycle'
import type { InstalledTheme } from './packages'
import { resolveTemplate, resolveTheme } from './registry'
import { readPublishedPresentation } from './snapshots'

export type CompatibilityIssue = {
  layoutId: string
  path?: string
  surface?: string
  blockId?: string
  component?: string
  reason: string
}

export type SiteCompatibilityReport = {
  siteId: string
  configuration: { id: string; version: string; renderer: string }
  inventory: {
    publishedPages: number
    globalRegions: number
    templates: number
    patterns: number
    linkedPatternInstances: number
  }
  assets: { declared: number; verified: boolean }
  blockers: CompatibilityIssue[]
  warnings: CompatibilityIssue[]
}

type StoreDoc = Record<string, unknown>

const CANONICAL_COMPONENTS = new Set(
  registeredContentTypeKeys()
    .map((key) => adapterForContentType(key).canonicalBlockComponent)
    .filter((component): component is string => Boolean(component)),
)

const docSite = (doc: StoreDoc): string =>
  typeof doc.site === 'string' ? doc.site : String((doc.site as { id?: unknown })?.id ?? '')

/** The slots a record actually published: its frozen snapshot when one
 * exists, else the revision-history entry at the published revision,
 * else the record's blocks when the record is its published revision. */
function publishedSlots(record: StoreDoc): Partial<Record<string, LayoutBlock[]>> | null {
  const snapshot = readPublishedPresentation(record.publishedPresentation)
  if (snapshot) return snapshot.document.slots
  const publishedRevision =
    typeof record.publishedRevision === 'number' ? record.publishedRevision : null
  if (!publishedRevision) return null
  const history = Array.isArray(record.revisionHistory)
    ? (record.revisionHistory as StoreDoc[])
    : []
  const entry = history.find((item) => item.revision === publishedRevision)
  if (entry && Array.isArray(entry.blocks)) return { main: entry.blocks as LayoutBlock[] }
  if (record.revision === publishedRevision && Array.isArray(record.blocks))
    return { main: record.blocks as LayoutBlock[] }
  return null
}

/**
 * Site-aware theme compatibility preflight (S2-09).
 *
 * The package-level preflight (lifecycle) proves the package itself is
 * installed, intact and renderable. This one inventories the site's
 * ACTUAL published pages, global regions, templates and linked pattern
 * dependencies and checks them against the candidate renderer:
 *
 * - a required template slot missing from a published record blocks;
 * - a canonical domain block (e.g. the article body) the candidate
 *   cannot render at the stored version blocks — required domain
 *   content must never silently degrade to an empty page;
 * - any other unregistered or version-mismatched block is reported as
 *   an affected record (it renders as a preserved unavailable section);
 * - linked patterns that are missing or unpublished are reported;
 * - declared package assets must be the verified, digest-pinned set
 *   discovery already checked.
 *
 * Activation routes refuse candidates with blockers; warnings ride
 * along in the report so affected records are explicit, never silent.
 */
export async function preflightSiteCompatibility(
  payload: Payload,
  siteId: string,
  configuration: Configuration,
  installed: InstalledTheme[],
): Promise<SiteCompatibilityReport> {
  preflight(configuration, installed)
  const theme = resolveTheme(configuration.renderer)
  const item = installed.find(
    (entry) =>
      entry.package?.id === configuration.id && entry.package.version === configuration.version,
  )
  const result = await payload.find({
    collection: 'page-layouts',
    where: { site: { equals: siteId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  } as never)
  const records = (result.docs as unknown as StoreDoc[]).filter((doc) => docSite(doc) === siteId)
  const patternsById = new Map(
    records.filter((doc) => doc.surface === 'pattern').map((doc) => [String(doc.id), doc]),
  )

  const report: SiteCompatibilityReport = {
    siteId,
    configuration: {
      id: configuration.id,
      version: configuration.version,
      renderer: configuration.renderer,
    },
    inventory: {
      publishedPages: 0,
      globalRegions: 0,
      templates: records.filter((doc) => doc.surface === 'template').length,
      patterns: patternsById.size,
      linkedPatternInstances: 0,
    },
    assets: {
      declared: item?.package?.assets.length ?? 0,
      verified: Boolean(item && !item.error && item.digest === configuration.digest),
    },
    blockers: [],
    warnings: [],
  }

  const checkBlock = (record: StoreDoc, block: LayoutBlock): void => {
    const base = {
      layoutId: String(record.id),
      path: typeof record.path === 'string' ? record.path : undefined,
      surface: typeof record.surface === 'string' ? record.surface : undefined,
      blockId: block.id,
      component: block.component,
    }
    if (block.component === 'publisher.pattern') {
      report.inventory.linkedPatternInstances += 1
      const patternId = typeof block.props.patternId === 'string' ? block.props.patternId : ''
      const pattern = patternId ? patternsById.get(patternId) : undefined
      if (!pattern)
        report.warnings.push({ ...base, reason: 'Linked pattern is missing on this site.' })
      else if (typeof pattern.publishedRevision !== 'number' || pattern.publishedRevision < 1)
        report.warnings.push({ ...base, reason: 'Linked pattern has no published revision.' })
    }
    const definition = theme.componentRegistry[block.component]
    if (!definition) {
      const issue = {
        ...base,
        reason: 'Component is not registered in the candidate theme.',
      }
      if (CANONICAL_COMPONENTS.has(block.component)) report.blockers.push(issue)
      else report.warnings.push(issue)
      return
    }
    if (definition.version !== block.componentVersion) {
      const issue = {
        ...base,
        reason: `Component version ${block.componentVersion} has no migration to candidate version ${definition.version}.`,
      }
      if (CANONICAL_COMPONENTS.has(block.component)) report.blockers.push(issue)
      else report.warnings.push(issue)
    }
    for (const field of slotFieldNames(definition)) {
      const children = block.props[field]
      if (Array.isArray(children))
        for (const child of children as LayoutBlock[]) checkBlock(record, child)
    }
  }

  for (const record of records) {
    if (record.surface === 'template' || record.surface === 'pattern') continue
    const published = typeof record.publishedRevision === 'number' && record.publishedRevision >= 1
    if (!published) continue
    if (record.surface === 'global') report.inventory.globalRegions += 1
    else report.inventory.publishedPages += 1
    const slots = publishedSlots(record)
    if (!slots) {
      report.warnings.push({
        layoutId: String(record.id),
        path: typeof record.path === 'string' ? record.path : undefined,
        surface: typeof record.surface === 'string' ? record.surface : undefined,
        reason: 'Published blocks could not be read for compatibility inventory.',
      })
      continue
    }
    // Mandatory slots of the record's frame template must be present.
    const snapshot = readPublishedPresentation(record.publishedPresentation)
    const frame = snapshot
      ? resolveTemplate(theme, snapshot.document.surface, snapshot.document.template.id)
      : resolveTemplate(theme, 'layout')
    for (const [slotName, slot] of Object.entries(frame.slots)) {
      if (slot.required && !Array.isArray(slots[slotName as keyof typeof slots]))
        report.blockers.push({
          layoutId: String(record.id),
          path: typeof record.path === 'string' ? record.path : undefined,
          surface: typeof record.surface === 'string' ? record.surface : undefined,
          reason: `Required slot missing from published output: ${slotName}.`,
        })
    }
    for (const blocks of Object.values(slots))
      for (const block of blocks ?? []) checkBlock(record, block)
  }

  return report
}
