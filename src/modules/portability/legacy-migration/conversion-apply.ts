import { createHash } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'

import { transactionPayload } from '../../core/transaction-payload'
import { checkOperatorSiteAccess } from '../../operations/operator-grants'
import type { LayoutBlock } from '../../public/page-builder'
import { acquireLegacyMedia, type MediaStoreBoundary } from './media'
import type { NormalizedMedia } from './types'
import {
  convertWordpressBlocks,
  type SourceRegionReport,
  type WordpressConversion,
} from './wordpress-blocks'

/**
 * Safe apply / re-import of converted WordPress graphs (S2-13).
 *
 * A conversion becomes a draft through the S2-01 boundary discipline:
 * operator grant checked first, one bound transaction, draft-only
 * writes (published revision and snapshot never move), and an expected
 * target revision that refuses the apply when the target moved.
 *
 * Identity is persistent: every applied region is bound in the layout's
 * own revision history (action `conversion-apply`) to its target block
 * ids and the hash of the generated output that was applied. Re-import
 * is a three-way comparison — previous generated output vs current
 * authored target vs new source:
 *
 * - target untouched, source unchanged → no-op (idempotent rerun);
 * - target untouched, source changed → new output, SAME target ids;
 * - target edited locally → local edit wins, conflict surfaced, and
 *   the binding is left untouched so the conflict persists until the
 *   operator resolves it (`accept-source` overwrites deliberately,
 *   `keep-local` accepts the local block as the region's new state);
 * - region deleted from source → untouched targets are removed,
 *   edited targets are kept with a conflict;
 * - target deleted locally → never resurrected silently; conflict.
 *
 * Blocks the conversion does not own (operator-added in the builder)
 * are preserved. Media is staged by content hash through the existing
 * acquisition boundary before conversion; media created by a failed
 * apply that nothing references is reconciled away through the
 * caller's discard hook. References resolve only against the target
 * site — foreign media and foreign link targets cannot be produced.
 */
export class ConversionApplyAccessError extends Error {
  constructor(siteId: string) {
    super(`Operator is not authorized to apply conversions to site ${siteId}.`)
    this.name = 'ConversionApplyAccessError'
  }
}

export type ConversionBindingRegion = {
  location: string
  sourceHash: string
  targetIds: string[]
  appliedHashes: string[]
}

export type ConversionBinding = {
  sourceId: string
  path: string
  appliedAt: string
  regions: ConversionBindingRegion[]
}

export type ConversionConflict = {
  location: string
  targetId?: string
  kind: 'local-edit' | 'local-edit-source-changed' | 'deleted-in-source' | 'target-deleted'
  detail: string
}

export type ConversionDecision = {
  location: string
  outcome: 'created' | 'updated' | 'unchanged' | 'kept-local' | 'removed' | 'kept'
}

export type ConversionApplyResult = {
  applied: boolean
  layoutId: string | null
  revision: number | null
  report: SourceRegionReport[]
  coverage: WordpressConversion['coverage']
  conflicts: ConversionConflict[]
  decisions: ConversionDecision[]
  media: {
    createdIds: string[]
    reusedIds: string[]
    discardedIds: string[]
    errors: Array<{ code: string; message: string; sourceId?: string }>
  }
}

type ApplyArgs = {
  siteId: string
  user?: Parameters<typeof checkOperatorSiteAccess>[1]
  req?: PayloadRequest
  sourceId: string
  path: string
  name: string
  themeId: string
  source: string
  media?: {
    items: NormalizedMedia[]
    store: MediaStoreBoundary
    localMediaFiles?: Record<string, { buffer: Buffer; fileName: string; mimeType?: string }>
    remoteMediaDownloadAllowed?: boolean
  }
  /** Removes media records created by this apply when it fails. */
  discardMedia?: (ids: string[]) => Promise<void>
  /** Explicit operator resolutions, keyed by report location. */
  resolutions?: Record<string, 'accept-source' | 'keep-local'>
}

const hash = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`
}

export const hashLayoutBlock = (block: LayoutBlock): string =>
  hash(
    stableStringify({
      component: block.component,
      componentVersion: block.componentVersion,
      props: block.props,
      visible: block.visible ?? null,
    }),
  )

/** The last conversion binding recorded on a layout record, if any. */
export function readConversionBinding(record: {
  revisionHistory?: unknown
}): ConversionBinding | null {
  const history = Array.isArray(record.revisionHistory) ? record.revisionHistory : []
  for (let index = history.length - 1; index >= 0; index--) {
    const entry = history[index] as { action?: string; conversion?: ConversionBinding }
    if (entry?.action === 'conversion-apply' && entry.conversion) return entry.conversion
  }
  return null
}

/* Per-process apply serialization: one apply per site+path at a time. */
const applyChains = new Map<string, Promise<unknown>>()
function serialized<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = applyChains.get(key) ?? Promise.resolve()
  const next = previous.then(run, run)
  applyChains.set(
    key,
    next.catch(() => undefined),
  )
  return next
}

export async function applyWordpressConversion(
  payload: Payload,
  args: ApplyArgs,
): Promise<ConversionApplyResult> {
  if (args.user) {
    const allowed = await checkOperatorSiteAccess(payload, args.user, args.siteId, args.req)
    if (!allowed) throw new ConversionApplyAccessError(args.siteId)
  }
  return serialized(`${args.siteId}:${args.path}`, () => applyLocked(payload, args))
}

async function applyLocked(payload: Payload, args: ApplyArgs): Promise<ConversionApplyResult> {
  const mediaAccounting: ConversionApplyResult['media'] = {
    createdIds: [],
    reusedIds: [],
    discardedIds: [],
    errors: [],
  }

  /* 1. Stage media by content hash through the existing boundary. */
  const mediaByUrl = new Map<string, { id: string; siteId: string; label: string }>()
  if (args.media) {
    const acquisition = await acquireLegacyMedia(args.media.items, args.media.store, {
      siteId: args.siteId,
      localMediaFiles: args.media.localMediaFiles,
      remoteMediaDownloadAllowed: args.media.remoteMediaDownloadAllowed,
    })
    mediaAccounting.createdIds = acquisition.createdMediaIds
    mediaAccounting.errors = acquisition.errors
    for (const item of args.media.items) {
      const acquired = acquisition.acquiredMedia.get(item.id)
      if (!acquired) continue
      mediaByUrl.set(item.sourceUrl, {
        id: acquired.mediaId,
        siteId: args.siteId,
        label: item.title || acquired.fileName,
      })
      if (!acquisition.createdMediaIds.includes(acquired.mediaId)) {
        mediaAccounting.reusedIds.push(acquired.mediaId)
      }
    }
  }

  /* 2. Resolve link targets against THIS site's layouts only. */
  const linkByHref = new Map<string, { id: string; siteId: string; label: string; href: string }>()
  const siteLayouts = await payload.find({
    collection: 'page-layouts',
    where: { site: { equals: args.siteId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of siteLayouts.docs as unknown as Array<Record<string, unknown>>) {
    const path = typeof doc.path === 'string' ? doc.path : ''
    if (path) {
      linkByHref.set(path, {
        id: String(doc.id),
        siteId: args.siteId,
        label: typeof doc.name === 'string' ? doc.name : path,
        href: path,
      })
    }
  }

  /* 3. Convert with the resolved references. */
  const conversion = convertWordpressBlocks(args.source, { mediaByUrl, linkByHref })

  /* 4. Read the current target and its binding. */
  const target = (siteLayouts.docs as unknown as Array<Record<string, unknown>>).find(
    (doc) => doc.path === args.path,
  )
  const currentBlocks: LayoutBlock[] = target
    ? ((target.blocks as LayoutBlock[] | undefined) ?? [])
    : []
  const currentById = new Map(currentBlocks.map((block) => [block.id, block]))
  const binding = target ? readConversionBinding(target) : null
  const boundByLocation = new Map(
    (binding?.regions ?? []).map((region) => [region.location, region]),
  )
  const generatedById = new Map(conversion.blocks.map((block) => [block.id, block]))

  /* 5. Three-way merge. */
  const conflicts: ConversionConflict[] = []
  const decisions: ConversionDecision[] = []
  const merged: LayoutBlock[] = []
  const ownedTargetIds = new Set<string>()
  const newRegions: ConversionBindingRegion[] = []
  const seenLocations = new Set<string>()

  for (const entry of conversion.report) {
    if (!entry.targetIds.length) continue
    seenLocations.add(entry.location)
    const bound = boundByLocation.get(entry.location)
    const generated = entry.targetIds
      .map((id) => generatedById.get(id))
      .filter((block): block is LayoutBlock => Boolean(block))
    if (!bound) {
      merged.push(...generated)
      for (const block of generated) ownedTargetIds.add(block.id)
      newRegions.push({
        location: entry.location,
        sourceHash: entry.sourceHash,
        targetIds: generated.map((block) => block.id),
        appliedHashes: generated.map(hashLayoutBlock),
      })
      decisions.push({ location: entry.location, outcome: 'created' })
      continue
    }
    const resolution = args.resolutions?.[entry.location]
    const sourceChanged = bound.sourceHash !== entry.sourceHash
    const finalBlocks: LayoutBlock[] = []
    let regionOutcome: ConversionDecision['outcome'] = 'unchanged'
    bound.targetIds.forEach((targetId, position) => {
      ownedTargetIds.add(targetId)
      const current = currentById.get(targetId)
      const fresh = generated[position]
      if (!current) {
        conflicts.push({
          location: entry.location,
          targetId,
          kind: 'target-deleted',
          detail: 'The target block was deleted locally; the converted region was not resurrected.',
        })
        regionOutcome = 'kept-local'
        return
      }
      const locallyEdited = hashLayoutBlock(current) !== bound.appliedHashes[position]
      if (!locallyEdited) {
        if (!sourceChanged) {
          finalBlocks.push(current)
        } else if (fresh) {
          finalBlocks.push({ ...fresh, id: targetId })
          regionOutcome = 'updated'
        } else {
          finalBlocks.push(current)
        }
        return
      }
      /* Locally edited: local content wins unless explicitly resolved. */
      if (resolution === 'accept-source' && fresh) {
        finalBlocks.push({ ...fresh, id: targetId })
        regionOutcome = 'updated'
        return
      }
      finalBlocks.push(current)
      regionOutcome = 'kept-local'
      if (resolution !== 'keep-local') {
        conflicts.push({
          location: entry.location,
          targetId,
          kind: sourceChanged ? 'local-edit-source-changed' : 'local-edit',
          detail: sourceChanged
            ? 'The source region changed and the target block carries local edits; the local edit was preserved.'
            : 'The target block carries local edits on top of the last applied conversion.',
        })
      }
    })
    /* Extra generated blocks when a region grew (e.g. a longer split). */
    if (!conflicts.some((conflict) => conflict.location === entry.location)) {
      for (const extra of generated.slice(bound.targetIds.length)) {
        finalBlocks.push(extra)
        ownedTargetIds.add(extra.id)
        if (regionOutcome === 'unchanged') regionOutcome = 'updated'
      }
    }
    merged.push(...finalBlocks)
    decisions.push({ location: entry.location, outcome: regionOutcome })
    const conflicted = conflicts.some((conflict) => conflict.location === entry.location)
    if (conflicted) {
      /* Binding untouched: the conflict must re-surface next run. */
      newRegions.push(bound)
    } else if (args.resolutions?.[entry.location] === 'keep-local') {
      newRegions.push({
        location: entry.location,
        sourceHash: entry.sourceHash,
        targetIds: finalBlocks.map((block) => block.id),
        appliedHashes: finalBlocks.map(hashLayoutBlock),
      })
    } else {
      newRegions.push({
        location: entry.location,
        sourceHash: entry.sourceHash,
        targetIds: finalBlocks.map((block) => block.id),
        appliedHashes: finalBlocks.map(hashLayoutBlock),
      })
    }
  }

  /* Regions the source no longer contains. */
  for (const bound of binding?.regions ?? []) {
    if (seenLocations.has(bound.location)) continue
    let removedAll = true
    bound.targetIds.forEach((targetId, position) => {
      ownedTargetIds.add(targetId)
      const current = currentById.get(targetId)
      if (!current) return
      if (hashLayoutBlock(current) === bound.appliedHashes[position]) return
      removedAll = false
      merged.push(current)
      conflicts.push({
        location: bound.location,
        targetId,
        kind: 'deleted-in-source',
        detail:
          'The source region was deleted but the target block carries local edits; it was kept.',
      })
    })
    decisions.push({ location: bound.location, outcome: removedAll ? 'removed' : 'kept' })
    if (!removedAll) newRegions.push(bound)
  }

  /* Operator-added blocks are not conversion-owned: preserve them,
     spliced back near their original positions. */
  currentBlocks.forEach((block, index) => {
    if (ownedTargetIds.has(block.id)) return
    if (merged.some((candidate) => candidate.id === block.id)) return
    merged.splice(Math.min(index, merged.length), 0, block)
  })

  const unchanged =
    Boolean(target) &&
    stableStringify(merged) === stableStringify(currentBlocks) &&
    conflicts.length === 0
  if (unchanged) {
    return {
      applied: false,
      layoutId: String(target!.id),
      revision: Number(target!.revision ?? 1),
      report: conversion.report,
      coverage: conversion.coverage,
      conflicts,
      decisions,
      media: mediaAccounting,
    }
  }

  /* 6. One bound transaction, expected revision, draft-only write. */
  const newBinding: ConversionBinding = {
    sourceId: args.sourceId,
    path: args.path,
    appliedAt: new Date().toISOString(),
    regions: newRegions,
  }
  let transactionID: Awaited<ReturnType<typeof payload.db.beginTransaction>> = null
  try {
    transactionID = await payload.db.beginTransaction()
    const req = {
      ...(args.req ?? {}),
      transactionID,
      user: args.user ?? null,
    } as PayloadRequest
    const tx = transactionPayload(payload, req)
    const overrideAccess = args.user ? false : true

    if (target) {
      const fresh = await tx.findByID({
        collection: 'page-layouts',
        id: String(target.id),
        depth: 0,
        overrideAccess: true,
      } as never)
      if (
        Number((fresh as unknown as Record<string, unknown>).revision ?? 1) !==
        Number(target.revision ?? 1)
      ) {
        throw new Error(
          `Conversion apply refused: target revision moved from ${String(target.revision)} since it was read.`,
        )
      }
      const priorHistory = Array.isArray(target.revisionHistory)
        ? (target.revisionHistory as unknown[])
        : []
      await tx.update({
        collection: 'page-layouts',
        id: String(target.id),
        overrideAccess,
        req,
        data: {
          blocks: merged,
          revisionHistory: [
            ...priorHistory,
            {
              revision: Number(target.revision ?? 1),
              blocks: merged,
              unknownBlocks: [],
              action: 'conversion-apply',
              source: 'wordpress-conversion',
              savedAt: newBinding.appliedAt,
              conversion: newBinding,
              report: conversion.report,
              coverage: conversion.coverage,
            },
          ],
        },
      } as never)
    } else {
      await tx.create({
        collection: 'page-layouts',
        overrideAccess,
        req,
        data: {
          site: args.siteId,
          name: args.name,
          path: args.path,
          themeId: args.themeId,
          surface: 'page',
          slot: 'main',
          status: 'draft',
          layoutVersion: 1,
          blocks: merged,
          unknownBlocks: [],
          revision: 1,
          revisionHistory: [
            {
              revision: 1,
              blocks: merged,
              unknownBlocks: [],
              action: 'conversion-apply',
              source: 'wordpress-conversion',
              savedAt: newBinding.appliedAt,
              conversion: newBinding,
              report: conversion.report,
              coverage: conversion.coverage,
            },
          ],
        },
      } as never)
    }
    if (transactionID) await payload.db.commitTransaction(transactionID)
  } catch (error) {
    if (transactionID) await payload.db.rollbackTransaction(transactionID).catch(() => undefined)
    /* Reconcile staged media nothing references after the rollback.
       The rolled-back draft never persisted, so only the pre-apply
       record's references survive. */
    if (args.discardMedia && mediaAccounting.createdIds.length) {
      const referenced = new Set<string>()
      for (const block of currentBlocks) {
        const media = (block.props as Record<string, unknown>)?.media as { id?: string } | undefined
        if (media?.id) referenced.add(media.id)
      }
      const orphans = mediaAccounting.createdIds.filter((id) => !referenced.has(id))
      if (orphans.length) {
        await args.discardMedia(orphans).catch(() => undefined)
        mediaAccounting.discardedIds = orphans
      }
    }
    throw error
  }

  const written = await payload.find({
    collection: 'page-layouts',
    where: {
      and: [{ site: { equals: args.siteId } }, { path: { equals: args.path } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const record = (written.docs as unknown as Array<Record<string, unknown>>)[0]
  return {
    applied: true,
    layoutId: record ? String(record.id) : null,
    revision: record ? Number(record.revision ?? 1) : null,
    report: conversion.report,
    coverage: conversion.coverage,
    conflicts,
    decisions,
    media: mediaAccounting,
  }
}
