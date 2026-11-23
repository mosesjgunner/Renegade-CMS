import { roomError, roomRequest } from '@/modules/community/room-http'
import { serveRoomMedia } from '@/modules/community/room-media'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string; file: string }> },
) {
  try {
    const { roomId, file } = await params
    const { payload, ...viewer } = await roomRequest(request.headers, roomId)
    return await serveRoomMedia(payload, viewer, file, request)
  } catch (error) {
    return roomError(error)
  }
}

export async function HEAD(request: Request, context: Parameters<typeof GET>[1]) {
  const response = await GET(request, context)
  return new Response(null, { status: response.status, headers: response.headers })
}
