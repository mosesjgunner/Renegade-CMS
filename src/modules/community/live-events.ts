import type { Payload } from 'payload'
import { assertIanaTimeZone } from '@/modules/calendar/contracts'
import type { RoomViewer } from './room-participation'
import {
  appendRoomNotice,
  canManageRoom,
  requireRoomAccess,
  roomQuery,
  roomTransaction,
} from './rooms'
import { CommunityError } from './service'

export type LiveEvent = {
  room_id: string
  title: string
  starts_at: Date
  time_zone: string
  source: 'broadcast' | 'premiere' | 'external'
  provider_url: string | null
  rsvp_enabled: boolean
  announcement: string
  session_id: string | null
  ended_at: Date | null
  replay_drafted_at: Date | null
  replay_published_at: Date | null
}

export async function loadLiveEvent(query: ReturnType<typeof roomQuery>, roomId: string) {
  const { rows } = await query<LiveEvent>('SELECT * FROM live_events WHERE room_id=$1', [roomId])
  return rows[0] ?? null
}

export async function listTheaterCalendar(payload: Payload, siteIds: string[] | null) {
  const { rows } = await roomQuery(payload)<LiveEvent & { site_id: string }>(
    `SELECT e.*, b.site_id FROM live_events e JOIN room_bindings b ON b.conversation_id=e.room_id
     WHERE ($1::uuid[] IS NULL OR b.site_id=ANY($1::uuid[]))
     ORDER BY e.starts_at DESC LIMIT 200`,
    [siteIds],
  )
  return rows.map((event) => ({
    id: `live-event:${event.room_id}`,
    sourceType: 'livestream' as const,
    sourceId: event.room_id,
    siteId: event.site_id,
    title: event.title,
    startsAt: event.starts_at.toISOString(),
    timeZone: event.time_zone,
    status: event.replay_published_at
      ? 'published'
      : event.ended_at
        ? 'ended'
        : event.session_id
          ? 'started'
          : 'scheduled',
    editHref: `/rooms/${event.room_id}`,
  }))
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>]/g, (character) =>
    character === '&' ? '&amp;' : character === '<' ? '&lt;' : '&gt;',
  )

const invalid = (message: string) => new CommunityError(message, 422, 'INVALID_LIVE_EVENT')

export async function theaterEvent(payload: Payload, viewer: RoomViewer) {
  const query = roomQuery(payload)
  const { binding } = await requireRoomAccess(query, viewer, 'read')
  const event = await loadLiveEvent(query, viewer.conversationId)
  if (!event) return null
  const broadcast = event.session_id
    ? (
        await query<{ state: string }>(
          'SELECT state FROM live_media_sessions WHERE id=$1 AND room_id=$2',
          [event.session_id, viewer.conversationId],
        )
      ).rows[0]?.state
    : null
  const rsvp =
    viewer.memberId &&
    (await query('SELECT 1 FROM live_event_rsvps WHERE room_id=$1 AND member_id=$2', [
      viewer.conversationId,
      viewer.memberId,
    ]))
  return {
    title: event.title,
    startsAt: event.starts_at,
    timeZone: event.time_zone,
    source: event.source,
    providerUrl:
      !event.ended_at && event.starts_at.getTime() <= Date.now() ? event.provider_url : null,
    synchronizedControl: false,
    announcement: event.announcement,
    rsvpEnabled: event.rsvp_enabled,
    attending: Boolean(rsvp && rsvp.rows.length),
    lobby:
      !event.ended_at &&
      (event.source === 'broadcast'
        ? !broadcast || broadcast === 'starting'
        : event.starts_at.getTime() > Date.now()),
    reconnecting: broadcast === 'reconnecting',
    ended: Boolean(event.ended_at),
    published: Boolean(event.replay_published_at),
    replayDraft: Boolean(
      event.replay_drafted_at &&
        binding &&
        viewer.memberId &&
        (await canManageRoom(query, binding, viewer.memberId)),
    ),
    retention: binding?.historyPolicy,
  }
}

export async function theaterCalendar(payload: Payload, viewer: RoomViewer, href: string) {
  const event = await theaterEvent(payload, viewer)
  if (!event) throw new CommunityError('Event not found.', 404, 'EVENT_NOT_FOUND')
  const instant = (date: Date) => date.toISOString().replace(/[-:]|\.\d{3}/g, '')
  const escape = (value: string) =>
    value
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n|\r/g, '\\n')
      .replace(/[;,]/g, '\\$&')
  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Renegade CMS//Theater//EN',
    'BEGIN:VEVENT',
    `UID:${viewer.conversationId}@renegade-theater`,
    `DTSTAMP:${instant(new Date())}`,
    `DTSTART:${instant(event.startsAt)}`,
    `SUMMARY:${escape(event.title)}`,
    `URL:${href}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ]
  return new Response(calendar.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="theater-event.ics"',
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function changeTheaterEvent(
  payload: Payload,
  viewer: RoomViewer & { memberId: string },
  body: Record<string, unknown>,
) {
  await roomTransaction(payload, async (query) => {
    const { binding } = await requireRoomAccess(query, viewer, 'read')
    if (binding?.mode !== 'theater') throw invalid('Choose a theater room.')
    const roomId = viewer.conversationId
    await query('SELECT 1 FROM room_bindings WHERE conversation_id=$1 FOR UPDATE', [roomId])
    const event = await loadLiveEvent(query, roomId)
    if (body.action === 'rsvp' || body.action === 'cancel-rsvp') {
      if (!event?.rsvp_enabled || event.ended_at) throw invalid('RSVP is closed.')
      if (body.action === 'rsvp')
        await query('INSERT INTO live_event_rsvps VALUES ($1,$2) ON CONFLICT DO NOTHING', [
          roomId,
          viewer.memberId,
        ])
      else
        await query('DELETE FROM live_event_rsvps WHERE room_id=$1 AND member_id=$2', [
          roomId,
          viewer.memberId,
        ])
      return
    }
    if (!(await canManageRoom(query, binding, viewer.memberId)))
      throw new CommunityError(
        'Theater manager permission is required.',
        403,
        'THEATER_MANAGER_REQUIRED',
      )
    switch (body.action) {
      case 'schedule-event': {
        const title = String(body.title ?? '').trim()
        const startsAt = new Date(String(body.startsAt ?? ''))
        const timeZone = String(body.timeZone ?? '')
        const source = body.source
        if (
          !title ||
          title.length > 160 ||
          !Number.isFinite(startsAt.getTime()) ||
          startsAt.getTime() <= Date.now()
        )
          throw invalid('Enter a title and a future start time.')
        try {
          assertIanaTimeZone(timeZone)
        } catch {
          throw invalid('Choose a valid time zone.')
        }
        if (source !== 'broadcast' && source !== 'premiere' && source !== 'external')
          throw invalid('Choose an event source.')
        if (
          source === 'premiere' &&
          !(await (await import('./room-media')).premiereFileReady(viewer))
        )
          throw invalid(
            'Place the owned premiere.mp4 file in this theater’s private media directory first.',
          )
        let url = null
        if (source === 'external') {
          try {
            const provider = new URL(String(body.providerUrl ?? ''))
            if (provider.protocol !== 'https:' || provider.username || provider.password)
              throw new Error()
            url = provider.href
          } catch {
            throw invalid('Enter an HTTPS link to the provider’s official player.')
          }
        }
        const active = await query(
          'SELECT 1 FROM live_media_sessions WHERE room_id=$1 AND (ended_at IS NULL OR provider_stopped_at IS NULL)',
          [roomId],
        )
        if (event || active.rows.length)
          throw invalid('Choose a theater without an event or active broadcast.')
        await query(
          'INSERT INTO live_events (room_id,title,starts_at,time_zone,source,provider_url,rsvp_enabled) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [roomId, title, startsAt, timeZone, source, url, body.rsvpEnabled === true],
        )
        await appendRoomNotice(
          query,
          roomId,
          'event-scheduled',
          `${escapeHtml(title)} is scheduled for ${startsAt.toISOString()}.`,
        )
        return
      }
      case 'announce-event': {
        const message = String(body.announcement ?? '').trim()
        if (!event || !message || message.length > 1000)
          throw invalid('Enter an announcement up to 1,000 characters.')
        if (message === event.announcement) return
        await query('UPDATE live_events SET announcement=$2 WHERE room_id=$1', [roomId, message])
        await appendRoomNotice(query, roomId, 'event-announcement', escapeHtml(message))
        return
      }
      case 'end-event':
        if (!event || event.source === 'broadcast')
          throw invalid('Use End show to finalize the source recording.')
        if (event.ended_at) return
        await query(
          "UPDATE live_events SET ended_at=now(), replay_drafted_at=CASE WHEN source='premiere' THEN now() END WHERE room_id=$1",
          [roomId],
        )
        await appendRoomNotice(query, roomId, 'event-ended', 'The event has ended.')
        return
      case 'publish-event-replay':
        if (!event?.replay_drafted_at) throw invalid('The replay draft is not ready.')
        if (event.replay_published_at) return
        const ready = event.session_id
          ? await (await import('@/modules/live-media/sessions'))
              .eventRecordingReady(query, roomId, event.session_id)
              .catch(() => false)
          : event.source === 'premiere' &&
            (await (await import('./room-media')).premiereFileReady(viewer))
        if (!ready)
          throw invalid(
            'The recording is unavailable or is still being finalized. Try again shortly.',
          )
        await query('UPDATE live_events SET replay_published_at=now() WHERE room_id=$1', [roomId])
        await appendRoomNotice(
          query,
          roomId,
          'event-replay-published',
          'The event replay is available in the theater.',
        )
        return
      default:
        throw invalid('Unknown event action.')
    }
  })
  return theaterEvent(payload, viewer)
}
