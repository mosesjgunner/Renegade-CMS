import { roomRequest } from '@/modules/community/room-http'
import { roomPlayback } from '@/modules/community/room-media'
import { liveAudiencePlayback } from '@/modules/live-media/sessions'
import { liveMediaError } from '@/modules/live-media/http'

export async function GET(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { payload, ...viewer } = await roomRequest(request.headers, (await params).roomId)
    return (
      (await liveAudiencePlayback({ payload, ...viewer })) ?? (await roomPlayback(payload, viewer))
    )
  } catch (error) {
    return liveMediaError(error)
  }
}
