import { roomBody, roomError, roomJson, roomMutation } from '@/modules/community/room-http'
import {
  createRoom,
  type RoomAccessPolicy,
  type RoomHistoryPolicy,
  type RoomMode,
} from '@/modules/community/rooms'

export async function POST(request: Request) {
  try {
    const { payload, siteId, memberId } = await roomMutation(request)
    const body = await roomBody(request)
    const text = (key: string) => (typeof body[key] === 'string' ? body[key] : undefined)
    const room = await createRoom(payload, {
      siteId,
      creatorMemberId: memberId,
      title: text('title') ?? '',
      mode: text('mode') as RoomMode | undefined,
      accessPolicy: text('accessPolicy') as RoomAccessPolicy | undefined,
      historyPolicy: text('historyPolicy') as RoomHistoryPolicy | undefined,
      groupId: text('groupId'),
      contentId: text('contentId'),
      discussionId: text('discussionId'),
      eventId: text('eventId'),
      eventRestricted: body.eventRestricted === true,
      participantLimit:
        body.participantLimit === undefined ? undefined : Number(body.participantLimit),
      startsAt: text('startsAt'),
      endsAt: text('endsAt'),
      entitlement: {
        resource: text('entitlementResource') ?? '',
        capability: text('entitlementCapability') ?? '',
        scope: text('entitlementScope'),
      },
    })
    return roomJson({ ...room, href: `/rooms/${room.id}` }, 201)
  } catch (error) {
    return roomError(error)
  }
}
