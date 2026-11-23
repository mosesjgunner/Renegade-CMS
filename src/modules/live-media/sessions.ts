import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'
import { loadConfig } from '@/modules/core/config'
import type { RoomViewer } from '@/modules/community/room-participation'
import {
  appendRoomNotice,
  canManageRoom,
  loadRoomBinding,
  requireRoomAccess,
  roomQuery,
  roomTransaction,
} from '@/modules/community/rooms'
import { loadLiveEvent } from '@/modules/community/live-events'
import { configuredProvider, liveMediaProvider, managedInputForRoom } from './config'
import {
  LiveMediaError,
  type LiveSession,
  type LiveState,
  type ProviderId,
  type ProviderStatus,
} from './provider'

type Query = ReturnType<typeof roomQuery>
type Viewer = RoomViewer & { payload: Payload }
type Host = Viewer & { memberId: string }
type SessionRow = {
  id: string
  room_id: string
  host_member_id: string | null
  provider: ProviderId
  provider_ref: string
  state: LiveState
  recording: boolean
  access_version: number
  started_at: Date
  went_live_at: Date | null
  ended_at: Date | null
  last_checked_at: Date | null
  provider_stopped_at: Date | null
  revoked_at: Date | null
}

const providerIds = ['mediamtx', 'cloudflare'] as const
const latest = 'SELECT * FROM live_media_sessions WHERE room_id=$1 ORDER BY started_at DESC LIMIT 1'
const byId = 'SELECT * FROM live_media_sessions WHERE id=$1 AND room_id=$2'

function providerSession(row: SessionRow): LiveSession {
  return {
    id: row.id,
    roomId: row.room_id,
    provider: row.provider,
    providerRef: row.provider_ref,
    state: row.state,
    recording: row.recording,
    startedAt: row.started_at,
    wentLiveAt: row.went_live_at,
    endedAt: row.ended_at,
  }
}

function projection(row?: SessionRow) {
  return row
    ? {
        id: row.id,
        provider: row.provider,
        state: row.state,
        recording: row.recording,
        startedAt: row.started_at,
        wentLiveAt: row.went_live_at,
        endedAt: row.ended_at,
        providerStopped: Boolean(row.provider_stopped_at),
        revoked: Boolean(row.revoked_at),
      }
    : null
}

export const liveMediaEnabled = () => providerIds.some((id) => liveMediaProvider(id) !== null)

export async function hostAccess(query: Query, viewer: Host) {
  const binding = await loadRoomBinding(query, viewer.conversationId)
  if (!binding || binding.siteId !== viewer.siteId || binding.mode !== 'theater')
    throw new LiveMediaError('Theater not found.', 404)
  if (!(await canManageRoom(query, binding, viewer.memberId)))
    throw new LiveMediaError('Theater manager permission is required.', 403)
  return binding
}

async function managedRoom(query: Query, viewer: Viewer) {
  const result = await query(
    `SELECT b.conversation_id FROM room_bindings b
     WHERE b.conversation_id=$1 AND b.site_id=$2 AND b.access_policy='public'
       AND b.group_id IS NULL AND b.content_id IS NULL AND b.event_id IS NULL AND NOT b.event_restricted
       AND NOT EXISTS (SELECT 1 FROM podcast_episodes e WHERE e.site_id=b.site_id AND lower(e.live_room->>'roomId')=b.conversation_id::text)
       AND EXISTS (SELECT 1 FROM room_audience($1,NULL) WHERE can_read)`,
    [viewer.conversationId, viewer.siteId],
  )
  if (!result.rows[0])
    throw new LiveMediaError('Managed delivery requires an unrestricted public theater.', 409)
}

async function refresh(query: Query, row: SessionRow, force = false) {
  if (
    row.ended_at ||
    (!force && row.last_checked_at && Date.now() - row.last_checked_at.getTime() < 4000)
  )
    return row
  const provider = configuredProvider(row.provider)
  const session = providerSession(row)
  let result: ProviderStatus
  try {
    result = await (force ? provider.heartbeat(session) : provider.reconcile(session))
  } catch {
    result = { connected: false, configured: true }
  }
  const state = result.connected ? 'live' : row.went_live_at ? 'reconnecting' : 'starting'
  const {
    rows: [updated],
  } = await query<SessionRow>(
    `UPDATE live_media_sessions SET state=$2,last_checked_at=now(),
      went_live_at=CASE WHEN $2='live' THEN COALESCE(went_live_at,now()) ELSE went_live_at END
      WHERE id=$1 RETURNING *`,
    [row.id, state],
  )
  if (state === 'live' && !row.went_live_at) {
    const event = await loadLiveEvent(query, row.room_id)
    if (event?.session_id === row.id)
      await appendRoomNotice(query, row.room_id, 'event-live', 'The show is live.')
  }
  return updated
}

export async function liveHostView(viewer: Host) {
  const query = roomQuery(viewer.payload)
  await hostAccess(query, viewer)
  const event = await loadLiveEvent(query, viewer.conversationId)
  const {
    rows: [session],
  } = await query<SessionRow>(latest, [viewer.conversationId])
  const providers = await Promise.all(
    providerIds.map(async (id) => {
      if (event && (event.source !== 'broadcast' || id !== 'mediamtx')) return null
      const provider = liveMediaProvider(id)
      if (!provider) return null
      const health = await provider.health().catch(() => ({ ready: false }))
      return { id, ready: health.ready, capabilities: provider.capabilities }
    }),
  )
  return {
    session: projection(event && event.session_id !== session?.id ? undefined : session),
    providers: providers.filter(Boolean),
  }
}

export async function startBroadcast(
  viewer: Host,
  options: { provider: ProviderId; inputId: string; recording: boolean },
) {
  const provider = configuredProvider(options.provider)
  if (options.provider === 'cloudflare' && !options.recording)
    throw new LiveMediaError('Managed HLS inputs use automatic recording.', 422)
  const row = await roomTransaction(viewer.payload, async (query) => {
    await hostAccess(query, viewer)
    await query('SELECT conversation_id FROM room_bindings WHERE conversation_id=$1 FOR UPDATE', [
      viewer.conversationId,
    ])
    const event = await loadLiveEvent(query, viewer.conversationId)
    if (
      event &&
      (event.source !== 'broadcast' ||
        event.ended_at ||
        options.provider !== 'mediamtx' ||
        !options.recording)
    )
      throw new LiveMediaError(
        'This event requires a recorded MediaMTX broadcast and can only start once.',
        409,
      )
    const {
      rows: [current],
    } = await query<SessionRow>(
      `SELECT * FROM live_media_sessions WHERE room_id=$1 AND (ended_at IS NULL OR provider_stopped_at IS NULL) FOR UPDATE`,
      [viewer.conversationId],
    )
    if (current) {
      if (current.ended_at)
        throw new LiveMediaError('The previous broadcast is still stopping.', 409)
      if (current.host_member_id !== viewer.memberId || current.provider !== options.provider)
        throw new LiveMediaError('A different broadcast is already active for this theater.', 409)
      return current
    }
    const id = randomUUID()
    let ref: string = id
    if (options.provider === 'cloudflare') {
      await managedRoom(query, viewer)
      ref = managedInputForRoom(viewer.conversationId, options.inputId)
    }
    const {
      rows: [created],
    } = await query<SessionRow>(
      `INSERT INTO live_media_sessions (id,room_id,host_member_id,provider,provider_ref,recording)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (provider,provider_ref) DO NOTHING RETURNING *`,
      [id, viewer.conversationId, viewer.memberId, options.provider, ref, options.recording],
    )
    if (!created)
      throw new LiveMediaError('This managed input already belongs to a broadcast.', 409)
    if (event)
      await query('UPDATE live_events SET session_id=$2 WHERE room_id=$1', [
        viewer.conversationId,
        id,
      ])
    return created
  })
  return roomTransaction(viewer.payload, async (query) => {
    const {
      rows: [locked],
    } = await query<SessionRow>(`${byId} FOR UPDATE`, [row.id, viewer.conversationId])
    if (!locked || locked.ended_at) throw new LiveMediaError('This broadcast has ended.', 409)
    const session = providerSession(locked)
    await provider.provision(session)
    await provider.start(session)
    return projection(await refresh(query, locked, true))
  })
}

type Action = 'connect' | 'heartbeat' | 'record' | 'end' | 'revoke'

export async function operateBroadcast(
  viewer: Host,
  id: string,
  action: Action,
  recording = false,
) {
  const row = await roomTransaction(viewer.payload, async (query) => {
    await hostAccess(query, viewer)
    const {
      rows: [current],
    } = await query<SessionRow>(`${byId} FOR UPDATE`, [id, viewer.conversationId])
    if (!current) throw new LiveMediaError('Broadcast not found.', 404)
    if (action === 'end' || action === 'revoke') {
      const {
        rows: [ended],
      } = await query<SessionRow>(
        `UPDATE live_media_sessions SET state='ended',ended_at=COALESCE(ended_at,now()),
          access_version=CASE WHEN ended_at IS NULL OR ($2 AND revoked_at IS NULL) THEN access_version+1 ELSE access_version END,
          revoked_at=CASE WHEN $2 THEN COALESCE(revoked_at,now()) ELSE revoked_at END
          WHERE id=$1 RETURNING *`,
        [id, action === 'revoke'],
      )
      if (action === 'revoke')
        await query(
          'UPDATE live_events SET replay_published_at=NULL, replay_drafted_at=NULL WHERE session_id=$1',
          [id],
        )
      return { row: ended }
    }
    if (current.ended_at) throw new LiveMediaError('This broadcast has ended.', 409)
    if (current.host_member_id !== viewer.memberId)
      throw new LiveMediaError('Only the broadcast host can connect or change the source.', 403)
    const event = await loadLiveEvent(query, viewer.conversationId)
    if (event?.session_id === id && action === 'record' && !recording)
      throw new LiveMediaError('Event broadcasts require a recording.', 409)
    const provider = configuredProvider(current.provider)
    if (current.provider === 'cloudflare') {
      await managedRoom(query, viewer)
      managedInputForRoom(viewer.conversationId, current.provider_ref)
    }
    const session = providerSession(current)
    if (action === 'heartbeat') return { row: await refresh(query, current, true) }
    if (action === 'connect') {
      await provider.provision(session)
      await provider.start(session)
      const token = credential(current, viewer, 'publish')
      return { row: current, connection: await provider.connect(session, token) }
    }
    if (current.went_live_at && current.recording !== recording)
      throw new LiveMediaError('Set recording before the source goes live.', 409)
    await provider.record(session, recording)
    const {
      rows: [changed],
    } = await query<SessionRow>(
      'UPDATE live_media_sessions SET recording=$2 WHERE id=$1 RETURNING *',
      [id, recording],
    )
    return { row: changed }
  })
  if (action !== 'end' && action !== 'revoke')
    return { session: projection(row.row), connection: row.connection }
  return roomTransaction(viewer.payload, async (query) => {
    const {
      rows: [ended],
    } = await query<SessionRow>(`${byId} FOR UPDATE`, [id, viewer.conversationId])
    if (ended.provider_stopped_at) return { session: projection(ended) }
    const provider = configuredProvider(ended.provider)
    const stop = ended.revoked_at ? provider.revoke : provider.end
    await stop(providerSession(ended))
    const {
      rows: [stopped],
    } = await query<SessionRow>(
      'UPDATE live_media_sessions SET provider_stopped_at=now() WHERE id=$1 RETURNING *',
      [id],
    )
    await query(
      `UPDATE live_events SET ended_at=COALESCE(ended_at,now()),
        replay_drafted_at=CASE WHEN $2 THEN COALESCE(replay_drafted_at,now()) ELSE replay_drafted_at END
        WHERE session_id=$1`,
      [id, stopped.recording && !stopped.revoked_at],
    )
    const event = await loadLiveEvent(query, viewer.conversationId)
    if (event?.session_id === id)
      await appendRoomNotice(query, viewer.conversationId, 'event-ended', 'The show has ended.')
    return { session: projection(stopped) }
  })
}

const playbackCookie = 'renegade-live-playback'
const tokenTtl = 90
type Purpose = 'publish' | 'watch'

function digest(row: SessionRow, viewer: RoomViewer, purpose: Purpose, expires: string) {
  return createHmac('sha256', loadConfig().payloadSecret)
    .update(
      JSON.stringify([
        'live-media',
        viewer.siteId,
        row.room_id,
        row.id,
        row.access_version,
        purpose,
        viewer.memberId,
        expires,
      ]),
    )
    .digest()
}

function credential(row: SessionRow, viewer: RoomViewer, purpose: Purpose) {
  const expires = String(Math.floor(Date.now() / 1000) + tokenTtl)
  return `${expires}.${digest(row, viewer, purpose, expires).toString('hex')}`
}

function validCredential(
  row: SessionRow,
  viewer: RoomViewer,
  purpose: Purpose,
  token: string | undefined,
) {
  const match = /^(\d{10})\.([a-f0-9]{64})$/.exec(token ?? '')
  return Boolean(
    match &&
      Number(match[1]) > Math.floor(Date.now() / 1000) &&
      timingSafeEqual(Buffer.from(match[2], 'hex'), digest(row, viewer, purpose, match[1])),
  )
}

export async function eventRecordingReady(query: Query, roomId: string, sessionId: string) {
  const {
    rows: [row],
  } = await query<SessionRow>(`${byId} FOR SHARE`, [sessionId, roomId])
  if (!row?.provider_stopped_at || row.revoked_at || !row.recording) return false
  const provider = liveMediaProvider(row.provider)
  return Boolean(provider && (await provider.getPlayback(providerSession(row))).replays.length)
}

export async function liveAudiencePlayback(viewer: Viewer) {
  if (!liveMediaEnabled()) return null
  const row = await roomTransaction(viewer.payload, async (query) => {
    const { binding } = await requireRoomAccess(query, viewer, 'read')
    if (binding?.mode !== 'theater') return null
    const {
      rows: [session],
    } = await query<SessionRow>(`${latest} FOR UPDATE`, [viewer.conversationId])
    const event = await loadLiveEvent(query, viewer.conversationId)
    if (!session || (event && event.session_id !== session.id)) return null
    if (session.provider === 'cloudflare') {
      await managedRoom(query, viewer)
      managedInputForRoom(viewer.conversationId, session.provider_ref)
    }
    return await refresh(query, session)
  })
  if (!row) return null
  const query = roomQuery(viewer.payload)
  const event = await loadLiveEvent(query, viewer.conversationId)
  const draftPreview = Boolean(
    event?.replay_drafted_at &&
      !event.replay_published_at &&
      viewer.memberId &&
      (await hostAccess(query, { ...viewer, memberId: viewer.memberId }).catch(() => null)),
  )
  const playback =
    row.revoked_at ||
    (row.ended_at &&
      (!row.provider_stopped_at || (event && !event.replay_published_at && !draftPreview)))
      ? { live: null, replays: [] }
      : await configuredProvider(row.provider).getPlayback(providerSession(row))
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
  })
  if (row.provider === 'mediamtx' && !row.revoked_at)
    headers.set(
      'Set-Cookie',
      `${playbackCookie}=${credential(row, viewer, 'watch')}; Path=/live-media/${row.id}/; Max-Age=${tokenTtl}; HttpOnly; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    )
  return Response.json(
    {
      ...playback,
      draftPreview,
      replay: playback.replays[0]?.href ?? null,
      broadcast: projection(row),
    },
    { headers },
  )
}

export async function authorizeGateway(
  context: Omit<Viewer, 'conversationId'>,
  id: string,
  action: 'publish' | 'watch' | 'replay',
  headers: Headers,
) {
  configuredProvider('mediamtx')
  const query = roomQuery(context.payload)
  const {
    rows: [row],
  } = await query<SessionRow>(
    `SELECT l.* FROM live_media_sessions l JOIN room_bindings b ON b.conversation_id=l.room_id
     WHERE l.id=$1 AND b.site_id=$2 AND l.provider='mediamtx' AND b.mode='theater'`,
    [id, context.siteId],
  )
  const deny = () => new LiveMediaError('Media access denied.', 403)
  if (!row || row.revoked_at) throw deny()
  const viewer = { ...context, conversationId: row.room_id }
  if (action === 'publish') {
    if (
      row.ended_at ||
      !viewer.memberId ||
      row.host_member_id !== viewer.memberId ||
      !validCredential(
        row,
        viewer,
        'publish',
        headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1],
      )
    )
      throw deny()
    await hostAccess(query, { ...viewer, memberId: viewer.memberId })
    return
  }
  if (
    action === 'watch' ? row.ended_at : !row.ended_at || !row.provider_stopped_at || !row.recording
  )
    throw deny()
  const event = await loadLiveEvent(query, row.room_id)
  if (event && event.session_id !== row.id) throw deny()
  const token = (headers.get('cookie') ?? '').match(/(?:^|;\s*)renegade-live-playback=([^;]+)/)?.[1]
  if (!validCredential(row, viewer, 'watch', token)) throw deny()
  await requireRoomAccess(query, viewer, 'read')
  if (action === 'replay' && event && !event.replay_published_at) {
    if (!event.replay_drafted_at || !viewer.memberId) throw deny()
    await hostAccess(query, { ...viewer, memberId: viewer.memberId })
  }
}
