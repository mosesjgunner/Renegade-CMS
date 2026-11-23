import { changeTheaterEvent, theaterCalendar, theaterEvent } from '@/modules/community/live-events'
import { sendConversationMessage } from '@/modules/community/conversation-composer'
import {
  roomBody,
  roomError,
  roomJson,
  roomMutation,
  roomRequest,
} from '@/modules/community/room-http'
import {
  moderateRoom,
  participateInRoom,
  requestRoomSpeaker,
  roomAttendees,
  roomOverview,
  setRoomInvitation,
} from '@/modules/community/room-participation'
import { listRoomMessages, markRoomRead, setRoomLifecycle } from '@/modules/community/rooms'
import { CommunityError } from '@/modules/community/service'

type Context = { params: Promise<{ roomId: string }> }

export async function GET(request: Request, { params }: Context) {
  try {
    const { payload, ...viewer } = await roomRequest(request.headers, (await params).roomId)
    const search = new URL(request.url).searchParams
    switch (search.get('view')) {
      case 'chat': {
        const afterSequence = Number(search.get('after') ?? 0)
        if (!Number.isSafeInteger(afterSequence) || afterSequence < 0 || afterSequence > 2147483647)
          throw new CommunityError('Invalid message cursor.', 422, 'INVALID_ROOM_CURSOR')
        return roomJson(
          await listRoomMessages(payload, {
            ...viewer,
            afterSequence,
            latest: !search.has('after'),
          }),
        )
      }
      case 'event-calendar':
        return await theaterCalendar(
          payload,
          viewer,
          new URL(`/rooms/${viewer.conversationId}`, request.url).href,
        )
      case 'event':
        return roomJson(await theaterEvent(payload, viewer))
      case 'attendees':
        return roomJson(await roomAttendees(payload, viewer))
      default:
        return roomJson(await roomOverview(payload, viewer))
    }
  } catch (error) {
    return roomError(error)
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { payload, ...viewer } = await roomMutation(request, (await params).roomId)
    const body = await roomBody(request)
    const action = body.action
    switch (action) {
      case 'schedule-event':
      case 'announce-event':
      case 'end-event':
      case 'publish-event-replay':
      case 'rsvp':
      case 'cancel-rsvp':
        return roomJson(await changeTheaterEvent(payload, viewer, body))
      case 'join':
      case 'leave':
        return roomJson(await participateInRoom(payload, viewer, action === 'leave'))
      case 'send': {
        const text = typeof body.body === 'string' ? body.body.trim() : ''
        if (
          !text ||
          text.length > 4000 ||
          typeof body.idempotencyKey !== 'string' ||
          body.idempotencyKey.length > 128
        )
          throw new CommunityError(
            'Send a message of 1–4000 characters with a message key.',
            422,
            'INVALID_ROOM_MESSAGE',
          )
        const message = await sendConversationMessage(payload, {
          ...viewer,
          senderId: viewer.memberId,
          body: text,
          idempotencyKey: body.idempotencyKey,
          roomQuestion: body.question === true,
        })
        return roomJson({ id: String(message.id) }, message.duplicate ? 200 : 201)
      }
      case 'read': {
        const sequence = Number(body.sequence)
        if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > 2147483647)
          throw new CommunityError('Invalid message cursor.', 422, 'INVALID_ROOM_CURSOR')
        return roomJson(await markRoomRead(payload, { ...viewer, upToSequence: sequence }))
      }
      case 'request-speaker':
        return roomJson(await requestRoomSpeaker(payload, viewer))
      case 'invite':
      case 'revoke-invite':
        return roomJson(
          await setRoomInvitation(
            payload,
            viewer,
            String(body.memberId ?? ''),
            action === 'invite',
          ),
        )
      case 'pin':
      case 'unpin':
      case 'remove':
      case 'approve-speaker':
      case 'decline-speaker':
        return roomJson(
          await moderateRoom(payload, viewer, { action, targetId: String(body.targetId ?? '') }),
        )
      case 'open':
      case 'close':
        return roomJson(
          await setRoomLifecycle(payload, {
            ...viewer,
            actorMemberId: viewer.memberId,
            lifecycle: action === 'open' ? 'open' : 'closed',
          }),
        )
      default:
        throw new CommunityError('Unknown room action.', 422, 'INVALID_ROOM_ACTION')
    }
  } catch (error) {
    return roomError(error)
  }
}
