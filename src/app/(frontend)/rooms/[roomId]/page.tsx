import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { roomRequest } from '@/modules/community/room-http'
import { roomOverview } from '@/modules/community/room-participation'
import { CommunityError } from '@/modules/community/service'
import { RoomView } from '@/modules/community/RoomView'
import { liveMediaEnabled } from '@/modules/live-media/sessions'

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  const room = await (async () => {
    try {
      const { payload, ...viewer } = await roomRequest(await headers(), roomId)
      return { viewer, overview: await roomOverview(payload, viewer) }
    } catch (error) {
      if (error instanceof CommunityError && [403, 404].includes(error.status)) notFound()
      throw error
    }
  })()
  return (
    <RoomView
      roomId={room.viewer.conversationId}
      overview={room.overview}
      broadcasts={liveMediaEnabled()}
    />
  )
}
