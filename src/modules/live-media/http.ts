import { roomError, roomJson } from '@/modules/community/room-http'
import { CommunityError } from '@/modules/community/service'
import { LiveMediaError } from './provider'

export function liveMediaError(error: unknown) {
  if (error instanceof LiveMediaError) return roomJson({ error: error.message }, error.status)
  if (error instanceof CommunityError) return roomError(error)
  return roomJson({ error: 'The live media service is temporarily unavailable.' }, 503)
}
