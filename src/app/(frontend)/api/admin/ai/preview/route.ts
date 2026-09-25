import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { AI_TASKS } from '@/modules/ai/contracts'
import { buildInspectableContext } from '@/modules/ai/gateway'
import {
  AI_WORKFLOW_TASKS,
  loadAiWorkflowTarget,
  type AiWorkflowTask,
} from '@/modules/ai/workflows'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role)))
    return NextResponse.json({ error: 'Editor access required.' }, { status: 403 })
  try {
    const body = (await request.json()) as {
      task?: string
      targetId?: string
      siteId?: string
      selection?: string
    }
    if (!body.targetId || !body.siteId || !AI_WORKFLOW_TASKS.includes(body.task as AiWorkflowTask))
      throw new Error('Choose a workflow, target, and site.')
    const task = body.task as AiWorkflowTask
    const target = await loadAiWorkflowTarget(payload, task, body.targetId, body.selection)
    if (target.siteId !== body.siteId)
      return NextResponse.json({ error: 'Target belongs to another site.' }, { status: 403 })
    const context = buildInspectableContext(AI_TASKS[task], target.context, {
      includeArticle: true,
      includeBrandVoice: false,
      includeSources: false,
    })
    return NextResponse.json({
      task,
      target: { collection: target.collection, id: target.doc.id, updatedAt: target.updatedAt },
      original: target.original,
      contextPreview: context.preview,
      contextText: context.prompt,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Preview failed.' },
      { status: 400 },
    )
  }
}
