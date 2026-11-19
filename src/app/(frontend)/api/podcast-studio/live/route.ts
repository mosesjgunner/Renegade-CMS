/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import {
  convertLiveEpisodeWithRecording,
  endLiveEpisode,
  getPublicStreamProfile,
  goLiveEpisode,
  scheduleLiveEpisodeForShow,
  setLiveRoomBinding,
  setShowStreamProfile,
} from '@/modules/podcast-studio/live/live-service'
import { parseStreamProfile } from '@/modules/podcast-studio/live/stream-profile'
import { AUDIO_ENGINE_MISSING, AUDIO_ENGINE_MISSING_MESSAGE } from '@/modules/media/ffmpeg'
import { ensureAudioEngine } from '@/modules/media/audio-engine-guard'
import {
  episodeContext,
  loadShow,
  privateJson,
  readJson,
  relationId,
  requireSiteAccess,
  resolveStaff,
} from '../production/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-16 live output API (staff + operator site grant, the POD-04
 * route pattern).
 *
 * GET ?showId= — the show's PUBLIC stream profile projection
 *      (profile + hasCredential; credential material is never in any
 *      response this route produces).
 * POST { action: 'set-profile', showId, profile, credential? |
 *        credentialEnvName? } — store profile + credential (the
 *        credential is encrypted at the service boundary and never
 *        echoed back).
 * POST { action: 'schedule' | 'go-live' | 'end-show' | 'convert' |
 *        'bind-room', episodeId, … } — the live episode lifecycle.
 *      `convert` takes recordingId; `bind-room` takes
 *      binding { roomId, access }.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const user = await resolveStaff(payload, request)
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const url = new URL(request.url)
  const show = await loadShow(payload, url.searchParams.get('showId') ?? '')
  if (!show) return NextResponse.json({ error: 'Podcast show not found.' }, { status: 404 })
  const denied = await requireSiteAccess(payload, user, relationId(show.site))
  if (denied) return denied
  const profile = await getPublicStreamProfile(payload as never, String(show.id))
  return privateJson({ showId: String(show.id), streamProfile: profile })
}

const EPISODE_ACTIONS = ['schedule', 'go-live', 'end-show', 'convert', 'bind-room'] as const

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const action = typeof body.action === 'string' ? body.action : ''

  try {
    if (action === 'set-profile') {
      const user = await resolveStaff(payload, request)
      if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
      const show = await loadShow(payload, typeof body.showId === 'string' ? body.showId : '')
      if (!show) return NextResponse.json({ error: 'Podcast show not found.' }, { status: 404 })
      const denied = await requireSiteAccess(payload, user, relationId(show.site))
      if (denied) return denied
      const profile = parseStreamProfile(body.profile)
      const pub = await setShowStreamProfile(payload as never, {
        showId: String(show.id),
        profile,
        ...(typeof body.credential === 'string' ? { credential: body.credential } : {}),
        ...(typeof body.credentialEnvName === 'string'
          ? { credentialEnvName: body.credentialEnvName }
          : {}),
      })
      return privateJson({ showId: String(show.id), streamProfile: pub })
    }

    if (!(EPISODE_ACTIONS as readonly string[]).includes(action))
      return privateJson({ error: `Unknown live action "${action}".` }, 400)
    const episodeId = typeof body.episodeId === 'string' ? body.episodeId : ''
    const context = await episodeContext(payload, request, episodeId)
    if ('error' in context) return context.error

    if (action === 'schedule') {
      const startAt = typeof body.startAt === 'string' ? body.startAt : ''
      if (!startAt) return privateJson({ error: 'schedule requires startAt.' }, 400)
      const episode = await scheduleLiveEpisodeForShow(payload as never, { episodeId, startAt })
      return privateJson({ id: String(episode.id), liveState: episode.liveState })
    }
    if (action === 'go-live') {
      // Fail-soft preflight: go-live is the only episode action that
      // starts the ffmpeg relay, so it is the only one gated here —
      // schedule / end-show / convert / bind-room spawn nothing.
      const engineMissing = await ensureAudioEngine()
        .then(() => false)
        .catch(() => true)
      if (engineMissing)
        return privateJson({ error: AUDIO_ENGINE_MISSING_MESSAGE, code: AUDIO_ENGINE_MISSING }, 503)
      const episode = await goLiveEpisode(payload as never, episodeId)
      return privateJson({ id: String(episode.id), liveState: episode.liveState })
    }
    if (action === 'end-show') {
      const episode = await endLiveEpisode(payload as never, episodeId)
      return privateJson({ id: String(episode.id), liveState: episode.liveState })
    }
    if (action === 'convert') {
      const recordingId = typeof body.recordingId === 'string' ? body.recordingId : ''
      if (!recordingId) return privateJson({ error: 'convert requires recordingId.' }, 400)
      const result = await convertLiveEpisodeWithRecording(payload as never, {
        episodeId,
        recordingId,
      })
      return privateJson({
        id: String(result.episode.id),
        liveState: result.episode.liveState,
        converted: result.converted,
      })
    }
    // bind-room
    const episode = await setLiveRoomBinding(payload as never, {
      episodeId,
      binding: body.binding as never,
    })
    return privateJson({ id: String(episode.id), liveRoom: episode.liveRoom ?? null })
  } catch (error) {
    return privateJson(
      { error: error instanceof Error ? error.message : 'Live request failed.' },
      409,
    )
  }
}
