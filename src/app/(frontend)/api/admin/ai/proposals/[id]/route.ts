import config from '@payload-config'
import { createLocalReq, getPayload, type Payload } from 'payload'
import type { User } from '@/payload-types'
import { sql } from '@payloadcms/db-postgres'
import { transactionPayload } from '@/modules/core/transaction-payload'
import { NextResponse } from 'next/server'
import {
  AI_WORKFLOW_TASKS,
  aiWorkflowUpdate,
  loadAiWorkflowTarget,
  type AiWorkflowTask,
} from '@/modules/ai/workflows'
import { relationId } from '@/modules/ai/connections'
import { decodeProposalValue } from '@/modules/ai/persistence'
import { checkOperatorSiteAccess } from '@/modules/operations/operator-grants'

export const runtime = 'nodejs'
type Doc = Record<string, unknown> & { id: string }
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role)))
    return fail('Editor access required.', 403)
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) return fail('Proposal review requires transactional storage.', 503)
  const req = await createLocalReq({ user: auth.user }, payload)
  req.transactionID = transactionID
  const session = payload.db.sessions?.[String(transactionID)]?.db as
    | {
        execute: (query: unknown) => Promise<unknown>
      }
    | undefined
  if (!session) {
    await payload.db.rollbackTransaction(transactionID)
    return fail('Proposal review storage is unavailable.', 503)
  }
  try {
    const response = await reviewProposal(
      transactionPayload(payload, req),
      auth.user,
      request,
      params,
      session,
    )
    if (response.ok) await payload.db.commitTransaction(transactionID)
    else await payload.db.rollbackTransaction(transactionID)
    return response
  } catch {
    await payload.db.rollbackTransaction(transactionID)
    return fail('Proposal could not be applied. Reload the target and review before retrying.', 503)
  }
}

async function reviewProposal(
  payload: Payload,
  user: User,
  request: Request,
  params: Promise<{ id: string }>,
  session: { execute: (query: unknown) => Promise<unknown> },
) {
  const { id } = await params
  const body = (await request.json()) as {
    siteId?: string
    decision?: string
    variantIndex?: number
  }
  if (!body.siteId || !['apply', 'decline'].includes(String(body.decision)))
    return fail('Site and decision are required.')
  if (!(await checkOperatorSiteAccess(payload, user, body.siteId)))
    return fail('Staff site access required.', 403)
  // Serialize apply/decline/replay before reading the decision state.
  await session.execute(sql`SELECT id FROM ai_proposals WHERE id = ${id}::uuid FOR UPDATE`)
  let proposal: Doc
  try {
    proposal = (await payload.findByID({
      collection: 'ai-proposals' as never,
      id,
      depth: 0,
      overrideAccess: true,
    })) as Doc
  } catch {
    return fail('Proposal not found.', 404)
  }
  if (relationId(proposal.site) !== body.siteId)
    return fail('Proposal belongs to another site.', 403)
  if (proposal.status !== 'ready') return fail('This proposal is no longer ready for review.', 409)
  if (body.decision === 'decline') {
    const saved = (await payload.update({
      collection: 'ai-proposals' as never,
      id,
      data: {
        status: 'declined',
        decidedBy: user.id,
        decidedAt: new Date().toISOString(),
      } as never,
      overrideAccess: true,
    })) as Doc
    return NextResponse.json({ proposal: { id, status: saved.status, decidedBy: user.id } })
  }
  const task = String(proposal.task) as AiWorkflowTask
  if (!AI_WORKFLOW_TASKS.includes(task)) return fail('Unsupported proposal task.', 400)
  if (proposal.targetCollection === 'content')
    await session.execute(
      sql`SELECT id FROM content WHERE id = ${String(proposal.targetId)}::uuid FOR UPDATE`,
    )
  if (proposal.targetCollection === 'media-assets')
    await session.execute(
      sql`SELECT id FROM media_assets WHERE id = ${String(proposal.targetId)}::uuid FOR UPDATE`,
    )
  if (proposal.targetCollection === 'social-network-variants') {
    await session.execute(
      sql`SELECT id FROM social_network_variants WHERE id = ${String(proposal.targetId)}::uuid FOR UPDATE`,
    )
    // Parent state and scope must remain stable through the canonical copy save.
    await session.execute(
      sql`SELECT id FROM social_drafts WHERE id = (SELECT draft_id FROM social_network_variants WHERE id = ${String(proposal.targetId)}::uuid) FOR UPDATE`,
    )
  }
  let target: Awaited<ReturnType<typeof loadAiWorkflowTarget>>
  try {
    target = await loadAiWorkflowTarget(
      payload,
      task,
      String(proposal.targetId),
      task === 'editor.improve-selection'
        ? String(decodeProposalValue(proposal.original) ?? '')
        : undefined,
      body.siteId,
    )
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Target is no longer available.', 409)
  }
  if (target.siteId !== body.siteId || target.collection !== proposal.targetCollection)
    return fail('Proposal target scope has changed.', 403)
  if (target.updatedAt !== proposal.targetUpdatedAt)
    return fail('The target changed after this proposal. Request a fresh proposal.', 409)
  if (
    target.collection === 'content' &&
    (target.context.revisionId ?? null) !==
      ((proposal.contextPreview as { revisionId?: string | null } | undefined)?.revisionId ?? null)
  )
    return fail('The editorial revision changed. Request a fresh proposal.', 409)
  if (
    target.dependencyVersion !==
    (proposal.contextPreview as { dependencyVersion?: string } | undefined)?.dependencyVersion
  )
    return fail('The distribution source or draft changed. Request a fresh proposal.', 409)
  let update: Record<string, unknown>
  try {
    update = aiWorkflowUpdate(target, decodeProposalValue(proposal.output), body.variantIndex ?? 0)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Proposal cannot be applied.', 409)
  }
  // Decision, canonical save, revision and audit commit together or roll back together.
  await payload.update({
    collection: 'ai-proposals' as never,
    id,
    data: {
      status: 'applying',
      decidedBy: user.id,
      decidedAt: new Date().toISOString(),
    } as never,
    overrideAccess: true,
  })
  {
    await payload.update({
      collection: target.collection as never,
      id: target.doc.id,
      data: update as never,
      overrideAccess: false,
    })
    let revisionId: string | null = null
    if (target.collection === 'content') {
      const article = await payload.find({
        collection: 'article-family-content' as never,
        where: { content: { equals: target.doc.id } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      revisionId = relationId((article.docs[0] as Doc | undefined)?.currentRevision) || null
    }
    const saved = (await payload.update({
      collection: 'ai-proposals' as never,
      id,
      data: {
        status: 'applied',
        application: {
          collection: target.collection,
          targetId: target.doc.id,
          fields: Object.keys(update),
          revisionId,
          actorId: user.id,
          appliedAt: new Date().toISOString(),
        },
      } as never,
      overrideAccess: true,
    })) as Doc
    return NextResponse.json({
      proposal: {
        id,
        status: saved.status,
        application: saved.application,
        decidedBy: user.id,
      },
    })
  }
}
