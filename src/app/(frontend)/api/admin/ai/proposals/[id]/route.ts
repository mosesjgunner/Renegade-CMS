import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  AI_WORKFLOW_TASKS,
  aiWorkflowUpdate,
  loadAiWorkflowTarget,
  type AiWorkflowTask,
} from '@/modules/ai/workflows'
import { relationId } from '@/modules/ai/connections'
import { decodeProposalValue } from '@/modules/ai/persistence'

export const runtime = 'nodejs'
type Doc = Record<string, unknown> & { id: string }
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role)))
    return fail('Editor access required.', 403)
  const { id } = await params
  const body = (await request.json()) as {
    siteId?: string
    decision?: string
    variantIndex?: number
  }
  if (!body.siteId || !['apply', 'decline'].includes(String(body.decision)))
    return fail('Site and decision are required.')
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
        decidedBy: auth.user.id,
        decidedAt: new Date().toISOString(),
      } as never,
      overrideAccess: true,
    })) as Doc
    return NextResponse.json({ proposal: { id, status: saved.status, decidedBy: auth.user.id } })
  }
  const task = String(proposal.task) as AiWorkflowTask
  if (!AI_WORKFLOW_TASKS.includes(task)) return fail('Unsupported proposal task.', 400)
  let target: Awaited<ReturnType<typeof loadAiWorkflowTarget>>
  try {
    target = await loadAiWorkflowTarget(
      payload,
      task,
      String(proposal.targetId),
      task === 'editor.improve-selection'
        ? String(decodeProposalValue(proposal.original) ?? '')
        : undefined,
    )
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Target is no longer available.', 409)
  }
  if (target.siteId !== body.siteId || target.collection !== proposal.targetCollection)
    return fail('Proposal target scope has changed.', 403)
  if (target.updatedAt !== proposal.targetUpdatedAt)
    return fail('The target changed after this proposal. Request a fresh proposal.', 409)
  let update: Record<string, unknown>
  try {
    update = aiWorkflowUpdate(target, decodeProposalValue(proposal.output), body.variantIndex ?? 0)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Proposal cannot be applied.', 409)
  }
  // Record the application intent before the owning surface is changed. A crash
  // leaves an inspectable applying state rather than a reusable ready proposal.
  await payload.update({
    collection: 'ai-proposals' as never,
    id,
    data: {
      status: 'applying',
      decidedBy: auth.user.id,
      decidedAt: new Date().toISOString(),
    } as never,
    overrideAccess: true,
  })
  try {
    await payload.update({
      collection: target.collection as never,
      id: target.doc.id,
      data: update as never,
      overrideAccess: true,
    })
    let revisionId: string | null = null
    if (task === 'editor.improve-selection') {
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
          actorId: auth.user.id,
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
        decidedBy: auth.user.id,
      },
    })
  } catch {
    await payload.update({
      collection: 'ai-proposals' as never,
      id,
      data: { status: 'failed-apply', failureCode: 'apply-uncertain' } as never,
      overrideAccess: true,
    })
    return fail(
      'Apply outcome needs operator review. Inspect the target and audit before retrying.',
      503,
    )
  }
}
