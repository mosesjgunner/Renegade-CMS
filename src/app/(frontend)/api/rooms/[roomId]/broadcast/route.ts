import { roomBody, roomJson, roomMutation, roomRequest } from '@/modules/community/room-http'
import { roomIdPattern } from '@/modules/community/rooms'
import { liveMediaError } from '@/modules/live-media/http'
import { LiveMediaError } from '@/modules/live-media/provider'
import { liveHostView, operateBroadcast, startBroadcast } from '@/modules/live-media/sessions'

type Context = { params: Promise<{ roomId: string }> }

export async function GET(request: Request, { params }: Context) {
  try {
    const viewer = await roomRequest(request.headers, (await params).roomId)
    if (!viewer.memberId) throw new LiveMediaError('Sign in required.', 401)
    return roomJson(await liveHostView({ ...viewer, memberId: viewer.memberId }))
  } catch (error) {
    return liveMediaError(error)
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const viewer = await roomMutation(request, (await params).roomId)
    const body = await roomBody(request)
    if (body.action === 'start') {
      if (body.provider !== 'mediamtx' && body.provider !== 'cloudflare')
        throw new LiveMediaError('Choose a live media provider.', 422)
      const session = await startBroadcast(viewer, {
        provider: body.provider,
        inputId: typeof body.inputId === 'string' ? body.inputId : '',
        recording: body.recording === true,
      })
      return roomJson({ session })
    }
    const id = typeof body.sessionId === 'string' ? body.sessionId : ''
    if (!roomIdPattern.test(id)) throw new LiveMediaError('A broadcast ID is required.', 422)
    switch (body.action) {
      case 'connect':
      case 'end':
      case 'heartbeat':
      case 'record':
      case 'revoke':
        return roomJson(
          await operateBroadcast(viewer, id.toLowerCase(), body.action, body.recording === true),
        )
      default:
        throw new LiveMediaError('Unknown broadcast action.', 422)
    }
  } catch (error) {
    return liveMediaError(error)
  }
}
