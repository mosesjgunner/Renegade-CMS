import { roomRequest } from '@/modules/community/room-http'
import { roomIdPattern } from '@/modules/community/rooms'
import { authorizeGateway } from '@/modules/live-media/sessions'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; action: string }> },
) {
  const { sessionId, action } = await params
  const headers = { 'Cache-Control': 'private, no-store' }
  if (
    !roomIdPattern.test(sessionId) ||
    (action !== 'publish' && action !== 'watch' && action !== 'replay')
  )
    return new Response(null, { status: 403, headers })
  try {
    const { payload, siteId, memberId } = await roomRequest(request.headers)
    await authorizeGateway(
      { payload, siteId, memberId },
      sessionId.toLowerCase(),
      action,
      request.headers,
    )
    return new Response(null, { status: 204, headers })
  } catch {
    return new Response(null, { status: 403, headers })
  }
}
