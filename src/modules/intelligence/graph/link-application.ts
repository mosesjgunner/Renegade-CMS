import type { Payload } from 'payload'
import type {
  BulkReviewItem,
  BulkReviewResult,
  LinkApplicationInput,
  LinkApplicationResult,
} from './contracts'
import { computeContentFingerprint, extractPlainTextFromBody } from './projection-engine'

/**
 * Deep clones any JSON-serializable object.
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Safely inserts a Lexical link node into the richText AST while preserving all existing content.
 */
export function insertLinkIntoLexicalBody(
  body: unknown,
  targetUrl: string,
  anchorText: string,
): { updatedBody: Record<string, unknown>; appliedAnchor: string } {
  // If no body or invalid structure, initialize a valid Lexical root
  if (!body || typeof body !== 'object' || !('root' in body)) {
    return {
      updatedBody: {
        root: {
          type: 'root',
          format: '',
          indent: 0,
          version: 1,
          children: [
            {
              type: 'paragraph',
              format: '',
              indent: 0,
              version: 1,
              children: [
                {
                  type: 'link',
                  fields: { linkType: 'custom', url: targetUrl, newTab: false },
                  format: '',
                  indent: 0,
                  version: 1,
                  children: [{ type: 'text', text: anchorText, format: 0, version: 1 }],
                },
              ],
            },
          ],
        },
      },
      appliedAnchor: anchorText,
    }
  }

  const cloned = deepClone(body) as {
    root: { children?: Array<Record<string, unknown>> }
  }
  const root = cloned.root
  if (!Array.isArray(root.children) || root.children.length === 0) {
    root.children = [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'link',
            fields: { linkType: 'custom', url: targetUrl, newTab: false },
            format: '',
            indent: 0,
            version: 1,
            children: [{ type: 'text', text: anchorText, format: 0, version: 1 }],
          },
        ],
      },
    ]
    return { updatedBody: cloned as Record<string, unknown>, appliedAnchor: anchorText }
  }

  // 1. Try to find the anchorText inside an existing text node within a paragraph
  let inserted = false
  const lowerAnchor = anchorText.toLowerCase()

  for (const block of root.children) {
    if (block.type === 'paragraph' && Array.isArray(block.children)) {
      for (let i = 0; i < block.children.length; i++) {
        const node = block.children[i] as Record<string, unknown>
        if (
          node.type === 'text' &&
          typeof node.text === 'string' &&
          node.text.toLowerCase().includes(lowerAnchor)
        ) {
          const originalText = node.text
          const matchIndex = originalText.toLowerCase().indexOf(lowerAnchor)
          const matchedAnchor = originalText.slice(matchIndex, matchIndex + anchorText.length)

          const before = originalText.slice(0, matchIndex)
          const after = originalText.slice(matchIndex + anchorText.length)

          const newNodes: Array<Record<string, unknown>> = []
          if (before) {
            newNodes.push({ ...node, text: before })
          }
          newNodes.push({
            type: 'link',
            fields: { linkType: 'custom', url: targetUrl, newTab: false },
            format: '',
            indent: 0,
            version: 1,
            children: [{ type: 'text', text: matchedAnchor, format: 0, version: 1 }],
          })
          if (after) {
            newNodes.push({ ...node, text: after })
          }

          block.children.splice(i, 1, ...newNodes)
          inserted = true
          return {
            updatedBody: cloned as Record<string, unknown>,
            appliedAnchor: matchedAnchor,
          }
        }
      }
    }
  }

  // 2. If anchor text was not found verbatim in any unlinked text node, append link smoothly
  // Target second paragraph if available, otherwise first paragraph
  const targetBlockIndex = root.children.length > 1 ? 1 : 0
  const targetBlock = root.children[targetBlockIndex]

  if (targetBlock && Array.isArray(targetBlock.children)) {
    targetBlock.children.push(
      { type: 'text', text: ' (See related: ', format: 0, version: 1 },
      {
        type: 'link',
        fields: { linkType: 'custom', url: targetUrl, newTab: false },
        format: '',
        indent: 0,
        version: 1,
        children: [{ type: 'text', text: anchorText, format: 0, version: 1 }],
      },
      { type: 'text', text: ')', format: 0, version: 1 },
    )
  } else {
    root.children.push({
      type: 'paragraph',
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'link',
          fields: { linkType: 'custom', url: targetUrl, newTab: false },
          format: '',
          indent: 0,
          version: 1,
          children: [{ type: 'text', text: anchorText, format: 0, version: 1 }],
        },
      ],
    })
  }

  return { updatedBody: cloned as Record<string, unknown>, appliedAnchor: anchorText }
}

/**
 * Applies a link opportunity to content with optimistic concurrency control,
 * auditable execution record, and rollback support.
 */
export async function applyLinkOpportunity(
  payload: Payload,
  input: LinkApplicationInput,
): Promise<LinkApplicationResult> {
  const { sourceContentId, targetContentId, expectedRevision, anchorText, userId } = input

  // 1. Fetch Source Content
  const sourceDoc = (await payload.findByID({
    collection: 'content',
    id: sourceContentId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!sourceDoc) {
    throw new Error(`Source content ${sourceContentId} not found.`)
  }

  // 2. Fetch Target Content to resolve canonical URL and title
  const targetDoc = (await payload.findByID({
    collection: 'content',
    id: targetContentId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!targetDoc) {
    throw new Error(`Target content ${targetContentId} not found.`)
  }

  const targetUrl = String(targetDoc.canonicalPath || targetDoc.slug || '').trim()
  if (!targetUrl) {
    throw new Error(`Target content ${targetContentId} does not have a canonicalPath or slug.`)
  }

  // 3. Optimistic Concurrency Check: verify expectedRevision matches current revision
  const currentBodyText = extractPlainTextFromBody(sourceDoc.body)
  const currentRevision = computeContentFingerprint(sourceDoc, currentBodyText)

  if (expectedRevision && currentRevision !== expectedRevision) {
    throw new Error(
      `Revision conflict: Content ${sourceContentId} was modified by another editor (expected revision ${expectedRevision}, current revision is ${currentRevision}). Aborting to prevent accidental overwrites.`,
    )
  }

  // 4. Transform Body AST
  const { updatedBody, appliedAnchor } = insertLinkIntoLexicalBody(
    sourceDoc.body,
    targetUrl,
    anchorText,
  )

  const updatedBodyText = extractPlainTextFromBody(updatedBody)
  const newRevision = computeContentFingerprint(
    { ...sourceDoc, body: updatedBody },
    updatedBodyText,
  )

  const siteId =
    typeof sourceDoc.site === 'object' && sourceDoc.site !== null
      ? String((sourceDoc.site as Record<string, unknown>).id)
      : String(sourceDoc.site || '')

  // 5. Ensure an analysis and recommendation exist for relational integrity with intelligence-executions
  let analysisId: string | null = null
  const existingAnalysis = await payload.find({
    collection: 'intelligence-analyses' as never,
    where: {
      and: [
        { site: { equals: siteId } },
        { targetType: { equals: 'content' } },
        { targetId: { equals: sourceContentId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existingAnalysis.docs.length > 0) {
    analysisId = String((existingAnalysis.docs[0] as Record<string, unknown>).id)
  } else {
    const newAnalysis = (await payload.create({
      collection: 'intelligence-analyses' as never,
      data: {
        site: siteId,
        targetType: 'content',
        targetId: sourceContentId,
        contentRevision: currentRevision,
        source: 'renegade-graph-link-analyzer',
        version: '1.0.0',
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        evidence: {
          contentRevision: currentRevision,
          source: 'renegade-graph-link-analyzer',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          titleLength: String(sourceDoc.title || '').length,
          descriptionLength: 0,
          wordCount: currentBodyText.split(/\s+/).filter(Boolean).length,
          h1Count: 1,
          headingsSummary: [],
          hasCanonical: Boolean(sourceDoc.canonicalPath),
          matchedEntities: [],
          unverifiedClaimsCount: 0,
          citationsCount: 0,
          rawChecks: [],
        },
      } as never,
      overrideAccess: true,
    } as never)) as unknown as Record<string, unknown>
    analysisId = String(newAnalysis.id)
  }

  // Create Recommendation record
  const recDoc = (await payload.create({
    collection: 'intelligence-recommendations' as never,
    data: {
      site: siteId,
      analysis: analysisId,
      targetCollection: 'content',
      targetId: sourceContentId,
      isProposal: true,
      nature: 'deterministic',
      action: 'custom',
      currentValue: { body: sourceDoc.body },
      proposedValue: {
        body: updatedBody,
        targetUrl,
        anchor: appliedAnchor,
      },
      rationale: `Apply internal link to "${targetDoc.title}" (${targetUrl}) with anchor "${appliedAnchor}" to strengthen topic architecture.`,
      status: 'applied',
      decidedBy: userId,
      decidedAt: new Date().toISOString(),
    } as never,
    overrideAccess: true,
  } as never)) as unknown as Record<string, unknown>

  const recommendationId = String(recDoc.id)

  const beforeSnapshot = {
    revision: currentRevision,
    body: sourceDoc.body,
    title: sourceDoc.title,
  }

  const afterSnapshot = {
    revision: newRevision,
    body: updatedBody,
    targetContentId,
    targetUrl,
    anchor: appliedAnchor,
  }

  // 6. Record Execution Audit Log
  const executionDoc = (await payload.create({
    collection: 'intelligence-executions' as never,
    data: {
      site: siteId,
      recommendation: recommendationId,
      targetCollection: 'content',
      targetId: sourceContentId,
      executedAt: new Date().toISOString(),
      executedBy: userId,
      beforeSnapshot,
      afterSnapshot,
      status: 'applied',
    } as never,
    overrideAccess: true,
  } as never)) as unknown as Record<string, unknown>

  const executionId = String(executionDoc.id)

  // 7. Update Source Content in CMS (PostgreSQL source of truth)
  await payload.update({
    collection: 'content',
    id: sourceContentId,
    data: {
      body: updatedBody,
    } as never,
    overrideAccess: true,
  } as never)

  return {
    success: true,
    executionId,
    sourceContentId,
    newRevision,
    anchorApplied: appliedAnchor,
    beforeSnapshot,
    afterSnapshot,
  }
}

/**
 * Rolls back an applied link execution, restoring the exact previous richText body.
 */
export async function rollbackLinkExecution(
  payload: Payload,
  executionId: string,
  userId: string,
): Promise<{ success: boolean; rolledBackExecutionId: string; restoredRevision: string }> {
  const execution = (await payload.findByID({
    collection: 'intelligence-executions' as never,
    id: executionId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!execution) {
    throw new Error(`Execution record ${executionId} not found.`)
  }

  if (execution.status !== 'applied') {
    throw new Error(
      `Execution ${executionId} has status "${execution.status}". Only "applied" executions can be rolled back.`,
    )
  }

  const beforeSnapshot = execution.beforeSnapshot as Record<string, unknown>
  if (!beforeSnapshot || !('body' in beforeSnapshot)) {
    throw new Error(`Execution ${executionId} does not contain a valid beforeSnapshot body.`)
  }

  const targetId = String(execution.targetId)

  // Restore the body to the target content
  await payload.update({
    collection: 'content',
    id: targetId,
    data: {
      body: beforeSnapshot.body,
    } as never,
    overrideAccess: true,
  } as never)

  // Mark execution as reverted
  await payload.update({
    collection: 'intelligence-executions' as never,
    id: executionId,
    data: {
      status: 'reverted',
      revertedAt: new Date().toISOString(),
      revertedBy: userId,
    } as never,
    overrideAccess: true,
  } as never)

  return {
    success: true,
    rolledBackExecutionId: executionId,
    restoredRevision: String(beforeSnapshot.revision || ''),
  }
}

/**
 * Bulk review handler for editor workflow (accept, dismiss, edit).
 */
export async function bulkReviewLinkOpportunities(
  payload: Payload,
  items: BulkReviewItem[],
  userId: string,
  options: {
    findOpportunity?: (id: string) => Promise<{
      sourceContentId: string
      targetContentId: string
      expectedRevision: string
      anchorText: string
    } | null>
  } = {},
): Promise<BulkReviewResult> {
  const result: BulkReviewResult = {
    processed: 0,
    accepted: 0,
    dismissed: 0,
    applied: 0,
    errors: [],
  }

  for (const item of items) {
    result.processed++
    try {
      if (item.action === 'dismiss') {
        result.dismissed++
      } else if (item.action === 'accept' || item.action === 'edit') {
        result.accepted++

        if (options.findOpportunity) {
          const opp = await options.findOpportunity(item.id)
          if (opp) {
            const anchor =
              item.action === 'edit' && item.editedAnchor ? item.editedAnchor : opp.anchorText

            await applyLinkOpportunity(payload, {
              sourceContentId: opp.sourceContentId,
              targetContentId: opp.targetContentId,
              expectedRevision: opp.expectedRevision,
              anchorText: anchor,
              userId,
              opportunityId: item.id,
            })
            result.applied++
          }
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      result.errors.push(`Item ${item.id} error: ${errMsg}`)
    }
  }

  return result
}
