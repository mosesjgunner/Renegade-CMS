/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import { AUDIO_ENGINE_MISSING, AUDIO_ENGINE_MISSING_MESSAGE } from '@/modules/media/ffmpeg'
import { ensureAudioEngine } from '@/modules/media/audio-engine-guard'
import { runRoomCheck } from '@/modules/podcast-studio/intelligence/room-check'
import { resolveInviteToken } from '@/modules/podcast-studio/guests/service'
import { guestErrorResponse, privateJson, resolveStaff } from '../guests/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A preflight sample is seconds long; anything bigger is not a room check. */
const MAX_SAMPLE_BYTES = 8 * 1024 * 1024

/**
 * Audio pass — pre-record room check (POD-REQ-21 preflight upgrade).
 *
 * POST multipart form: `audio` = a short recorded sample (a few
 * seconds of the guest/host speaking in the room they will record
 * in), optional `token` = a guest invite token (pre-join preflight).
 * Auth: a staff session OR a valid guest invite token (resolved
 * non-consuming — checking your sound never burns the invite).
 *
 * Returns the plain-language report from intelligence/room-check:
 * verdicts + fix hints first, measured numbers in the detail. The
 * check WARNS, never gates: nothing here blocks joining or
 * recording. Fail-soft like every audio surface: no engine on the
 * server is a named 503, not a stack trace.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })

  const staff = await resolveStaff(payload as never, request)
  const form = await request.formData().catch(() => null)
  if (!form) return privateJson({ error: 'Expected a multipart form with an audio sample.' }, 400)

  if (!staff) {
    const token = String(form.get('token') ?? '')
    if (!token)
      return privateJson({ error: 'Authentication required (staff session or guest invite).' }, 401)
    try {
      await resolveInviteToken(payload as never, token, { forJoin: false })
    } catch (error) {
      return guestErrorResponse(error)
    }
  }

  const engineMissing = await ensureAudioEngine()
    .then(() => false)
    .catch(() => true)
  if (engineMissing)
    return privateJson({ error: AUDIO_ENGINE_MISSING_MESSAGE, code: AUDIO_ENGINE_MISSING }, 503)

  const audio = form.get('audio')
  if (!(audio instanceof Blob) || audio.size === 0)
    return privateJson({ error: 'An audio sample is required (form field "audio").' }, 400)
  if (audio.size > MAX_SAMPLE_BYTES)
    return privateJson(
      { error: 'Sample is too large — record a few seconds, not a whole take.' },
      413,
    )

  const dir = await mkdtemp(path.join(os.tmpdir(), 'room-check-'))
  try {
    const samplePath = path.join(dir, 'sample.audio')
    await writeFile(samplePath, Buffer.from(await audio.arrayBuffer()))
    const report = await runRoomCheck(samplePath)
    return privateJson({ report })
  } catch (error) {
    return privateJson(
      {
        error:
          error instanceof Error
            ? `Could not measure that sample: ${error.message}`
            : 'Could not measure that sample.',
        code: 'ROOM_CHECK_FAILED',
      },
      422,
    )
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
