import config from '@payload-config'
import { getPayload } from 'payload'
import { verifyCsrf } from '@/modules/identity/member-identity'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'
import { ConversationError } from './conversation-composer'
import { roomIdPattern } from './rooms'
import { CommunityError, resolveCommunityActor } from './service'

export function roomJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function roomRequest(headers: Headers, roomId?: string) {
  if (roomId !== undefined && !roomIdPattern.test(roomId))
    throw new CommunityError('Room not found.', 404, 'ROOM_NOT_FOUND')
  const payload = await getPayload({ config })
  const siteId = await publicSiteForHost(payload, headers.get('host'))
  if (!siteId) throw new CommunityError('Site not found.', 404, 'SITE_NOT_FOUND')
  const actor = await resolveCommunityActor(payload, headers, undefined, { touchSession: false })
  return {
    payload,
    siteId,
    memberId: actor.memberId ?? null,
    conversationId: roomId?.toLowerCase() ?? '',
  }
}

export async function roomMutation(request: Request, roomId?: string) {
  const context = await roomRequest(request.headers, roomId)
  if (!context.memberId) throw new CommunityError('Sign in required.', 401, 'SIGN_IN_REQUIRED')
  if (!verifyCsrf(request.headers) || !(await samePublicOrigin(context.payload, request, true)))
    throw new CommunityError('CSRF verification required.', 403, 'CSRF_REQUIRED')
  return { ...context, memberId: context.memberId }
}

export async function roomBody(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new CommunityError('A JSON object is required.', 400, 'INVALID_ROOM_REQUEST')
  return body as Record<string, unknown>
}

export function roomError(error: unknown) {
  if (error instanceof CommunityError || error instanceof ConversationError)
    return roomJson({ error: error.message, code: error.code }, error.status)
  console.error('Room request failed', error)
  return roomJson({ error: 'The room service is temporarily unavailable.' }, 503)
}
