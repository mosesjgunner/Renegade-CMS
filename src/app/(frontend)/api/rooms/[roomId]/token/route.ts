import { roomRequest } from '@/modules/community/room-http'
import { roomPlayback } from '@/modules/community/room-media'
import { liveAudiencePlayback } from '@/modules/live-media/sessions'
import { liveMediaError } from '@/modules/live-media/http'

export async function GET(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { payload, ...viewer } = await roomRequest(request.headers, (await params).roomId)
    const local = await roomPlayback(payload, viewer)
    const live = await liveAudiencePlayback({ payload, ...viewer })
    if (!live) return local
    const headers = new Headers(live.headers)
    for (const cookie of local.headers.getSetCookie()) headers.append('Set-Cookie', cookie)
    return Response.json({ ...(await local.json()), ...(await live.json()) }, { headers })
  } catch (error) {
    return liveMediaError(error)
  }
}
