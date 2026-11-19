import type { Payload, PayloadRequest } from 'payload'

import { checkOperatorSiteAccess } from '../../operations/operator-grants'
import type { LayoutBlock } from '../../public/page-builder'
import { readConversionBinding, type ConversionBinding } from './conversion-apply'
import type { SourceRegionReport } from './wordpress-blocks'

/**
 * Conversion review for the normal builder (S2-14).
 *
 * The review is a read model over the layout record itself — the last
 * conversion report and binding persisted by S2-13's apply history,
 * the operator's review decisions (also history entries on the same
 * record), and the current draft blocks. Nothing here creates a second
 * persistence path: draft edits keep flowing through the normal layout
 * save, decisions are appended to the record's own history by the
 * normal update API, and publication is gated in the normal layout
 * route by `conversionPublicationBlockers`.
 *
 * Item states:
 * - `ready` — converted (or content-free by design) and in sync;
 * - `needs-acceptance` — an approximation the operator must accept;
 * - `needs-replacement` — quarantined source (unsupported block,
 *   script, missing media) that must be replaced with a normal
 *   component, resolved with acquired media, or explicitly accepted
 *   as omitted;
 * - `conflict-unresolved` — the source region changed but its binding
 *   did not (S2-13 preserved a local edit); resolve by re-importing
 *   with an explicit resolution, never from this panel.
 *
 * Decisions are keyed to the region's source hash: when the source
 * changes, a stale acceptance stops applying and the item returns to
 * its unresolved state.
 */
export type ConversionReviewDecisionKind = 'accepted' | 'replaced' | 'media-resolved'

export type ConversionReviewDecision = {
  location: string
  sourceHash: string
  decision: ConversionReviewDecisionKind
  replacementBlockId?: string
  decidedAt: string
}

export type ConversionReviewItem = {
  location: string
  blockName: string | null
  outcome: SourceRegionReport['outcome']
  reason?: string
  sourceHash: string
  targetIds: string[]
  targetPresent: boolean[]
  state: 'ready' | 'needs-acceptance' | 'needs-replacement' | 'conflict-unresolved'
  decision?: ConversionReviewDecision
}

export type ConversionReview = {
  sourceId: string
  path: string
  appliedAt: string
  items: ConversionReviewItem[]
  blockers: ConversionReviewItem[]
  publishable: boolean
}

type LayoutRecordLike = {
  blocks?: unknown
  revisionHistory?: unknown
}

const historyOf = (record: LayoutRecordLike) =>
  Array.isArray(record.revisionHistory)
    ? (record.revisionHistory as Array<Record<string, unknown>>)
    : []

/** All review decisions ever recorded, latest per location winning. */
export function readConversionDecisions(record: LayoutRecordLike): ConversionReviewDecision[] {
  const byLocation = new Map<string, ConversionReviewDecision>()
  for (const entry of historyOf(record)) {
    if (entry?.action !== 'conversion-review') continue
    const decisions = (entry.review as { decisions?: ConversionReviewDecision[] } | undefined)
      ?.decisions
    if (!Array.isArray(decisions)) continue
    for (const decision of decisions) byLocation.set(decision.location, decision)
  }
  return [...byLocation.values()]
}

function latestApplyEntry(
  record: LayoutRecordLike,
): { report: SourceRegionReport[]; binding: ConversionBinding } | null {
  const history = historyOf(record)
  for (let index = history.length - 1; index >= 0; index--) {
    const entry = history[index]
    if (entry?.action !== 'conversion-apply') continue
    const binding = readConversionBinding({ revisionHistory: history.slice(0, index + 1) })
    if (!binding) continue
    const report = Array.isArray(entry.report) ? (entry.report as SourceRegionReport[]) : []
    return { report, binding }
  }
  return null
}

export function readConversionReview(record: LayoutRecordLike): ConversionReview | null {
  const applied = latestApplyEntry(record)
  if (!applied) return null
  const { report, binding } = applied
  const decisions = new Map(
    readConversionDecisions(record).map((decision) => [decision.location, decision]),
  )
  const blocks = Array.isArray(record.blocks) ? (record.blocks as LayoutBlock[]) : []
  const blockById = new Map(blocks.map((block) => [block.id, block]))
  const boundByLocation = new Map(binding.regions.map((region) => [region.location, region]))

  const items: ConversionReviewItem[] = report
    .filter((entry) => entry.outcome !== 'dropped-empty')
    .map((entry) => {
      const bound = boundByLocation.get(entry.location)
      const decision = decisions.get(entry.location)
      const validDecision =
        decision && decision.sourceHash === entry.sourceHash ? decision : undefined
      const targetIds = bound?.targetIds ?? entry.targetIds
      const targetPresent = targetIds.map((id) => blockById.has(id))
      let state: ConversionReviewItem['state'] = 'ready'
      if (bound && bound.sourceHash !== entry.sourceHash) {
        state = 'conflict-unresolved'
      } else if (entry.outcome === 'approximated') {
        state = validDecision?.decision === 'accepted' ? 'ready' : 'needs-acceptance'
      } else if (entry.outcome === 'quarantined') {
        if (
          validDecision &&
          (validDecision.decision === 'accepted' ||
            ((validDecision.decision === 'replaced' ||
              validDecision.decision === 'media-resolved') &&
              validDecision.replacementBlockId &&
              blockById.has(validDecision.replacementBlockId)))
        ) {
          state = 'ready'
        } else {
          state = 'needs-replacement'
        }
      }
      return {
        location: entry.location,
        blockName: entry.blockName,
        outcome: entry.outcome,
        reason: entry.reason,
        sourceHash: entry.sourceHash,
        targetIds,
        targetPresent,
        state,
        decision: validDecision,
      }
    })

  /* Locally edited blocks whose content diverged from the applied
     output are ordinary draft edits, not review items; they become
     blockers only when the source also moved (the hash mismatch
     above), which is exactly S2-13's unresolved-conflict state. */
  const blockers = items.filter((item) => item.state !== 'ready')
  return {
    sourceId: binding.sourceId,
    path: binding.path,
    appliedAt: binding.appliedAt,
    items,
    blockers,
    publishable: blockers.length === 0,
  }
}

/** Publication gate: unresolved required items, or an empty list. */
export function conversionPublicationBlockers(record: LayoutRecordLike): ConversionReviewItem[] {
  return readConversionReview(record)?.blockers ?? []
}

export class ConversionReviewError extends Error {}

/**
 * Record one operator decision on the layout's own history. Draft-only
 * in effect: the record's blocks, status and published state are never
 * touched here — content changes stay in the normal editor save.
 */
export async function recordConversionReviewDecision(
  payload: Payload,
  args: {
    layoutId: string
    user?: Parameters<typeof checkOperatorSiteAccess>[1]
    req?: PayloadRequest
    location: string
    decision: ConversionReviewDecisionKind
    replacementBlockId?: string
  },
): Promise<ConversionReview> {
  const record = (await payload.findByID({
    collection: 'page-layouts',
    id: args.layoutId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> & LayoutRecordLike
  const siteId =
    typeof record.site === 'string'
      ? record.site
      : String((record.site as { id?: unknown } | undefined)?.id ?? '')
  if (args.user) {
    const allowed = await checkOperatorSiteAccess(payload, args.user, siteId, args.req)
    if (!allowed) throw new ConversionReviewError('Operator is not authorized for this site.')
  }
  const review = readConversionReview(record)
  if (!review) throw new ConversionReviewError('Layout has no conversion review.')
  const item = review.items.find((candidate) => candidate.location === args.location)
  if (!item) throw new ConversionReviewError(`Unknown conversion region ${args.location}.`)
  if (
    (args.decision === 'replaced' || args.decision === 'media-resolved') &&
    !args.replacementBlockId
  ) {
    throw new ConversionReviewError('A replacement block is required for this decision.')
  }
  if (args.replacementBlockId) {
    const blocks = Array.isArray(record.blocks) ? (record.blocks as LayoutBlock[]) : []
    if (!blocks.some((block) => block.id === args.replacementBlockId)) {
      throw new ConversionReviewError('Replacement block is not part of this draft.')
    }
  }
  const decision: ConversionReviewDecision = {
    location: args.location,
    sourceHash: item.sourceHash,
    decision: args.decision,
    replacementBlockId: args.replacementBlockId,
    decidedAt: new Date().toISOString(),
  }
  const history = historyOf(record)
  await payload.update({
    collection: 'page-layouts',
    id: args.layoutId,
    overrideAccess: args.user ? false : true,
    ...(args.req ? { req: args.req } : {}),
    data: {
      revisionHistory: [
        ...history,
        {
          revision: Number(record.revision ?? 1),
          blocks: Array.isArray(record.blocks) ? record.blocks : [],
          unknownBlocks: [],
          action: 'conversion-review',
          source: 'wordpress-conversion',
          savedAt: decision.decidedAt,
          review: { decisions: [decision] },
        },
      ],
    },
  } as never)
  const updated = (await payload.findByID({
    collection: 'page-layouts',
    id: args.layoutId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as LayoutRecordLike
  const next = readConversionReview(updated)
  if (!next) throw new ConversionReviewError('Conversion review disappeared after update.')
  return next
}
