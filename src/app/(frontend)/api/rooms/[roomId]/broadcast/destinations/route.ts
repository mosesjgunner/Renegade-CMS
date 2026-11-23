import { roomBody, roomJson, roomMutation, roomRequest } from '@/modules/community/room-http'
import { destinationView, mutateDestination } from '@/modules/live-media/destinations'
import { liveMediaError } from '@/modules/live-media/http'
import { LiveMediaError } from '@/modules/live-media/provider'

type Context = { params: Promise<{ roomId: string }> }

export async function GET(request: Request, { params }: Context) {
  try {
    const viewer = await roomRequest(request.headers, (await params).roomId)
    if (!viewer.memberId) throw new LiveMediaError('Sign in required.', 401)
    return roomJson(await destinationView({ ...viewer, memberId: viewer.memberId }))
  } catch (error) {
    return liveMediaError(error)
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const viewer = await roomMutation(request, (await params).roomId)
    return roomJson(await mutateDestination(viewer, await roomBody(request)), 202)
  } catch (error) {
    return liveMediaError(error)
  }
}
