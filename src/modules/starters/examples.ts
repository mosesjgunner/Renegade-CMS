/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Payload } from 'payload'

import { starterDefinitions } from './definitions'
import {
  contentMatchesInstallChecksum,
  exampleContentChecksum,
  isStarterProvenance,
} from './provenance'
import { blocksMatch, starterBaselineBlocks, toLexicalDocument } from './service'

/**
 * Marked example content (UXI-06): listing and safe removal.
 *
 * An item is a removable example only while it is still exactly what a
 * starter installed:
 *
 * - content: carries starter provenance (`importSourceSystem`) AND
 *   still hashes to its install-time checksum. Records installed
 *   before checksums existed fall back to an exact comparison against
 *   the starter definition (full starters) or, for onboarding-starter
 *   records, to "never modified since creation" (updatedAt ≈
 *   createdAt) — anything else is treated as edited.
 * - layouts: carry a starter baseline in `revisionHistory` AND their
 *   current blocks still match that baseline.
 *
 * Edited items are never deleted or unpublished by removal; they are
 * reported as protected so the operator decides. Operator-created
 * content carries no starter provenance and is never listed at all.
 */

export type StarterExampleItem = {
  id: string
  kind: 'content' | 'layout'
  title: string
  path: string
  edited: boolean
}

export type StarterExamplesPreview = {
  siteId: string
  removable: StarterExampleItem[]
  protectedEdited: StarterExampleItem[]
  removableCount: number
  protectedCount: number
}

function legacyContentEdited(doc: Record<string, unknown>): boolean {
  const system = String(doc.importSourceSystem ?? '')
  if (system.startsWith('starter:')) {
    const starter = starterDefinitions[system.slice('starter:'.length) as never] as
      | (typeof starterDefinitions)[keyof typeof starterDefinitions]
      | undefined
    if (!starter) return true
    const page = starter.pages.find((item) => item.canonicalPath === doc.canonicalPath)
    if (page) {
      return !(
        doc.title === page.title &&
        doc.summary === page.summary &&
        doc.status === page.status &&
        exampleContentChecksum({
          title: doc.title,
          summary: doc.summary,
          status: doc.status,
          body: doc.body,
        }) ===
          exampleContentChecksum({
            title: page.title,
            summary: page.summary,
            status: page.status,
            body: toLexicalDocument(page.body || page.summary || page.title),
          })
      )
    }
    const article = starter.articles.find((item) => item.canonicalPath === doc.canonicalPath)
    if (article) {
      return !(
        doc.title === article.title &&
        doc.summary === article.summary &&
        doc.status === 'published' &&
        exampleContentChecksum({
          title: doc.title,
          summary: doc.summary,
          status: doc.status,
          body: doc.body,
        }) ===
          exampleContentChecksum({
            title: article.title,
            summary: article.summary,
            status: 'published',
            body: toLexicalDocument(article.body),
          })
      )
    }
    return true
  }
  // onboarding-starter legacy record (no checksum): pristine means the
  // record was never saved again after setup created it.
  const created = new Date(String(doc.createdAt ?? '')).getTime()
  const updated = new Date(String(doc.updatedAt ?? '')).getTime()
  if (!Number.isFinite(created) || !Number.isFinite(updated)) return true
  return updated - created > 2000
}

function contentEdited(doc: Record<string, unknown>): boolean {
  const checksum = contentMatchesInstallChecksum(doc)
  if (checksum !== null) return !checksum
  return legacyContentEdited(doc)
}

function layoutHasStarterBaseline(doc: Record<string, unknown>): boolean {
  if (starterBaselineBlocks(doc)) return true
  const history = Array.isArray(doc.revisionHistory) ? doc.revisionHistory : []
  return history.some(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      (entry as { source?: unknown }).source === 'onboarding-starter',
  )
}

function layoutEdited(doc: Record<string, unknown>): boolean {
  const baseline = starterBaselineBlocks(doc)
  if (baseline) return !blocksMatch(doc.blocks, baseline)
  // Onboarding home layout: pristine means its blocks still equal the
  // blocks recorded in its onboarding revision-history entry.
  const history = Array.isArray(doc.revisionHistory) ? doc.revisionHistory : []
  const entry = history.find(
    (item) =>
      item &&
      typeof item === 'object' &&
      (item as { source?: unknown }).source === 'onboarding-starter',
  ) as { blocks?: unknown } | undefined
  // The onboarding entry records the recipe, not the blocks; without a
  // block baseline an edit cannot be ruled out, so protect the layout.
  void entry
  return true
}

export async function listStarterExamples(
  payload: Payload,
  siteId: string,
): Promise<StarterExamplesPreview> {
  const [contentResult, layoutResult] = await Promise.all([
    (payload as any).find({
      collection: 'content',
      where: { site: { equals: siteId } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    }),
    (payload as any).find({
      collection: 'page-layouts',
      where: { site: { equals: siteId } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    }),
  ])
  const removable: StarterExampleItem[] = []
  const protectedEdited: StarterExampleItem[] = []
  for (const doc of contentResult.docs as Array<Record<string, unknown>>) {
    if (!isStarterProvenance(doc.importSourceSystem)) continue
    const item: StarterExampleItem = {
      id: String(doc.id),
      kind: 'content',
      title: String(doc.title ?? doc.canonicalPath ?? 'Untitled'),
      path: String(doc.canonicalPath ?? ''),
      edited: contentEdited(doc),
    }
    ;(item.edited ? protectedEdited : removable).push(item)
  }
  for (const doc of layoutResult.docs as Array<Record<string, unknown>>) {
    if (!layoutHasStarterBaseline(doc)) continue
    const item: StarterExampleItem = {
      id: String(doc.id),
      kind: 'layout',
      title: String(doc.name ?? doc.path ?? 'Layout'),
      path: String(doc.path ?? ''),
      edited: layoutEdited(doc),
    }
    ;(item.edited ? protectedEdited : removable).push(item)
  }
  return {
    siteId,
    removable,
    protectedEdited,
    removableCount: removable.length,
    protectedCount: protectedEdited.length,
  }
}

export type RemovedStarterExample = StarterExampleItem & {
  action: 'deleted' | 'unpublished'
}

export type RemoveStarterExamplesResult = {
  siteId: string
  removed: RemovedStarterExample[]
  protectedEdited: StarterExampleItem[]
}

/**
 * Removes ONLY the still-pristine examples from the preview. The
 * classification is recomputed at removal time, so an edit that lands
 * between preview and confirm protects the item.
 *
 * Removal deletes the record where the platform allows it. Content
 * carrying editorial revision history cannot be deleted (the
 * hierarchy guard protects revisioned records platform-wide), so
 * those examples are unpublished instead — status draft, which the
 * public render contract treats as not public. Either way the item
 * stops being visitor-visible example content, and the result says
 * which action each item got.
 */
export async function removeStarterExamples(
  payload: Payload,
  siteId: string,
): Promise<RemoveStarterExamplesResult> {
  const preview = await listStarterExamples(payload, siteId)
  const removed: RemovedStarterExample[] = []
  for (const item of preview.removable) {
    const collection = item.kind === 'content' ? 'content' : 'page-layouts'
    try {
      await (payload as any).delete({ collection, id: item.id, overrideAccess: true })
      removed.push({ ...item, action: 'deleted' })
    } catch {
      await (payload as any).update({
        collection,
        id: item.id,
        data: { status: 'draft' },
        overrideAccess: true,
      })
      removed.push({ ...item, action: 'unpublished' })
    }
  }
  return { siteId, removed, protectedEdited: preview.protectedEdited }
}
