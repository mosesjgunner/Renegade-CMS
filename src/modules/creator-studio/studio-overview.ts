import type { Payload, Where } from 'payload'
import { liveMediaEnabled } from '../live-media/sessions'
import { listExternalVideos } from './external-video'
import { captureAccess } from './capture-service'
import { listSubmissions } from './submissions'
import type { SubmissionActor } from './submission-targets'

export async function studioOverview(payload: Payload, actor: SubmissionActor) {
  const where: Where = {
    and: [{ site: { equals: actor.siteId } }, { owner: { equals: actor.memberId } }],
  }
  const [media, uploads, submissions, sources, live, usage, quota] = await Promise.allSettled([
    payload.find({
      collection: 'media-assets',
      where,
      limit: 8,
      sort: '-updatedAt',
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'media-upload-sessions',
      where: { and: [where, { state: { in: ['open', 'finalizing', 'failed'] } }] },
      limit: 8,
      sort: '-updatedAt',
      depth: 0,
      overrideAccess: true,
    }),
    listSubmissions(payload, actor),
    listExternalVideos(payload, actor, 8),
    payload.db.pool.query<{ id: string; name: string; status: string; time: Date | null }>(
      `SELECT c.id, coalesce(e.title,c.title,'Live room') AS name, e.starts_at AS time,
        CASE WHEN e.replay_published_at IS NOT NULL THEN 'Replay available'
             WHEN e.ended_at IS NOT NULL THEN 'Ended'
             WHEN s.state='live' THEN 'Live'
             WHEN s.state='reconnecting' THEN 'Reconnecting'
             WHEN e.starts_at IS NOT NULL THEN 'Scheduled' ELSE 'Room ready' END AS status
       FROM room_bindings b JOIN conversations c ON c.id=b.conversation_id
       LEFT JOIN live_events e ON e.room_id=c.id LEFT JOIN live_media_sessions s ON s.id=e.session_id
       WHERE b.site_id=$1 AND b.created_by_member_id=$2 AND b.mode='theater' AND b.lifecycle='open'
       ORDER BY coalesce(e.starts_at,b.created_at) DESC LIMIT 8`,
      [actor.siteId, actor.memberId],
    ),
    payload.db.pool.query<{ count: string; bytes: string }>(
      `SELECT count(*) AS count, coalesce(sum(expected_size), 0) AS bytes FROM media_upload_sessions
       WHERE site_id=$1 AND owner_id=$2 AND creator_key IS NOT NULL
       AND (state='completed' OR (state IN ('open','failed','finalizing') AND expires_at>now()))`,
      [actor.siteId, actor.memberId],
    ),
    captureAccess(payload, actor),
  ])
  const pending =
    uploads.status === 'fulfilled'
      ? uploads.value.docs
          .filter(({ state }) => ['open', 'finalizing', 'failed'].includes(state))
          .map(({ id, title, state, receivedBytes, expectedSize, creatorKey }) => ({
            id,
            title,
            state,
            receivedBytes,
            expectedSize,
            href: creatorKey?.startsWith('capture:')
              ? '/studio/record'
              : creatorKey?.startsWith('library:')
                ? '/studio/create/upload'
                : '/studio/submissions',
          }))
      : []
  const reviews =
    submissions.status === 'fulfilled'
      ? submissions.value.mine
          .filter(({ reviewStatus }) => reviewStatus)
          .slice(0, 8)
          .map(({ id, title, reviewStatus }) => ({ id, title, status: reviewStatus }))
      : []
  return {
    media:
      media.status === 'fulfilled'
        ? media.value.docs.map(({ id, title, kind, processingState }) => ({
            id,
            title,
            kind,
            status: processingState,
          }))
        : [],
    pending,
    reviews,
    targets:
      submissions.status === 'fulfilled'
        ? submissions.value.targets.map(({ key, title }) => ({ key, title }))
        : [],
    providers:
      sources.status === 'fulfilled' && sources.value.canManage
        ? {
            youtube: sources.value.connected
              ? 'Connected'
              : sources.value.configured
                ? 'Available to connect'
                : 'Unavailable',
            items: sources.value.items.slice(0, 8).map(({ id, displayTitle, availability }) => ({
              id,
              title: displayTitle,
              status: availability,
            })),
          }
        : null,
    live: live.status === 'fulfilled' ? live.value.rows : [],
    liveConfigured: liveMediaEnabled(),
    quota:
      quota.status === 'fulfilled' && usage.status === 'fulfilled'
        ? {
            bytes: {
              used: Number(usage.value.rows[0]?.bytes),
              limit: quota.value.quota.bytes ?? 0,
            },
            uploads: {
              used: Number(usage.value.rows[0]?.count),
              limit: quota.value.quota.uploadCount ?? 0,
            },
          }
        : null,
    available: {
      media: media.status === 'fulfilled',
      uploads: uploads.status === 'fulfilled',
      live: live.status === 'fulfilled',
      destinations: submissions.status === 'fulfilled',
    },
  }
}
