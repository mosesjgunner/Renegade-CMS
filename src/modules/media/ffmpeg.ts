/**
 * Shared ffmpeg / ffprobe resolution + audio-engine probe.
 *
 * Every server-side audio/video path resolves its binaries through
 * here so a bundled engine is picked up everywhere at once.
 *
 * Resolution order (per binary):
 *   1. an explicit path passed by the caller,
 *   2. the bundled binary at `<cwd>/vendor/ffmpeg/<name>`, when that
 *      file exists and is executable — plus, when the working
 *      directory is a Next `standalone/` directory, the deployment
 *      root's `<cwd>/../vendor/ffmpeg/<name>` (the standalone server
 *      runs from inside `standalone/`, while the installer and the
 *      compose mount own the vendor dir at the deployment root),
 *   3. the `FFMPEG_PATH` / `FFPROBE_PATH` environment variable,
 *   4. the bare binary name (`ffmpeg` / `ffprobe`), i.e. PATH lookup.
 *
 * Dependency-free: node:child_process, node:fs and node:path only.
 */
import { execFile } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import path from 'node:path'

export const AUDIO_ENGINE_MISSING = 'AUDIO_ENGINE_MISSING'

export const AUDIO_ENGINE_MISSING_MESSAGE = "Audio processing isn't set up on this server yet."

export type AudioEngineMissingError = Error & { code: typeof AUDIO_ENGINE_MISSING }

/** Builds the plain-language error used when no audio engine can run. */
export const audioEngineMissing = (): AudioEngineMissingError => {
  const error = new Error(AUDIO_ENGINE_MISSING_MESSAGE) as AudioEngineMissingError
  error.code = AUDIO_ENGINE_MISSING
  return error
}

export const bundledFfmpegPath = (): string =>
  path.join(process.cwd(), 'vendor', 'ffmpeg', 'ffmpeg')

export const bundledFfprobePath = (): string =>
  path.join(process.cwd(), 'vendor', 'ffmpeg', 'ffprobe')

/** Every bundled location for one binary, in resolution order. */
const bundledBinaryCandidates = (name: 'ffmpeg' | 'ffprobe'): string[] => {
  const candidates = [path.join(process.cwd(), 'vendor', 'ffmpeg', name)]
  if (path.basename(process.cwd()) === 'standalone')
    candidates.push(path.join(process.cwd(), '..', 'vendor', 'ffmpeg', name))
  return candidates
}

export type AudioBinarySource = 'bundled' | 'env' | 'system' | 'explicit'

export type AudioBinaryStatus = {
  path: string
  source: AudioBinarySource
  version: string | null
}

export type AudioEngineStatus = {
  status: 'ready' | 'missing'
  ffmpeg: AudioBinaryStatus
  ffprobe: AudioBinaryStatus
}

const isExecutableFile = (candidate: string): boolean => {
  try {
    if (!statSync(candidate).isFile()) return false
    accessSync(candidate, constants.X_OK)
    return true
  } catch {
    return false
  }
}

type ResolvedBinary = { path: string; source: AudioBinarySource }

const resolveBinary = (
  explicit: string | undefined,
  bundledCandidates: string[],
  envValue: string | undefined,
  bareName: string,
): ResolvedBinary => {
  if (explicit) return { path: explicit, source: 'explicit' }
  for (const candidate of bundledCandidates)
    if (isExecutableFile(candidate)) return { path: candidate, source: 'bundled' }
  if (envValue) return { path: envValue, source: 'env' }
  return { path: bareName, source: 'system' }
}

const resolveFfmpeg = (explicit?: string): ResolvedBinary =>
  resolveBinary(explicit, bundledBinaryCandidates('ffmpeg'), process.env.FFMPEG_PATH, 'ffmpeg')

const resolveFfprobe = (explicit?: string): ResolvedBinary =>
  resolveBinary(explicit, bundledBinaryCandidates('ffprobe'), process.env.FFPROBE_PATH, 'ffprobe')

export const resolveFfmpegBinary = (explicit?: string): string => resolveFfmpeg(explicit).path

export const resolveFfprobeBinary = (explicit?: string): string => resolveFfprobe(explicit).path

const PROBE_TIMEOUT_MS = 5000

/** Runs `<binary> -version` and parses the version from its first line; null on any failure. */
const runVersion = (binary: string): Promise<string | null> =>
  new Promise((resolve) => {
    try {
      execFile(
        binary,
        ['-version'],
        { timeout: PROBE_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            resolve(null)
            return
          }
          const firstLine = String(stdout || stderr || '').split('\n')[0] ?? ''
          const match = firstLine.match(/version\s+([^\s]+)/)
          resolve(match ? match[1] : null)
        },
      )
    } catch {
      resolve(null)
    }
  })

const probeBinary = async (resolved: ResolvedBinary): Promise<AudioBinaryStatus> => {
  const version = await runVersion(resolved.path)
  return { path: resolved.path, source: resolved.source, version }
}

const doProbeAudioEngine = async (): Promise<AudioEngineStatus> => {
  const [ffmpeg, ffprobe] = await Promise.all([
    probeBinary(resolveFfmpeg()),
    probeBinary(resolveFfprobe()),
  ])
  return {
    status: ffmpeg.version !== null && ffprobe.version !== null ? 'ready' : 'missing',
    ffmpeg,
    ffprobe,
  }
}

let cachedProbe: Promise<AudioEngineStatus> | null = null

/**
 * Probes the resolved ffmpeg + ffprobe binaries. Cached per process;
 * never throws — an engine that cannot run reports `missing`.
 */
export const probeAudioEngine = (): Promise<AudioEngineStatus> => {
  if (!cachedProbe) {
    cachedProbe = doProbeAudioEngine().catch(() => ({
      status: 'missing' as const,
      ffmpeg: { path: resolveFfmpegBinary(), source: resolveFfmpeg().source, version: null },
      ffprobe: { path: resolveFfprobeBinary(), source: resolveFfprobe().source, version: null },
    }))
  }
  return cachedProbe
}

/** Clears the per-process probe cache (fix-it flow and tests). */
export const resetAudioEngineProbeCache = (): void => {
  cachedProbe = null
}
