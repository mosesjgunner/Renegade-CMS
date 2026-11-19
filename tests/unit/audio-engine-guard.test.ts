/**
 * Fail-soft audio-engine preflight (src/modules/media/audio-engine-guard.ts):
 * the guard every ffmpeg-spawning surface (render route/service, live
 * go-live) calls before any work. A missing engine must refuse with the
 * named AUDIO_ENGINE_MISSING error and the plain message, and the
 * guarded work must never run; a ready engine passes its status through.
 */
import { describe, expect, it, vi } from 'vitest'

import { ensureAudioEngine } from '../../src/modules/media/audio-engine-guard'
import {
  AUDIO_ENGINE_MISSING,
  AUDIO_ENGINE_MISSING_MESSAGE,
  type AudioEngineStatus,
} from '../../src/modules/media/ffmpeg'

const missingStatus: AudioEngineStatus = {
  status: 'missing',
  ffmpeg: { path: 'ffmpeg', source: 'system', version: null },
  ffprobe: { path: 'ffprobe', source: 'system', version: null },
}

const readyStatus: AudioEngineStatus = {
  status: 'ready',
  ffmpeg: { path: 'ffmpeg', source: 'system', version: '7.0' },
  ffprobe: { path: 'ffprobe', source: 'system', version: '7.0' },
}

describe('ensureAudioEngine', () => {
  it('refuses with AUDIO_ENGINE_MISSING before any guarded work runs', async () => {
    const work = vi.fn(async () => 'rendered')
    const runGuarded = async () => {
      await ensureAudioEngine(async () => missingStatus)
      return work()
    }
    const error = await runGuarded().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as { code?: string }).code).toBe(AUDIO_ENGINE_MISSING)
    expect((error as Error).message).toBe(AUDIO_ENGINE_MISSING_MESSAGE)
    expect((error as Error).message).toBe("Audio processing isn't set up on this server yet.")
    expect(work).not.toHaveBeenCalled()
  })

  it('passes a ready status through so the guarded work runs', async () => {
    const status = await ensureAudioEngine(async () => readyStatus)
    expect(status).toBe(readyStatus)
    expect(status.status).toBe('ready')
  })
})
