/**
 * Fail-soft preflight for server-side audio work.
 *
 * Every surface that is about to spawn ffmpeg (render, live relay, …)
 * calls `ensureAudioEngine()` BEFORE any spawn: when the engine is
 * missing the caller fails up front with the named
 * `AUDIO_ENGINE_MISSING` error and its plain message, instead of
 * surfacing a raw spawn ENOENT deep inside a job. The probe is
 * injectable so the refusal shape is unit-testable without a real
 * binary.
 */
import { audioEngineMissing, probeAudioEngine, type AudioEngineStatus } from './ffmpeg'

export async function ensureAudioEngine(
  probe: () => Promise<AudioEngineStatus> = probeAudioEngine,
): Promise<AudioEngineStatus> {
  const status = await probe()
  if (status.status === 'missing') throw audioEngineMissing()
  return status
}
