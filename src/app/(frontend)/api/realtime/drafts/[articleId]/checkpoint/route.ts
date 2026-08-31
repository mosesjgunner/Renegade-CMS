import config from '@payload-config'
import { getPayload } from 'payload'

import { articleScope, editorialActor, memberFromUser } from '@/modules/collaboration/http'
import { checkpointCollaborativeDraft } from '@/modules/collaboration/realtime'
import type { RichTextDocument } from '@/modules/editorial/contracts'
import { EditorialConflictError } from '@/modules/editorial/workflow'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  request: Request,
  context: RouteContext<'/api/realtime/drafts/[articleId]/checkpoint'>,
) {
  const { articleId } = await context.params
  const body = (await request.json().catch(() => null)) as {
    document?: RichTextDocument
    baseRevisionId?: string
    mutationId?: string
  } | null
  if (!body?.document || !body.baseRevisionId || !body.mutationId)
    return Response.json(
      { error: 'document, baseRevisionId, and mutationId are required.' },
      { status: 400 },
    )
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  const memberId = memberFromUser(auth.user)
  if (!memberId || !auth.user)
    return Response.json({ error: 'Authenticated team member required.' }, { status: 401 })
  try {
    const saved = await checkpointCollaborativeDraft(
      payload,
      payload as unknown as import('@/modules/collaboration/realtime').RealtimeStore,
      {
        memberId,
        scope: await articleScope(payload, articleId),
        articleId,
        actor: editorialActor(auth.user as unknown as Record<string, unknown>),
        actorUserId: String((auth.user as unknown as Record<string, unknown>).id),
        document: body.document,
        baseRevisionId: body.baseRevisionId,
        mutationId: body.mutationId,
      },
    )
    const article = (saved as unknown as { article: { currentRevision: { id?: string } | string } })
      .article
    return Response.json({
      status: 'checkpointed',
      currentRevisionId:
        typeof article.currentRevision === 'string'
          ? article.currentRevision
          : article.currentRevision.id,
    })
  } catch (error) {
    if (error instanceof EditorialConflictError)
      return Response.json({ error: 'draft_conflict', message: error.message }, { status: 409 })
    return Response.json(
      { error: error instanceof Error ? error.message : 'Draft checkpoint failed.' },
      { status: 403 },
    )
  }
}
