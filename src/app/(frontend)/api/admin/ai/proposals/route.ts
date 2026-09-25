import { randomUUID } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  AiGateway,
  buildInspectableContext,
  ollamaAdapter,
  openAiCompatibleAdapter,
} from '@/modules/ai/gateway'
import { AI_TASKS, type AiProposal, type AiTaskKey } from '@/modules/ai/contracts'
import {
  AI_WORKFLOW_TASKS,
  loadAiWorkflowTarget,
  type AiWorkflowTask,
} from '@/modules/ai/workflows'
import { connectionCredential, relationId } from '@/modules/ai/connections'
import { decodeProposalValue, encodeProposalValue } from '@/modules/ai/persistence'
import {
  reserveAiBudget,
  settleAiBudget,
  type AiBudgetLease,
} from '@/modules/ai/budget-reservation'
import type { ConnectionRecord } from '@/modules/extensions/contracts'

export const runtime = 'nodejs'
type Doc = Record<string, unknown> & { id: string }
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role)))
    return fail('Editor access required.', 403)
  let target: Awaited<ReturnType<typeof loadAiWorkflowTarget>>
  let task: AiWorkflowTask
  let body: {
    task?: string
    targetId?: string
    connectionId?: string
    siteId?: string
    selection?: string
  }
  try {
    body = await request.json()
    if (!AI_WORKFLOW_TASKS.includes(body.task as AiWorkflowTask) || !body.targetId || !body.siteId)
      return fail('Choose a workflow, target, and site.')
    task = body.task as AiWorkflowTask
    target = await loadAiWorkflowTarget(payload, task, body.targetId, body.selection)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Target could not be loaded.')
  }
  if (target.siteId !== body.siteId) return fail('Target belongs to another site.', 403)
  let connection: Doc | null = null
  if (body.connectionId) {
    try {
      connection = (await payload.findByID({
        collection: 'ai-connections' as never,
        id: body.connectionId,
        depth: 0,
        overrideAccess: true,
      })) as Doc
    } catch {
      return fail('Connection not found.', 404)
    }
    if (
      relationId(connection.site) !== target.siteId ||
      (connection.publication && relationId(connection.publication) !== target.publicationId)
    )
      return fail('Connection belongs to another site or publication.', 403)
    if (!(connection.allowedTasks as string[]).includes(task))
      return fail('Task is disabled on this connection.', 403)
  }
  const active =
    connection?.status === 'active' &&
    (connection.capabilities as string[]).includes(AI_TASKS[task].capability)
  let adapter = null
  if (active && connection) {
    try {
      const apiKey = await connectionCredential(payload, connection.id)
      adapter =
        connection.providerKey === 'ai.ollama'
          ? ollamaAdapter(String(connection.endpoint))
          : connection.providerKey === 'ai.openai-compatible'
            ? openAiCompatibleAdapter('ai.openai-compatible', String(connection.endpoint), apiKey)
            : null
    } catch {
      return fail('Connection credential is unavailable. Ask an operator to reconnect.', 503)
    }
  }
  const record: ConnectionRecord = {
    id: connection?.id ?? 'unconfigured',
    siteId: target.siteId,
    publicationId: target.publicationId ?? undefined,
    providerKey: String(connection?.providerKey ?? 'none'),
    externalAccountId: '',
    label: String(connection?.label ?? 'No provider'),
    status: active ? 'active' : 'disabled',
    encryptedSecretRef: null,
    scopes: [],
    expiresAt: null,
    refreshMetadata: null,
    capabilities: [],
    lastHealthCheckAt: null,
    lastError: null,
    auditEventIds: [],
  }
  let lease: AiBudgetLease | null = null
  let budgetStatus: 'busy' | 'no-budget' | null = null
  if (adapter && connection) {
    const { prompt } = buildInspectableContext(AI_TASKS[task], target.context, {
      includeArticle: true,
      includeBrandVoice: false,
      includeSources: false,
    })
    const reserveUsd =
      (Math.ceil(prompt.length / 4) * Number(connection.inputUsdPer1k) +
        Number(connection.maxOutputTokens) * Number(connection.outputUsdPer1k)) /
      1000
    const reservation = await reserveAiBudget(payload, {
      connectionId: connection.id,
      reserveUsd,
      perTaskUsd: Number(connection.perTaskUsd),
    })
    if (reservation.status === 'reserved') lease = reservation.lease
    else budgetStatus = reservation.status
  }
  const budget = connection
    ? {
        perTaskUsd: Number(connection.perTaskUsd),
        monthlyUsd: Number(connection.monthlyUsd),
        spentThisMonthUsd: lease?.spentBeforeUsd ?? 0,
      }
    : { perTaskUsd: 1, monthlyUsd: 1, spentThisMonthUsd: 0 }
  let result: AiProposal
  if (budgetStatus) {
    const preview = buildInspectableContext(AI_TASKS[task], target.context, {
      includeArticle: true,
      includeBrandVoice: false,
      includeSources: false,
    }).preview
    result = {
      status: budgetStatus,
      task,
      original: null,
      output: null,
      contextPreview: preview,
      audit: {
        id: `ai:${randomUUID()}`,
        redacted: true,
        providerKey: String(connection?.providerKey),
        model: String(connection?.model),
      },
    }
  } else
    try {
      result = await new AiGateway(adapter ? [adapter] : []).execute({
        connection: record,
        siteId: target.siteId,
        publicationId: target.publicationId ?? undefined,
        model: String(connection?.model ?? ''),
        task,
        context: target.context,
        controls: { includeArticle: true, includeBrandVoice: false, includeSources: false },
        permissions: [AI_TASKS[task].permission],
        allowedTasks: connection?.allowedTasks as AiTaskKey[] | undefined,
        allowedModels: active && connection ? (connection.models as string[]) : undefined,
        budget,
        cancel: request.signal,
        maxInputTokens: connection ? Number(connection.maxInputTokens) : undefined,
        maxOutputTokens: connection ? Number(connection.maxOutputTokens) : undefined,
        pricePer1kTokensUsd: connection
          ? {
              input: Number(connection.inputUsdPer1k),
              output: Number(connection.outputUsdPer1k),
            }
          : undefined,
      })
    } catch {
      if (lease && connection) await settleAiBudget(payload, connection.id, lease, null)
      return fail('AI proposal could not be prepared. Check task and connection settings.')
    }
  if (lease && connection)
    await settleAiBudget(
      payload,
      connection.id,
      lease,
      result.status === 'no-budget' && !result.usage ? 0 : (result.usage?.estimatedCostUsd ?? null),
    )
  const saved = (await payload.create({
    collection: 'ai-proposals' as never,
    data: {
      site: target.siteId,
      connection: connection?.id ?? null,
      task,
      targetCollection: target.collection,
      targetId: target.doc.id,
      targetUpdatedAt: target.updatedAt,
      status: result.status,
      original: encodeProposalValue(target.original),
      output: encodeProposalValue(result.output),
      contextPreview: result.contextPreview,
      usage: result.usage ?? null,
      auditId: result.audit.id,
      requestedBy: auth.user.id,
      failureCode: result.status === 'ready' ? null : result.status,
    } as never,
    overrideAccess: true,
  })) as Doc
  return NextResponse.json({
    proposal: {
      id: saved.id,
      task,
      status: result.status,
      original: target.original,
      output: result.output,
      contextPreview: result.contextPreview,
      usage: result.usage,
      audit: result.audit,
      targetUpdatedAt: target.updatedAt,
    },
  })
}

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role)))
    return fail('Editor access required.', 403)
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId')
  if (!siteId) return fail('Choose a site.')
  const results = await payload.find({
    collection: 'ai-proposals' as never,
    where: { site: { equals: siteId } },
    sort: '-createdAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  return NextResponse.json({
    proposals: (results.docs as Doc[]).map((doc) => ({
      id: doc.id,
      task: doc.task,
      targetCollection: doc.targetCollection,
      targetId: doc.targetId,
      status: doc.status,
      original: decodeProposalValue(doc.original),
      output: decodeProposalValue(doc.output),
      contextPreview: doc.contextPreview,
      usage: doc.usage,
      auditId: doc.auditId,
      requestedBy: relationId(doc.requestedBy),
      decidedBy: relationId(doc.decidedBy) || null,
      decidedAt: doc.decidedAt,
      createdAt: doc.createdAt,
      failureCode: doc.failureCode,
    })),
  })
}
