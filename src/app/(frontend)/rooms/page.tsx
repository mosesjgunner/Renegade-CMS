import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { roomRequest } from '@/modules/community/room-http'
import { listSiteRooms } from '@/modules/community/room-participation'
import { CommunityError } from '@/modules/community/service'
import { CreateRoomForm } from '@/modules/community/RoomView'

export default async function RoomsPage() {
  const directory = await (async () => {
    try {
      const { payload, siteId, memberId } = await roomRequest(await headers())
      return await listSiteRooms(payload, siteId, memberId)
    } catch (error) {
      if (error instanceof CommunityError && error.status === 404) notFound()
      throw error
    }
  })()
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-3xl font-bold">Rooms</h1>
      {directory.rooms.length ? (
        <ul className="space-y-3">
          {directory.rooms.map((room) => (
            <li key={room.id}>
              <Link href={`/rooms/${room.id}`}>{room.title}</Link>
              {room.event_title && room.event_starts_at && (
                <p>
                  {room.event_title}
                  {' · '}
                  <time dateTime={room.event_starts_at.toISOString()}>
                    {room.event_starts_at.toISOString().slice(0, 16).replace('T', ' ')} UTC
                  </time>
                </p>
              )}
              {room.event_announcement && <p>{room.event_announcement}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p>No rooms are available to you.</p>
      )}
      {directory.canCreate && <CreateRoomForm />}
    </main>
  )
}
