import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveCommunityActor } from '@/modules/community/service'
import {
  ConversationError,
  listConversationMessages,
  sendConversationMessage,
} from '@/modules/community/conversation-composer'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const conversationId = url.searchParams.get('conversationId')
  const siteId = url.searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? 'default'

  if (!conversationId) {
    return Response.json({ error: 'conversationId is required' }, { status: 400 })
  }

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const messages = await listConversationMessages(payload, {
      siteId,
      conversationId,
      memberId: actor.memberId,
    })
    return Response.json({ messages }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (err: unknown) {
    if (err instanceof CommunityError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to retrieve messages' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? request.headers.get('x-site-id') ?? 'default')

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  const conversationId = body.conversationId ? String(body.conversationId) : undefined
  const messageBody = body.body ? String(body.body) : ''
  const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey) : ''
  const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.map(String) : undefined

  if (!messageBody) {
    return Response.json({ error: 'body is required' }, { status: 400 })
  }
  if (!conversationId)
    return Response.json({ error: 'conversationId is required' }, { status: 400 })

  try {
    const message = await sendConversationMessage(payload, {
      siteId,
      conversationId,
      senderId: actor.memberId,
      body: messageBody,
      idempotencyKey,
      attachmentIds,
    })
    return Response.json({ success: true, message }, { status: message.duplicate ? 200 : 201 })
  } catch (err: unknown) {
    if (err instanceof ConversationError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to send direct message' }, { status: 500 })
  }
}
