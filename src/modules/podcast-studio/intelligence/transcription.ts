/**
 * POD-14 (POD-REQ-30) — transcription provider seam + transcript
 * serialisation/editing cores. PURE CORES (no Payload, no I/O except
 * the command/HTTP provider adapters' injected runners).
 *
 * Provider seam: `TranscriptionProvider { id, transcribe(audioRef,
 * opts) → { segments, language } }`. Three implementations:
 *
 * - `fixture-provider` — deterministic, clearly labelled test/demo
 *   provider. It does NOT listen to the audio: it derives canned
 *   segments from the audio's duration and alternates the diarization
 *   placeholders "Speaker 1" / "Speaker 2". Never presented as real
 *   ASR anywhere.
 * - `command-provider` — the sovereign local option: shells to a
 *   local ASR binary (whisper.cpp / faster-whisper style) configured
 *   by path. The binary is invoked with the audio path and must print
 *   a JSON document `{ segments: [{ start, end, text, speaker? }],
 *   language? }` (the whisper JSON shape) on stdout. Unconfigured →
 *   a named `TRANSCRIPTION_NOT_CONFIGURED` failure; a missing/crashed
 *   binary → a named `TRANSCRIPTION_PROVIDER_FAILED` failure. Never
 *   a silent gap.
 * - `http-provider` — the BYO adapter shape: POSTs the audio bytes to
 *   a caller-configured endpoint with a caller-supplied key (held in
 *   config/secrets, never logged) and expects the same JSON shape
 *   back. This is the extension point the CMS AI seam cannot serve:
 *   the AI gateway (src/modules/ai) is chat-completions only — it has
 *   no audio-transcription capability — so transcription cannot ride
 *   it today; if a transcription capability is added there, this
 *   provider is where it plugs in.
 *
 * Speakers: provider speaker labels are kept verbatim; when a
 * provider returns none, segments carry NO speaker (the service layer
 * may add diarization placeholders "Speaker 1/2" — invented NAMES are
 * never produced).
 *
 * Word-level timing is optional-if-present: a segment may carry
 * `words: [{ start, end, text }]` when the source provides it (JSON
 * import / a word-capable provider). Nothing in this module ever
 * fabricates word timings.
 */
import { execFile } from 'node:child_process'

import { assertTranscriptSegments, type TranscriptSegment } from '../../media/contracts'

export type { TranscriptSegment }

export type WordTiming = { start: number; end: number; text: string }
export type TimedSegment = TranscriptSegment & { words?: WordTiming[] }

export type AudioRef = {
  /** Local file path (command provider / fixture duration probe). */
  path?: string
  /** Known duration in seconds (fixture provider derives from this). */
  durationSec?: number
  mimeType?: string
  /** Display origin for error messages (asset id / filename). */
  origin?: string
}

export type TranscriptionResult = {
  segments: TimedSegment[]
  language: string
  providerId: string
}

export type TranscriptionProvider = {
  id: string
  label: string
  transcribe: (
    audio: AudioRef,
    opts?: { language?: string },
  ) => Promise<{ segments: TimedSegment[]; language: string }>
}

export class TranscriptionError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'TranscriptionError'
    this.code = code
  }
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

const normalizeSegments = (raw: unknown, providerId: string): TimedSegment[] => {
  if (!Array.isArray(raw))
    throw new TranscriptionError(
      'TRANSCRIPTION_PROVIDER_FAILED',
      `Transcription provider "${providerId}" returned no segments array.`,
    )
  const segments: TimedSegment[] = raw.map((entry, index) => {
    const record = (entry ?? {}) as Record<string, unknown>
    const start = Number(record.startSeconds ?? record.start ?? 0)
    const end = Number(record.endSeconds ?? record.end ?? start)
    const words = Array.isArray(record.words)
      ? (record.words as Record<string, unknown>[]).map((word) => ({
          start: Number(word.start ?? word.startSeconds ?? 0),
          end: Number(word.end ?? word.endSeconds ?? 0),
          text: String(word.text ?? word.word ?? ''),
        }))
      : undefined
    return {
      id: `seg-${index + 1}`,
      startSeconds: round3(start),
      endSeconds: round3(Math.max(end, start)),
      text: String(record.text ?? record.body ?? '').trim(),
      ...(record.speaker ? { speaker: String(record.speaker) } : {}),
      ...(typeof record.confidence === 'number' ? { confidence: record.confidence } : {}),
      ...(words && words.length ? { words } : {}),
    }
  })
  assertTranscriptSegments(segments)
  return segments
}

// ---------------------------------------------------------------------------
// Fixture provider (deterministic; NOT real ASR)
// ---------------------------------------------------------------------------

const FIXTURE_SCRIPT = [
  'Welcome back to the show.',
  'Today we are talking about owning your own media.',
  'No platforms, no rented audiences, no silent takedowns.',
  'Let us get into the first topic of the day.',
  'This is the part where the guest tells their story.',
  'And that brings us to the break.',
  'We are back, and it is time for the main segment.',
  'Thanks for listening, and we will see you next week.',
]

export const FIXTURE_PROVIDER_ID = 'fixture-provider'

export const fixtureTranscriptionProvider: TranscriptionProvider = {
  id: FIXTURE_PROVIDER_ID,
  label: 'Fixture provider (deterministic test/demo segments — NOT real transcription)',
  async transcribe(audio, opts) {
    const duration = Number(audio.durationSec ?? 0)
    if (!(duration > 0))
      throw new TranscriptionError(
        'TRANSCRIPTION_AUDIO_MISSING',
        'Fixture transcription needs the audio duration to derive its canned segments; none was supplied.',
      )
    const segmentLength = 4
    const count = Math.max(1, Math.ceil(duration / segmentLength))
    const segments: TimedSegment[] = Array.from({ length: count }, (_, index) => {
      const start = index * segmentLength
      return {
        id: `seg-${index + 1}`,
        startSeconds: start,
        endSeconds: round3(Math.min(duration, start + segmentLength)),
        text: FIXTURE_SCRIPT[index % FIXTURE_SCRIPT.length],
        speaker: index % 2 === 0 ? 'Speaker 1' : 'Speaker 2',
      }
    })
    return { segments, language: opts?.language ?? 'en' }
  },
}

// ---------------------------------------------------------------------------
// Command provider (sovereign local ASR: whisper.cpp / faster-whisper)
// ---------------------------------------------------------------------------

export type CommandRunner = (
  command: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

const defaultRunner: CommandRunner = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: 30 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const failure = error as Error & { code?: string }
          failure.message = `${failure.message}${stderr ? `: ${String(stderr).slice(0, 300)}` : ''}`
          reject(failure)
          return
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) })
      },
    )
  })

export const COMMAND_PROVIDER_ID = 'command-provider'

export const createCommandTranscriptionProvider = (config: {
  /** Binary path, e.g. /usr/local/bin/whisper-cpp. Empty = unconfigured. */
  command?: string
  /** Extra args; `{input}` is replaced by the audio path. Default: ['{input}']. */
  args?: string[]
  runner?: CommandRunner
}): TranscriptionProvider => ({
  id: COMMAND_PROVIDER_ID,
  label: 'Local ASR command (whisper.cpp / faster-whisper compatible JSON stdout)',
  async transcribe(audio) {
    const command = (config.command ?? '').trim()
    if (!command)
      throw new TranscriptionError(
        'TRANSCRIPTION_NOT_CONFIGURED',
        'Command transcription provider is not configured: set PODCAST_TRANSCRIPTION_COMMAND to a local ASR binary (e.g. whisper.cpp) that prints whisper-style JSON on stdout.',
      )
    if (!audio.path)
      throw new TranscriptionError(
        'TRANSCRIPTION_AUDIO_MISSING',
        'Command transcription provider needs a local audio file path; none was supplied.',
      )
    const args = (config.args ?? ['{input}']).map((arg) => (arg === '{input}' ? audio.path! : arg))
    let stdout: string
    try {
      stdout = (await (config.runner ?? defaultRunner)(command, args)).stdout
    } catch (error) {
      throw new TranscriptionError(
        'TRANSCRIPTION_PROVIDER_FAILED',
        `Local ASR command "${command}" failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    let parsed: { segments?: unknown; language?: string }
    try {
      parsed = JSON.parse(stdout) as { segments?: unknown; language?: string }
    } catch {
      throw new TranscriptionError(
        'TRANSCRIPTION_PROVIDER_FAILED',
        `Local ASR command "${command}" did not print valid JSON on stdout.`,
      )
    }
    return {
      segments: normalizeSegments(parsed.segments, COMMAND_PROVIDER_ID),
      language: parsed.language ?? 'en',
    }
  },
})

// ---------------------------------------------------------------------------
// HTTP provider (BYO endpoint + key; the documented extension point)
// ---------------------------------------------------------------------------

export const HTTP_PROVIDER_ID = 'http-provider'

export const createHttpTranscriptionProvider = (config: {
  endpoint?: string
  apiKey?: string
  fetchImpl?: typeof fetch
  readBytes?: (path: string) => Promise<Uint8Array>
}): TranscriptionProvider => ({
  id: HTTP_PROVIDER_ID,
  label: 'BYO HTTP transcription endpoint',
  async transcribe(audio) {
    const endpoint = (config.endpoint ?? '').trim()
    if (!endpoint)
      throw new TranscriptionError(
        'TRANSCRIPTION_NOT_CONFIGURED',
        'HTTP transcription provider is not configured: set PODCAST_TRANSCRIPTION_ENDPOINT (and PODCAST_TRANSCRIPTION_API_KEY) for the BYO provider.',
      )
    if (!audio.path || !config.readBytes)
      throw new TranscriptionError(
        'TRANSCRIPTION_AUDIO_MISSING',
        'HTTP transcription provider needs a local audio file to upload; none was supplied.',
      )
    const bytes = await config.readBytes(audio.path)
    const doFetch = config.fetchImpl ?? fetch
    let response: Response
    try {
      response = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': audio.mimeType ?? 'application/octet-stream',
          ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: bytes as BodyInit,
      })
    } catch (error) {
      throw new TranscriptionError(
        'TRANSCRIPTION_PROVIDER_FAILED',
        `HTTP transcription endpoint "${endpoint}" could not be reached: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (!response.ok)
      throw new TranscriptionError(
        'TRANSCRIPTION_PROVIDER_FAILED',
        `HTTP transcription endpoint "${endpoint}" answered HTTP ${response.status}.`,
      )
    const parsed = (await response.json().catch(() => null)) as {
      segments?: unknown
      language?: string
    } | null
    if (!parsed)
      throw new TranscriptionError(
        'TRANSCRIPTION_PROVIDER_FAILED',
        `HTTP transcription endpoint "${endpoint}" did not return JSON.`,
      )
    return {
      segments: normalizeSegments(parsed.segments, HTTP_PROVIDER_ID),
      language: parsed.language ?? 'en',
    }
  },
})

// ---------------------------------------------------------------------------
// Provider resolution from environment/config
// ---------------------------------------------------------------------------

export type TranscriptionConfig = {
  providerId?: string
  command?: string
  endpoint?: string
  apiKey?: string
}

export const transcriptionConfigFromEnv = (
  env: Record<string, string | undefined> = process.env,
): TranscriptionConfig => ({
  providerId: env.PODCAST_TRANSCRIPTION_PROVIDER,
  command: env.PODCAST_TRANSCRIPTION_COMMAND,
  endpoint: env.PODCAST_TRANSCRIPTION_ENDPOINT,
  apiKey: env.PODCAST_TRANSCRIPTION_API_KEY,
})

export const resolveTranscriptionProvider = (
  config: TranscriptionConfig,
  overrides: {
    runner?: CommandRunner
    fetchImpl?: typeof fetch
    readBytes?: (path: string) => Promise<Uint8Array>
  } = {},
): TranscriptionProvider => {
  switch ((config.providerId ?? '').trim()) {
    case FIXTURE_PROVIDER_ID:
      return fixtureTranscriptionProvider
    case HTTP_PROVIDER_ID:
      return createHttpTranscriptionProvider({
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        fetchImpl: overrides.fetchImpl,
        readBytes: overrides.readBytes,
      })
    case COMMAND_PROVIDER_ID:
    case '':
      // Default seam is the sovereign local command provider; with no
      // command configured it fails VISIBLY (named reason), never silently.
      return createCommandTranscriptionProvider({
        command: config.command,
        runner: overrides.runner,
      })
    default:
      throw new TranscriptionError(
        'TRANSCRIPTION_NOT_CONFIGURED',
        `Unknown transcription provider "${config.providerId}". Known providers: ${FIXTURE_PROVIDER_ID}, ${COMMAND_PROVIDER_ID}, ${HTTP_PROVIDER_ID}.`,
      )
  }
}

// ---------------------------------------------------------------------------
// SRT / WebVTT / JSON import + export (word timing preserved, never invented)
// ---------------------------------------------------------------------------

const parseTimestamp = (value: string): number => {
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/)
  if (!match) return Number.NaN
  const [, hours, minutes, seconds, millis] = match
  return (
    Number(hours ?? 0) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(millis.padEnd(3, '0')) / 1000
  )
}

const formatTimestamp = (seconds: number, separator: ',' | '.'): string => {
  const value = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const secs = Math.floor(value % 60)
  const millis = Math.round((value - Math.floor(value)) * 1000)
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${separator}${pad(millis, 3)}`
}

const TIMING_LINE = /^(\S+)\s+-->\s+(\S+)/

const parseCueBlocks = (text: string): TimedSegment[] => {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\n+/)
  const segments: TimedSegment[] = []
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim().length > 0)
    const timingIndex = lines.findIndex((line) => TIMING_LINE.test(line.trim()))
    if (timingIndex < 0) continue
    const match = lines[timingIndex].trim().match(TIMING_LINE)!
    const start = parseTimestamp(match[1])
    const end = parseTimestamp(match[2])
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    let body = lines
      .slice(timingIndex + 1)
      .join(' ')
      .trim()
    let speaker: string | undefined
    const voice = body.match(/^<v\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/)
    if (voice) {
      speaker = voice[1].trim()
      body = voice[2].trim()
    }
    body = body.replace(/<[^>]+>/g, '').trim()
    if (!body) continue
    segments.push({
      id: `seg-${segments.length + 1}`,
      startSeconds: round3(start),
      endSeconds: round3(Math.max(end, start)),
      text: body,
      ...(speaker ? { speaker } : {}),
    })
  }
  assertTranscriptSegments(segments)
  return segments
}

export const parseSrt = (text: string): TimedSegment[] => parseCueBlocks(text)
export const parseVtt = (text: string): TimedSegment[] =>
  parseCueBlocks(text.replace(/^WEBVTT[^\n]*\n/, ''))

export const segmentsToSrt = (segments: readonly TimedSegment[]): string => {
  if (!segments.length) return ''
  return (
    segments
      .map(
        (segment, index) =>
          // SRT carries no speaker channel in the POD-01 serialisation
          // either; speakers round-trip through VTT (<v> spans) and JSON.
          `${index + 1}\n${formatTimestamp(segment.startSeconds, ',')} --> ${formatTimestamp(segment.endSeconds, ',')}\n${segment.text}`,
      )
      .join('\n\n') + '\n'
  )
}

/**
 * POD-21 (POD-18 gap): the clip-range SRT for audiogram caption
 * burn-in. Keeps the segments that OVERLAP `[startSec, endSec)`,
 * clamps each to the range, and re-times it to the clip start (the
 * first cue starts at 0). Segments fully outside the range and
 * empty-text segments are dropped; a range with no overlapping
 * speech yields `{ srt: '', segmentCount: 0 }` — the caller then
 * renders the uncaptioned variant rather than burning an empty track.
 */
export const segmentsToClipSrt = (
  segments: readonly TimedSegment[],
  range: { startSec: number; endSec: number },
): { srt: string; segmentCount: number } => {
  const durationSec = Math.max(0, range.endSec - range.startSec)
  const clipped: TimedSegment[] = []
  for (const segment of segments) {
    if (!segment.text?.trim()) continue
    const start = Math.max(segment.startSeconds, range.startSec)
    const end = Math.min(segment.endSeconds, range.endSec)
    if (!(end > start)) continue
    clipped.push({
      ...segment,
      startSeconds: start - range.startSec,
      endSeconds: Math.min(end - range.startSec, durationSec),
    })
  }
  clipped.sort((a, b) => a.startSeconds - b.startSeconds)
  return { srt: segmentsToSrt(clipped), segmentCount: clipped.length }
}

export const segmentsToVtt = (segments: readonly TimedSegment[]): string => {
  if (!segments.length) return 'WEBVTT\n'
  const cues = segments
    .map(
      (segment) =>
        `${formatTimestamp(segment.startSeconds, '.')} --> ${formatTimestamp(segment.endSeconds, '.')}\n${segment.speaker ? `<v ${segment.speaker}>${segment.text}</v>` : segment.text}`,
    )
    .join('\n\n')
  return `WEBVTT\n\n${cues}\n`
}

/** Podcast-JSON transcript shape (the POD-01 transcript.json serialisation). */
export const segmentsToTranscriptJson = (segments: readonly TimedSegment[]) => ({
  version: '1.0.0',
  segments: segments.map((segment) => ({
    startTime: segment.startSeconds,
    endTime: segment.endSeconds,
    body: segment.text,
    ...(segment.speaker ? { speaker: segment.speaker } : {}),
    ...(segment.words
      ? {
          words: segment.words.map((word) => ({
            start: word.start,
            end: word.end,
            text: word.text,
          })),
        }
      : {}),
  })),
})

export const parseTranscriptJson = (input: unknown): TimedSegment[] => {
  const doc = input as { segments?: unknown } | unknown[]
  const raw = Array.isArray(doc) ? doc : doc?.segments
  return normalizeSegments(raw, 'transcript-json-import')
}

export type TranscriptFormat = 'srt' | 'vtt' | 'json'

export const parseTranscript = (text: string, format: TranscriptFormat): TimedSegment[] => {
  if (format === 'json') return parseTranscriptJson(JSON.parse(text))
  if (format === 'vtt') return parseVtt(text)
  return parseSrt(text)
}

export const serializeTranscript = (
  segments: readonly TimedSegment[],
  format: TranscriptFormat,
): string => {
  if (format === 'json') return JSON.stringify(segmentsToTranscriptJson(segments), null, 2)
  if (format === 'vtt') return segmentsToVtt(segments)
  return segmentsToSrt(segments)
}

// ---------------------------------------------------------------------------
// Segment editing (the simple editor surface's operations)
// ---------------------------------------------------------------------------

const reindex = (segments: TimedSegment[]): TimedSegment[] => {
  const sorted = [...segments].sort((a, b) => a.startSeconds - b.startSeconds)
  assertTranscriptSegments(sorted)
  return sorted.map((segment, index) => ({ ...segment, id: `seg-${index + 1}` }))
}

export const editSegmentText = (
  segments: readonly TimedSegment[],
  segmentId: string,
  text: string,
): TimedSegment[] =>
  reindex(
    segments.map((segment) =>
      segment.id === segmentId ? { ...segment, text: text.trim() } : segment,
    ),
  )

export const setSegmentSpeaker = (
  segments: readonly TimedSegment[],
  segmentId: string,
  speaker: string | undefined,
): TimedSegment[] =>
  reindex(
    segments.map((segment) => {
      if (segment.id !== segmentId) return segment
      const next = { ...segment }
      if (speaker) next.speaker = speaker
      else delete next.speaker
      return next
    }),
  )

/** Splits one segment at a caller-supplied time (never an invented one). */
export const splitSegment = (
  segments: readonly TimedSegment[],
  segmentId: string,
  atSeconds: number,
  secondText?: string,
): TimedSegment[] => {
  const target = segments.find((segment) => segment.id === segmentId)
  if (!target)
    throw new TranscriptionError(
      'TRANSCRIPT_SEGMENT_NOT_FOUND',
      `Transcript segment "${segmentId}" does not exist.`,
    )
  if (!(atSeconds > target.startSeconds && atSeconds < target.endSeconds))
    throw new TranscriptionError(
      'TRANSCRIPT_SEGMENT_SPLIT_INVALID',
      `Split point ${atSeconds}s is outside segment "${segmentId}" (${target.startSeconds}–${target.endSeconds}s).`,
    )
  const words = target.words
  const firstWords = words?.filter((word) => word.end <= atSeconds)
  const secondWords = words?.filter((word) => word.start >= atSeconds)
  const next: TimedSegment[] = []
  for (const segment of segments) {
    if (segment.id !== segmentId) {
      next.push(segment)
      continue
    }
    next.push({
      ...segment,
      endSeconds: round3(atSeconds),
      ...(firstWords && words ? { words: firstWords } : {}),
    })
    next.push({
      ...segment,
      id: `${segment.id}-b`,
      startSeconds: round3(atSeconds),
      text: (secondText ?? segment.text).trim(),
      ...(secondWords && words ? { words: secondWords } : {}),
    })
  }
  return reindex(next)
}

export const mergeSegments = (
  segments: readonly TimedSegment[],
  firstId: string,
  secondId: string,
): TimedSegment[] => {
  const sorted = [...segments].sort((a, b) => a.startSeconds - b.startSeconds)
  const firstIndex = sorted.findIndex((segment) => segment.id === firstId)
  const secondIndex = sorted.findIndex((segment) => segment.id === secondId)
  if (firstIndex < 0 || secondIndex !== firstIndex + 1)
    throw new TranscriptionError(
      'TRANSCRIPT_SEGMENT_MERGE_INVALID',
      `Segments "${firstId}" and "${secondId}" are not adjacent (in that order).`,
    )
  const first = sorted[firstIndex]
  const second = sorted[secondIndex]
  const merged: TimedSegment = {
    ...first,
    endSeconds: second.endSeconds,
    text: `${first.text} ${second.text}`.trim(),
    ...(first.words || second.words
      ? { words: [...(first.words ?? []), ...(second.words ?? [])] }
      : {}),
  }
  return reindex([...sorted.slice(0, firstIndex), merged, ...sorted.slice(secondIndex + 1)])
}
