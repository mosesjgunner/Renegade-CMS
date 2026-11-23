import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { roomIdPattern, roomQuery, roomTransaction } from '@/modules/community/rooms'
import {
  destinationKey,
  encryptDestination,
  relayBitrateKbps,
  termsVersion,
  validateTarget,
} from './destination-credentials'
import { LiveMediaError } from './provider'
import { hostAccess } from './sessions'

type Host = { payload: Payload; conversationId: string; siteId: string; memberId: string }

const capability = {
  custom: {
    provisioning: 'Manual ingest and key',
    protocols: ['rtmp', 'rtmps'],
    privacy: ['public', 'unlisted', 'private'],
  },
  youtube: {
    provisioning: 'YouTube Live Control Room encoder key',
    protocols: ['rtmps'],
    privacy: ['public', 'unlisted', 'private'],
    termsUrl: 'https://www.youtube.com/t/terms',
  },
  twitch: {
    provisioning: 'Authorized Twitch Creator Dashboard key',
    protocols: ['rtmp', 'rtmps'],
    privacy: ['public'],
    termsUrl: 'https://help.twitch.tv/s/article/simulcasting-guidelines?language=en_US',
  },
}

export async function destinationView(viewer: Host) {
  const query = roomQuery(viewer.payload)
  await hostAccess(query, viewer)
  const { rows } = await query(
    `SELECT d.id,d.provider,d.privacy,d.probe,d.retry_budget,d.byte_limit,d.seconds_limit,d.terms_version,
       d.revoked_at, (c.destination_id IS NOT NULL) AS connected,
       COALESCE(r.status,'idle') AS status,r.id AS run_id,r.session_id,r.attempt,r.bytes_sent,r.remote_id,r.idempotency_key,
       COALESCE(a.events,'[]'::json) AS audit
      FROM live_destinations d
      LEFT JOIN live_destination_credentials c ON c.destination_id=d.id
      LEFT JOIN LATERAL (SELECT * FROM live_destination_runs WHERE destination_id=d.id ORDER BY created_at DESC LIMIT 1) r ON true
      LEFT JOIN LATERAL (SELECT json_agg(history) AS events FROM
       (SELECT event,run_id,created_at FROM live_destination_audit WHERE destination_id=d.id ORDER BY id DESC LIMIT 20) history) a ON true
      WHERE d.room_id=$1 ORDER BY d.created_at DESC LIMIT 100`,
    [viewer.conversationId],
  )
  return {
    enabled: Boolean(destinationKey() && process.env.LIVE_DESTINATION_ENDPOINTS),
    capabilities: capability,
    bitrateKbps: relayBitrateKbps,
    termsVersion,
    destinations: rows,
  }
}

function integer(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    throw new LiveMediaError('Destination limits are invalid.', 422)
  return value
}

function uuid(value: unknown) {
  if (typeof value !== 'string' || !roomIdPattern.test(value))
    throw new LiveMediaError('A valid identifier is required.', 422)
  return value.toLowerCase()
}

export async function mutateDestination(viewer: Host, body: Record<string, unknown>) {
  return roomTransaction(viewer.payload, async (query) => {
    await hostAccess(query, viewer)
    await query('SELECT conversation_id FROM room_bindings WHERE conversation_id=$1 FOR UPDATE', [
      viewer.conversationId,
    ])
    const audit = (id: string, event: string, runId: string | null = null) =>
      query(
        'INSERT INTO live_destination_audit(destination_id,actor_id,event,run_id) VALUES ($1,$2,$3,$4)',
        [id, viewer.memberId, event, runId],
      )

    if (body.action === 'create') {
      const key = destinationKey()
      if (!key) throw new LiveMediaError('Destination relay is unavailable.', 503)
      const { provider, privacy, ingest, streamKey } = body
      if (
        (provider !== 'custom' && provider !== 'youtube' && provider !== 'twitch') ||
        typeof privacy !== 'string' ||
        !capability[provider].privacy.includes(privacy) ||
        typeof ingest !== 'string' ||
        typeof streamKey !== 'string' ||
        body.termsVersion !== termsVersion ||
        body.authorized !== true
      )
        throw new LiveMediaError(
          'Confirm broadcast authorization, privacy and current destination terms.',
          422,
        )
      try {
        validateTarget(provider, ingest, streamKey)
      } catch {
        throw new LiveMediaError('The ingest or key does not match an approved destination.', 422)
      }
      const retries = integer(body.retryBudget, 0, 3)
      const limit = integer(body.mebibytes, 1, 4096) * 1024 * 1024
      const seconds = integer(body.minutes, 1, 120) * 60
      const { rows } = await query(
        'SELECT id FROM live_destinations d JOIN live_destination_credentials c ON c.destination_id=d.id WHERE room_id=$1 LIMIT 4',
        [viewer.conversationId],
      )
      if (rows.length >= 4)
        throw new LiveMediaError('This theater has reached its destination limit.', 409)
      const id = randomUUID()
      await query(
        `INSERT INTO live_destinations(id,room_id,provider,privacy,terms_version,retry_budget,byte_limit,seconds_limit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, viewer.conversationId, provider, privacy, termsVersion, retries, limit, seconds],
      )
      await query(
        'INSERT INTO live_destination_credentials(destination_id,credential) VALUES ($1,$2)',
        [id, encryptDestination(key, id, { ingest, key: streamKey })],
      )
      await audit(id, 'authorized')
      return { id }
    }

    const id = uuid(body.destinationId)
    const {
      rows: [destination],
    } = await query<{ connected: boolean; terms_version: number }>(
      'SELECT EXISTS (SELECT 1 FROM live_destination_credentials WHERE destination_id=d.id) AS connected,terms_version FROM live_destinations d WHERE id=$1 AND room_id=$2 FOR UPDATE',
      [id, viewer.conversationId],
    )
    if (!destination) throw new LiveMediaError('Destination not found.', 404)
    if (body.action === 'disconnect' || body.action === 'revoke') {
      await query(
        `UPDATE live_destinations SET probe='untested',
         revoked_at=CASE WHEN $2 THEN COALESCE(revoked_at,now()) ELSE revoked_at END WHERE id=$1`,
        [id, body.action === 'revoke'],
      )
      await query(
        `UPDATE live_destination_runs SET stop_requested=true WHERE destination_id=$1
         AND status IN ('queued','connecting','sending','retrying') AND NOT stop_requested`,
        [id],
      )
      await query('DELETE FROM live_destination_credentials WHERE destination_id=$1', [id])
      await audit(id, body.action === 'revoke' ? 'revoked' : 'disconnected')
      return { id }
    }
    if (body.action === 'stop') {
      const runId = uuid(body.runId)
      const updated = await query(
        `UPDATE live_destination_runs SET stop_requested=true WHERE id=$1 AND destination_id=$2
         AND status IN ('queued','connecting','sending','retrying') AND NOT stop_requested RETURNING id`,
        [runId, id],
      )
      if (updated.rows.length) await audit(id, 'stop_requested', runId)
      return { id, runId }
    }
    if (!destination.connected || destination.terms_version !== termsVersion || !destinationKey())
      throw new LiveMediaError(
        'This destination needs current authorization and a credential.',
        409,
      )
    if (body.action === 'test') {
      await query("UPDATE live_destinations SET probe='queued' WHERE id=$1 AND probe<>'checking'", [
        id,
      ])
      await audit(id, 'test_requested')
      return { id }
    }
    if (body.action !== 'start') throw new LiveMediaError('Unknown destination action.', 422)
    const sessionId = uuid(body.sessionId)
    const idempotencyKey = uuid(body.idempotencyKey)
    const existing = await query<{ id: string; session_id: string }>(
      'SELECT id,session_id FROM live_destination_runs WHERE destination_id=$1 AND idempotency_key=$2',
      [id, idempotencyKey],
    )
    if (existing.rows[0]) {
      if (existing.rows[0].session_id !== sessionId)
        throw new LiveMediaError('This request belongs to another broadcast.', 409)
      return { id, runId: existing.rows[0].id }
    }
    const runId = randomUUID()
    const started = await query(
      `INSERT INTO live_destination_runs(id,destination_id,session_id,idempotency_key,deadline)
       SELECT $1,d.id,s.id,$2,now()+make_interval(secs=>d.seconds_limit)
       FROM live_destinations d JOIN live_media_sessions s ON s.room_id=d.room_id
       WHERE d.id=$3 AND s.id=$4 AND s.provider='mediamtx' AND s.ended_at IS NULL
         AND EXISTS (SELECT 1 FROM live_destination_public_rooms WHERE room_id=d.room_id)
       ON CONFLICT DO NOTHING RETURNING id`,
      [runId, idempotencyKey, id, sessionId],
    )
    if (!started.rows.length)
      throw new LiveMediaError(
        'Starting a relay requires an unrestricted public MediaMTX broadcast and an idle destination.',
        409,
      )
    await audit(id, 'start_requested', runId)
    return { id, runId }
  })
}
