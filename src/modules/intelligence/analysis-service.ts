import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import type { AnalysisExecutionEvidence, DeterministicCheckResult } from './contracts'
import { runDeterministicContentChecks } from './deterministic-analyzer'
import { runContentAiAssessment } from './ai-assessment'
import { isRegisteredCollection } from '../public/registered-collections'

export type RunAnalysisOptions = {
  contentId: string
  siteId: string
  force?: boolean
  runAi?: boolean
}

export type AnalysisRunResult = {
  analysisId: string
  targetId: string
  siteId: string
  revision: string
  status: 'completed' | 'failed' | 'stale'
  isIdempotentReuse: boolean
  deterministicFindingsCount: number
  aiFindingsCount: number
  recommendationsCount: number
  evidence: AnalysisExecutionEvidence
  error?: Record<string, unknown> | null
}

function computeContentFingerprint(doc: Record<string, unknown>, bodyText: string): string {
  const payload = [
    String(doc.title || ''),
    String(doc.seoTitle || ''),
    String(doc.description || ''),
    String(doc.seoDescription || ''),
    String(doc.canonicalPath || ''),
    String(doc.slug || ''),
    bodyText,
  ].join('::')

  return createHash('sha256').update(payload).digest('hex').slice(0, 32)
}

function extractPlainTextFromBody(body: unknown): string {
  if (!body) return ''
  if (typeof body === 'string') return body
  if (typeof body === 'object' && body !== null && 'root' in body) {
    const extract = (node: Record<string, unknown>): string => {
      let str = ''
      if (typeof node.text === 'string') str += node.text + ' '
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          str += extract(child as Record<string, unknown>)
        }
      }
      return str
    }
    return extract((body as { root: Record<string, unknown> }).root).trim()
  }
  return ''
}

function extractHeadingsFromBody(body: unknown): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = []
  if (typeof body !== 'object' || body === null || !('root' in body)) return headings

  const scan = (node: Record<string, unknown>) => {
    if (node.type === 'heading' && typeof node.tag === 'string') {
      const match = node.tag.match(/h([1-6])/i)
      if (match) {
        const level = parseInt(match[1], 10)
        let text = ''
        if (Array.isArray(node.children)) {
          for (const c of node.children) {
            if (typeof (c as Record<string, unknown>).text === 'string') {
              text += (c as Record<string, unknown>).text
            }
          }
        }
        headings.push({ level, text: text.trim() })
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) scan(child as Record<string, unknown>)
    }
  }

  scan((body as { root: Record<string, unknown> }).root)
  return headings
}

/**
 * Executes incremental, idempotent content intelligence analysis.
 * - Deterministic checks run first.
 * - AI assessment runs second (proposals only, never auto-mutates).
 * - Stale prior analyses are marked stale.
 * - Bounded evidence is saved to reproduce conclusions.
 */
export async function runContentIntelligenceAnalysis(
  payload: Payload,
  options: RunAnalysisOptions,
): Promise<AnalysisRunResult> {
  const { contentId, siteId, force = false, runAi = false } = options
  const version = '1.0.0'
  const source = runAi ? 'renegade-hybrid-analyzer' : 'renegade-deterministic-analyzer'
  const now = new Date().toISOString()

  // 1. Fetch Target Content
  const contentDoc = (await payload.findByID({
    collection: 'content',
    id: contentId,
    depth: 1,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!contentDoc) {
    throw new Error(`Content item ${contentId} not found.`)
  }

  const bodyText = extractPlainTextFromBody(contentDoc.body)
  const headings = extractHeadingsFromBody(contentDoc.body)
  const revision = computeContentFingerprint(contentDoc, bodyText)

  // 2. Idempotency Check: if analysis for this revision exists and is not stale, reuse
  if (!force) {
    const existing = await payload.find({
      collection: 'intelligence-analyses' as never,
      where: {
        and: [
          { site: { equals: siteId } },
          { targetType: { equals: 'content' } },
          { targetId: { equals: contentId } },
          { contentRevision: { equals: revision } },
          { status: { equals: 'completed' } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })

    if (existing.docs.length > 0) {
      const doc = existing.docs[0] as unknown as {
        id: string
        evidence: AnalysisExecutionEvidence
        status: 'completed'
      }
      return {
        analysisId: String(doc.id),
        targetId: contentId,
        siteId,
        revision,
        status: doc.status,
        isIdempotentReuse: true,
        deterministicFindingsCount: doc.evidence.rawChecks?.length || 0,
        aiFindingsCount: doc.evidence.aiAssessment?.success ? 1 : 0,
        recommendationsCount: 0,
        evidence: doc.evidence,
      }
    }
  }

  // 3. Stale-Result Handling: Mark existing active analyses for this content as 'stale'
  const priorAnalyses = await payload.find({
    collection: 'intelligence-analyses' as never,
    where: {
      and: [
        { site: { equals: siteId } },
        { targetType: { equals: 'content' } },
        { targetId: { equals: contentId } },
        { status: { in: ['completed', 'pending', 'running'] } },
      ],
    },
    limit: 100,
    overrideAccess: true,
  })

  for (const prior of priorAnalyses.docs as unknown as Array<{ id: string | number }>) {
    await payload.update({
      collection: 'intelligence-analyses' as never,
      id: prior.id,
      data: { status: 'stale' } as never,
      overrideAccess: true,
    })
  }

  // 4. Fetch context: known entities and claims
  const entitiesQuery = await payload.find({
    collection: 'intelligence-entities' as never,
    where: { site: { equals: siteId } },
    limit: 100,
    overrideAccess: true,
  })
  const knownEntities = entitiesQuery.docs.map((d: any) => ({
    id: String(d.id),
    name: String(d.name),
    slug: String(d.slug),
  }))

  const claimsQuery = await payload.find({
    collection: 'intelligence-claims' as never,
    where: {
      and: [{ site: { equals: siteId } }, { targetContent: { equals: contentId } }],
    },
    limit: 100,
    overrideAccess: true,
  })
  const associatedClaims = claimsQuery.docs.map((c: any) => ({
    id: String(c.id),
    statement: String(c.statement),
    verificationStatus: String(c.verificationStatus || 'unverified'),
    citationCount: 0,
  }))

  // 5. Execute Deterministic Checks
  const deterministicResults: DeterministicCheckResult[] = runDeterministicContentChecks({
    id: contentId,
    title: contentDoc.title as string | null,
    seoTitle: contentDoc.seoTitle as string | null,
    description: contentDoc.description as string | null,
    seoDescription: contentDoc.seoDescription as string | null,
    canonicalPath: contentDoc.canonicalPath as string | null,
    slug: contentDoc.slug as string | null,
    bodyText,
    headings,
    knownEntities,
    associatedClaims,
  })

  // 6. Execute AI Assessment (if requested)
  let aiResult: Awaited<ReturnType<typeof runContentAiAssessment>> | null = null
  if (runAi) {
    aiResult = await runContentAiAssessment(payload, {
      siteId,
      contentId,
      title: String(contentDoc.title || ''),
      bodyText,
      existingSeoTitle: contentDoc.seoTitle as string | null,
      existingSeoDescription: contentDoc.seoDescription as string | null,
    })
  }

  // 7. Assemble Structured Evidence
  const evidence: AnalysisExecutionEvidence = {
    contentRevision: revision,
    source,
    version,
    timestamp: now,
    titleLength: (contentDoc.seoTitle || contentDoc.title || '').toString().trim().length,
    descriptionLength: (contentDoc.seoDescription || contentDoc.description || '').toString().trim()
      .length,
    wordCount: bodyText.split(/\s+/).filter(Boolean).length,
    h1Count: headings.filter((h) => h.level === 1).length,
    headingsSummary: headings.map((h) => `H${h.level}: ${h.text}`),
    hasCanonical: Boolean(contentDoc.canonicalPath),
    matchedEntities: knownEntities.filter((e) => bodyText.includes(e.name)).map((e) => e.name),
    unverifiedClaimsCount: associatedClaims.filter((c) => c.verificationStatus === 'unverified')
      .length,
    citationsCount: 0,
    rawChecks: deterministicResults,
    ...(aiResult
      ? {
          aiAssessment: {
            provider: aiResult.provider,
            model: aiResult.model,
            ran: true,
            success: !aiResult.error,
            error: aiResult.error?.message,
          },
        }
      : {}),
  }

  // 8. Persist Analysis Record
  const analysisDoc = (await payload.create({
    collection: 'intelligence-analyses' as never,
    data: {
      site: siteId,
      targetType: 'content',
      targetId: contentId,
      contentRevision: revision,
      source,
      version,
      timestamp: now,
      status: 'completed',
      evidence,
      error: aiResult?.error ? { ...aiResult.error } : null,
    } as never,
    overrideAccess: true,
  })) as { id: string }

  // 9. Persist Deterministic Findings & Recommendations
  let recCount = 0
  for (const check of deterministicResults) {
    const dedupeKey = `det:${check.ruleId}:${contentId}`

    const finding = (await payload.create({
      collection: 'intelligence-findings' as never,
      data: {
        site: siteId,
        analysis: analysisDoc.id,
        targetType: 'content',
        targetId: contentId,
        ruleId: check.ruleId,
        nature: 'deterministic',
        severity: check.severity,
        message: check.message,
        evidence: check.evidence,
        status: 'open',
        dedupeKey,
      } as never,
      overrideAccess: true,
    })) as { id: string }

    if (check.recommendation) {
      await payload.create({
        collection: 'intelligence-recommendations' as never,
        data: {
          site: siteId,
          analysis: analysisDoc.id,
          finding: finding.id,
          targetCollection: 'content',
          targetId: contentId,
          isProposal: true, // MUST remain a proposal
          nature: 'deterministic',
          action: check.recommendation.action,
          currentValue: check.recommendation.currentValue,
          proposedValue: check.recommendation.proposedValue,
          rationale: check.recommendation.rationale,
          validationStatus: 'valid',
          status: 'pending',
        } as never,
        overrideAccess: true,
      })
      recCount++
    }
  }

  // 10. Persist AI Findings & Recommendations (Strictly labeled isProposal: true)
  let aiFindingsCount = 0
  if (aiResult && !aiResult.error) {
    for (const f of aiResult.findings) {
      const dedupeKey = `ai:${f.ruleId}:${contentId}`
      const finding = (await payload.create({
        collection: 'intelligence-findings' as never,
        data: {
          site: siteId,
          analysis: analysisDoc.id,
          targetType: 'content',
          targetId: contentId,
          ruleId: f.ruleId,
          nature: 'ai_assessment',
          severity: f.severity,
          message: f.message,
          evidence: f.evidence,
          status: 'open',
          dedupeKey,
        } as never,
        overrideAccess: true,
      })) as { id: string }
      aiFindingsCount++

      // Associated recommendation
      const matchingRec = aiResult.recommendations.find((r) => r.targetId === contentId)
      if (matchingRec) {
        await payload.create({
          collection: 'intelligence-recommendations' as never,
          data: {
            site: siteId,
            analysis: analysisDoc.id,
            finding: finding.id,
            targetCollection: matchingRec.targetCollection,
            targetId: matchingRec.targetId,
            isProposal: true, // Strict invariant: AI output is ALWAYS a proposal
            nature: 'ai',
            action: matchingRec.action,
            currentValue: matchingRec.currentValue,
            proposedValue: matchingRec.proposedValue,
            rationale: matchingRec.rationale,
            validationStatus: 'valid',
            status: 'pending',
          } as never,
          overrideAccess: true,
        })
        recCount++
      }
    }
  }

  return {
    analysisId: analysisDoc.id,
    targetId: contentId,
    siteId,
    revision,
    status: 'completed',
    isIdempotentReuse: false,
    deterministicFindingsCount: deterministicResults.length,
    aiFindingsCount,
    recommendationsCount: recCount,
    evidence,
    error: aiResult?.error ? { ...aiResult.error } : null,
  }
}

/**
 * Human Approval Workflow: approve or reject a recommendation.
 */
export type ApproveRecommendationInput = {
  recommendationId: string
  userId: string
  approve?: boolean
  decision?: 'approved' | 'rejected'
  rejectionReason?: string
}

export async function approveIntelligenceRecommendation(
  payload: Payload,
  input: ApproveRecommendationInput,
): Promise<{ success: boolean; recommendation: Record<string, unknown> }> {
  const rec = (await payload.findByID({
    collection: 'intelligence-recommendations' as never,
    id: input.recommendationId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!rec) {
    throw new Error(`Recommendation ${input.recommendationId} not found.`)
  }

  if (rec.status !== 'pending') {
    throw new Error(
      `Recommendation is already ${rec.status}. Only pending recommendations can be reviewed.`,
    )
  }

  const isApproved = input.decision === 'approved' || input.approve === true
  const status = isApproved ? 'approved' : 'rejected'
  const updated = (await payload.update({
    collection: 'intelligence-recommendations' as never,
    id: input.recommendationId,
    data: {
      status,
      rejectionReason: isApproved ? null : input.rejectionReason || 'Rejected by reviewer.',
      decidedBy: input.userId,
      decidedAt: new Date().toISOString(),
    } as never,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>

  return { success: true, recommendation: updated }
}

/**
 * Applies an approved recommendation to the target content.
 * Records an immutable execution history audit log with before/after snapshots.
 * Cannot be called on unapproved or rejected proposals.
 */
export async function executeApprovedRecommendation(
  payload: Payload,
  input: {
    recommendationId: string
    userId: string
  },
): Promise<{
  success: boolean
  executionId: string
  beforeSnapshot: Record<string, unknown>
  afterSnapshot: Record<string, unknown>
}> {
  const rec = (await payload.findByID({
    collection: 'intelligence-recommendations' as never,
    id: input.recommendationId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!rec) {
    throw new Error(`Recommendation ${input.recommendationId} not found.`)
  }

  if (rec.status !== 'approved') {
    throw new Error(
      `Cannot execute recommendation with status "${rec.status}". Must be "approved" first.`,
    )
  }

  const targetCollection = String(rec.targetCollection || 'content')
  const targetId = String(rec.targetId)

  // 1. Fetch Target Document Before Snapshot
  const targetDoc = (await payload.findByID({
    collection: targetCollection as never,
    id: targetId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!targetDoc) {
    throw new Error(`Target document ${targetCollection}/${targetId} not found.`)
  }

  const beforeSnapshot: Record<string, unknown> = {}
  const updateData: Record<string, unknown> = {}
  const action = String(rec.action)
  const proposed = rec.proposedValue

  if (action === 'update_seo_title') {
    beforeSnapshot.seoTitle = targetDoc.seoTitle
    updateData.seoTitle = typeof proposed === 'string' ? proposed : String(proposed)
  } else if (action === 'update_seo_description') {
    beforeSnapshot.seoDescription = targetDoc.seoDescription
    updateData.seoDescription = typeof proposed === 'string' ? proposed : String(proposed)
  } else if (action === 'update_canonical_path') {
    beforeSnapshot.canonicalPath = targetDoc.canonicalPath
    updateData.canonicalPath = typeof proposed === 'string' ? proposed : String(proposed)
  } else {
    // Custom action payload
    if (typeof proposed === 'object' && proposed !== null) {
      for (const [k, v] of Object.entries(proposed)) {
        beforeSnapshot[k] = targetDoc[k]
        updateData[k] = v
      }
    }
  }

  // 2. Apply change to target collection
  const updatedDoc = (await payload.update({
    collection: targetCollection as never,
    id: targetId,
    data: updateData as never,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>

  const afterSnapshot: Record<string, unknown> = {}
  for (const k of Object.keys(beforeSnapshot)) {
    afterSnapshot[k] = updatedDoc[k]
  }

  // 3. Record Immutable Execution History
  const executionDoc = (await payload.create({
    collection: 'intelligence-executions' as never,
    data: {
      site: rec.site,
      recommendation: rec.id,
      targetCollection,
      targetId,
      executedAt: new Date().toISOString(),
      executedBy: input.userId,
      beforeSnapshot,
      afterSnapshot,
      status: 'applied',
    } as never,
    overrideAccess: true,
  })) as { id: string }

  // 4. Mark Recommendation as Applied
  await payload.update({
    collection: 'intelligence-recommendations' as never,
    id: input.recommendationId,
    data: { status: 'applied' } as never,
    overrideAccess: true,
  })

  return {
    success: true,
    executionId: executionDoc.id,
    beforeSnapshot,
    afterSnapshot,
  }
}

/**
 * Safely queues or triggers intelligence analysis for a content item.
 * Skips gracefully if the intelligence module is not active or registration is omitted.
 */
export async function queueOrTriggerContentIntelligence(
  payload: Payload,
  input: { contentId: string; siteId: string },
): Promise<void> {
  if (!isRegisteredCollection(payload, 'intelligence-analyses')) return

  try {
    if (typeof payload.jobs?.queue === 'function') {
      await payload.jobs.queue({
        task: 'intelligence-content-analysis',
        input: { contentId: input.contentId, siteId: input.siteId },
      } as never)
      return
    }
  } catch (err) {
    // If job queue is inactive or task unregistered, degrade gracefully
  }

  try {
    await runContentIntelligenceAnalysis(payload, {
      contentId: input.contentId,
      siteId: input.siteId,
      runAi: false,
    })
  } catch (err) {
    // Non-fatal if direct analysis run errors during afterChange
  }
}
