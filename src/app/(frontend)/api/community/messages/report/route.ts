import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveCommunityActor, CommunityError } from '@/modules/community/service'
import {
  ConversationError,
  reportConversationMessage,
} from '@/modules/community/conversation-composer'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? request.headers.get('x-site-id') ?? 'default')
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId)
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  if (!body.conversationId || !body.messageId || !body.reason)
    return Response.json(
      { error: 'conversationId, messageId, and reason are required' },
      { status: 400 },
    )
  try {
    const report = await reportConversationMessage(payload, {
      siteId,
      conversationId: String(body.conversationId),
      memberId: actor.memberId,
      messageId: String(body.messageId),
      reason: String(body.reason),
      details: body.details ? String(body.details) : undefined,
    })
    return Response.json(
      { success: true, reportId: report.reportId, caseId: report.caseId },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof ConversationError || error instanceof CommunityError)
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    return Response.json({ error: 'Failed to report message' }, { status: 500 })
  }
}
