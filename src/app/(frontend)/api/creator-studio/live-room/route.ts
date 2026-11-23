import { roomError, roomJson, roomMutation } from '@/modules/community/room-http'
import { createRoom } from '@/modules/community/rooms'
import { CommunityError } from '@/modules/community/service'
import { authorizeCreator } from '@/modules/creator-studio/policy'
import { submissionJSON } from '@/modules/creator-studio/submission-http'
import { MediaWorkflowError } from '@/modules/media/workflow'

export async function POST(request: Request) {
  try {
    const actor = await roomMutation(request)
    const { title, accessPolicy } = await submissionJSON(request)
    if (typeof title !== 'string' || (accessPolicy !== 'public' && accessPolicy !== 'members'))
      throw new CommunityError(
        'Enter a room name and choose who can watch.',
        400,
        'INVALID_ROOM_REQUEST',
      )
    await authorizeCreator(actor.payload, { ...actor, capability: 'live.host' }).catch(() => {
      throw new CommunityError(
        'Your account cannot open a live room on this site.',
        403,
        'CREATOR_LIVE_DENIED',
      )
    })
    const room = await createRoom(actor.payload, {
      title,
      siteId: actor.siteId,
      creatorMemberId: actor.memberId,
      accessPolicy,
      mode: 'theater',
      creatorTheater: true,
    })
    return roomJson({ id: room.id }, 201)
  } catch (error) {
    if (error instanceof MediaWorkflowError) return roomJson({ error: error.message }, error.status)
    return roomError(error)
  }
}
