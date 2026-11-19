/**
 * POD-16 (POD-REQ-34, POD-REQ-35) — Icecast relay supervisor (PURE
 * CORE + injected process/scheduler seams; the real ffmpeg process
 * adapter is `relay-process.ts`).
 *
 * One supervisor owns ONE ffmpeg process per live session. ffmpeg
 * reads the session's program audio from the ingest input and pushes
 * MP3 to the show's Icecast mount (see `stream-profile.ts`).
 *
 * INGEST TRANSPORT: in production the program bus lives in the
 * host's browser (POD-07), so program bytes must cross to the server
 * before ffmpeg can relay them. POD-16 delivered and proved
 * everything behind that boundary (supervisor lifecycle, ffmpeg
 * command construction, pipe/file ingest — real ffmpeg pushing
 * fixture audio through a local pipe and from a file into the
 * Icecast fixture, with a real listener receiving decodable audio).
 * POD-21 built the missing server side of the byte path itself: the
 * browser uploads sequential PCM chunks to a per-session ingest
 * buffer (`ingest-buffer.ts`), and the `ingest` input kind below
 * feeds ffmpeg from that buffer through a named pipe the pump
 * adapter (`ingest-pump.ts`) tails the buffer's program file into.
 *
 * Lifecycle separation (POD-REQ-35) is structural here: the
 * supervisor's ONLY outputs are its health snapshot, its log lines
 * and (via the caller's callback) session-doc live-state entries. It
 * has no reference to the recording journal, the recorder, or any
 * episode store — a relay crash, restart storm or total failure
 * cannot write to, stop, or corrupt a recording. The two state
 * machines share only the session clock, which the caller passes in
 * as elapsed seconds on health snapshots.
 *
 * State machine: idle → connecting → live → (process exit)
 * reconnecting → connecting → live … bounded by `maxRestarts` with
 * exponential backoff (`backoffMs`, capped at the last entry); when
 * the bound is exhausted the state is `failed` and stays there until
 * an operator starts it again. `stop()` is terminal (`stopped`) and
 * suppresses any pending restart. A process that stays live for
 * `stableLiveMs` earns its restart budget back.
 */

import { getPlayedClipLog } from '../players/played-log'
import type { StudioSessionDoc } from '../session-engine'
import { redactStreamSecrets, streamMountPath, type StreamProfile } from './stream-profile'

export type RelayState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'failed' | 'stopped'

/** Where ffmpeg gets the program audio. `pipe` = the adapter's stdin (the ingest buffer seam). */
export type RelayInput =
  | { kind: 'pipe' }
  | { kind: 'file'; path: string; loop?: boolean }
  | { kind: 'url'; url: string }
  /**
   * POD-21: the per-session live ingest buffer, consumed through the
   * named pipe the pump adapter tails the buffer's program file into
   * (`ingest-pump.ts`). ffmpeg reads the FIFO exactly like the pipe
   * input — same s16le stereo 48 kHz format — it just never sees EOF
   * while the pump holds the write end.
   */
  | { kind: 'ingest'; fifoPath: string }

export type RelayProcessHandle = {
  pid?: number
  /** Writable stdin when the input kind is `pipe`; null otherwise. */
  stdin: { write(chunk: Uint8Array): boolean; end(): void } | null
  kill(signal?: string): void
  onSpawn(callback: () => void): void
  onExit(callback: (code: number | null, signal: string | null) => void): void
  onStderr(callback: (line: string) => void): void
}

export type RelaySpawner = (args: string[], input: RelayInput) => RelayProcessHandle

export type RelayScheduler = {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  now(): number
}

export const systemRelayScheduler: RelayScheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
}

export type RelayHealth = {
  state: RelayState
  /** ffmpeg process id of the current attempt, when one is running. */
  pid: number | null
  /** Restarts consumed since the last stable-live reset (or start). */
  restarts: number
  /** Total processes spawned since start(). */
  spawns: number
  startedAtMs: number | null
  lastStateChangeAtMs: number
  lastExit: { code: number | null; signal: string | null } | null
  lastError: string | null
  /** Current now-playing title (stream title or the latest played clip). */
  nowPlaying: string | null
  mount: string
}

export type RelaySupervisorOptions = {
  profile: StreamProfile
  credential: string | null
  input: RelayInput
  spawner: RelaySpawner
  scheduler?: RelayScheduler
  /** Bounded restart budget per unstable run (default 5). */
  maxRestarts?: number
  /** Backoff ladder in ms; the last entry is the cap (default 1s→30s doubling). */
  backoffMs?: number[]
  /** A process live at least this long resets the restart budget (default 30 s). */
  stableLiveMs?: number
  /** Receives every supervisor log line, ALREADY credential-redacted. */
  log?: (line: string) => void
  /** Called on every health change (state transitions, exits, now-playing). */
  onHealth?: (health: RelayHealth) => void
}

const DEFAULT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]

/**
 * Builds the ffmpeg argument vector for one relay attempt. The
 * credential travels ONLY inside the icecast:// output URL (ffmpeg's
 * source authentication) — callers must log `redactedFfmpegArgs`,
 * never this vector.
 */
export function buildFfmpegArgs(request: {
  profile: StreamProfile
  credential: string | null
  input: RelayInput
}): string[] {
  const { profile, credential, input } = request
  const args: string[] = ['-hide_banner', '-loglevel', 'warning']
  if (input.kind === 'pipe') {
    // Raw s16le stereo at the POD-00 working rate — the ingest buffer's format.
    // The format is fully specified, so stream analysis has nothing to
    // discover: cap it. ffmpeg 7.0 (the bundled engine) otherwise spends
    // its default 5 s analysis window on a real-time-paced pipe before
    // opening the output, which stalls the live relay past its startup
    // budget; newer ffmpeg opens immediately either way.
    args.push(
      '-analyzeduration',
      '0',
      '-probesize',
      '32768',
      '-f',
      's16le',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-i',
      'pipe:0',
    )
  } else if (input.kind === 'ingest') {
    // Same raw format, read from the ingest buffer's named pipe (same
    // analysis cap as the pipe input — the fifo is real-time-paced too).
    args.push(
      '-analyzeduration',
      '0',
      '-probesize',
      '32768',
      '-f',
      's16le',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-i',
      input.fifoPath,
    )
  } else if (input.kind === 'file') {
    if (input.loop) args.push('-stream_loop', '-1')
    args.push('-re', '-i', input.path)
  } else {
    args.push('-re', '-i', input.url)
  }
  const mount = new URL(profile.sourceUrl)
  const auth = credential ? `source:${encodeURIComponent(credential)}@` : ''
  const output = `icecast://${auth}${mount.host}${mount.pathname}`
  args.push(
    '-c:a',
    'libmp3lame',
    '-b:a',
    `${profile.bitrateKbps}k`,
    '-ar',
    '44100',
    '-ac',
    '2',
    '-content_type',
    'audio/mpeg',
    '-ice_name',
    profile.title,
    '-ice_public',
    '0',
    '-f',
    'mp3',
    output,
  )
  return args
}

/** The same argument vector with the credential scrubbed — the only form a log may carry. */
export const redactedFfmpegArgs = (args: string[], credential: string | null): string[] =>
  args.map((arg) => redactStreamSecrets(arg, credential))

// ---------------------------------------------------------------------------
// Now-playing (POD-REQ-34): follows the POD-08 played-clip log
// ---------------------------------------------------------------------------

/**
 * The now-playing title for a session: the most recently STARTED
 * played-log entry's title (a clip on air now, or the last one that
 * played), falling back to the show's stream title. Returns null when
 * the per-show toggle is off — the stream then keeps its static
 * title and no metadata updates are sent.
 */
export function nowPlayingFromPlayedLog(
  session: StudioSessionDoc,
  profile: StreamProfile,
): string | null {
  if (!profile.nowPlayingEnabled) return null
  const log = getPlayedClipLog(session)
  const latest = log[log.length - 1]
  return latest ? latest.title : profile.title
}

export type IcecastMetadataUpdate = {
  url: string
  /** HTTP Basic credentials for the Icecast admin endpoint: user `admin`. */
  authorization: string
  mount: string
  song: string
}

/**
 * Builds an Icecast metadata update request (GET
 * /admin/metadata?mount=…&mode=updinfo&song=…) — the standard Icecast
 * admin API call. The admin credential is the source credential (the
 * fixture and a default Icecast both accept the source/admin password
 * arrangement an operator configures; see LIVE.md). The returned
 * object carries the credential in its authorization header — send
 * it, never log it; `redactedMetadataUpdate` is the loggable form.
 */
export function buildIcecastMetadataUpdate(input: {
  profile: StreamProfile
  credential: string | null
  song: string
}): IcecastMetadataUpdate {
  const origin = new URL(input.profile.sourceUrl).origin
  const mount = streamMountPath(input.profile)
  const url = `${origin}/admin/metadata?mount=${encodeURIComponent(mount)}&mode=updinfo&song=${encodeURIComponent(input.song)}`
  return {
    url,
    authorization: `Basic ${Buffer.from(`admin:${input.credential ?? ''}`).toString('base64')}`,
    mount,
    song: input.song,
  }
}

export const redactedMetadataUpdate = (update: IcecastMetadataUpdate) => ({
  url: update.url,
  mount: update.mount,
  song: update.song,
  authorization: '[REDACTED]',
})

/** Sends a metadata update through an injected fetch (tests + adapter share this). */
export async function sendIcecastMetadataUpdate(
  update: IcecastMetadataUpdate,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number }> {
  const response = await fetchImpl(update.url, {
    headers: { authorization: update.authorization },
  })
  return { ok: response.ok, status: response.status }
}

// ---------------------------------------------------------------------------
// Supervisor
// ---------------------------------------------------------------------------

export class RelaySupervisor {
  private state: RelayState = 'idle'
  private process: RelayProcessHandle | null = null
  private restarts = 0
  private spawns = 0
  private startedAtMs: number | null = null
  private lastStateChangeAtMs: number
  private lastExit: RelayHealth['lastExit'] = null
  private lastError: string | null = null
  private nowPlaying: string | null
  private restartTimer: unknown = null
  private stableTimer: unknown = null
  private stopping = false
  private readonly scheduler: RelayScheduler
  private readonly maxRestarts: number
  private readonly backoffMs: number[]
  private readonly stableLiveMs: number
  /** Every log line the supervisor emitted, redacted — the redaction test scans this. */
  readonly logLines: string[] = []

  constructor(private readonly options: RelaySupervisorOptions) {
    this.scheduler = options.scheduler ?? systemRelayScheduler
    this.maxRestarts = options.maxRestarts ?? 5
    this.backoffMs = options.backoffMs?.length ? options.backoffMs : DEFAULT_BACKOFF_MS
    this.stableLiveMs = options.stableLiveMs ?? 30_000
    this.lastStateChangeAtMs = this.scheduler.now()
    this.nowPlaying = options.profile.title
  }

  get health(): RelayHealth {
    return {
      state: this.state,
      pid: this.process?.pid ?? null,
      restarts: this.restarts,
      spawns: this.spawns,
      startedAtMs: this.startedAtMs,
      lastStateChangeAtMs: this.lastStateChangeAtMs,
      lastExit: this.lastExit,
      lastError: this.lastError,
      nowPlaying: this.nowPlaying,
      mount: streamMountPath(this.options.profile),
    }
  }

  private log(line: string): void {
    const safe = redactStreamSecrets(line, this.options.credential)
    this.logLines.push(safe)
    if (this.logLines.length > 500) this.logLines.splice(0, this.logLines.length - 500)
    this.options.log?.(safe)
  }

  private setState(next: RelayState): void {
    if (this.state === next) return
    this.state = next
    this.lastStateChangeAtMs = this.scheduler.now()
    this.options.onHealth?.(this.health)
  }

  private clearTimers(): void {
    if (this.restartTimer !== null) this.scheduler.clearTimeout(this.restartTimer)
    if (this.stableTimer !== null) this.scheduler.clearTimeout(this.stableTimer)
    this.restartTimer = null
    this.stableTimer = null
  }

  /** Starts the relay. A no-op (with the current health) unless idle/failed/stopped. */
  start(): RelayHealth {
    if (this.state === 'connecting' || this.state === 'live' || this.state === 'reconnecting')
      return this.health
    this.stopping = false
    this.restarts = 0
    this.startedAtMs = this.scheduler.now()
    this.lastError = null
    this.spawn()
    return this.health
  }

  private spawn(): void {
    this.setState('connecting')
    const args = buildFfmpegArgs({
      profile: this.options.profile,
      credential: this.options.credential,
      input: this.options.input,
    })
    this.log(`relay spawn: ffmpeg ${redactedFfmpegArgs(args, this.options.credential).join(' ')}`)
    let handle: RelayProcessHandle
    try {
      handle = this.options.spawner(args, this.options.input)
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      this.log(`relay spawn failed: ${this.lastError}`)
      this.handleFailure()
      return
    }
    this.process = handle
    this.spawns += 1
    handle.onSpawn(() => {
      if (this.process !== handle || this.stopping) return
      this.setState('live')
      this.log(`relay live: pid ${handle.pid ?? '?'} → ${this.health.mount}`)
      this.options.onHealth?.(this.health)
      this.stableTimer = this.scheduler.setTimeout(() => {
        if (this.state === 'live' && this.process === handle) {
          this.restarts = 0
          this.log('relay stable: restart budget reset')
        }
      }, this.stableLiveMs)
    })
    handle.onStderr((line) => {
      // ffmpeg stderr can echo the output URL — always through the redactor.
      this.log(`ffmpeg: ${line}`)
    })
    handle.onExit((code, signal) => {
      if (this.process !== handle) return
      this.process = null
      this.lastExit = { code, signal }
      if (this.stableTimer !== null) this.scheduler.clearTimeout(this.stableTimer)
      this.stableTimer = null
      if (this.stopping) return
      this.lastError = `ffmpeg exited (code ${code ?? 'null'}${signal ? `, signal ${signal}` : ''})`
      this.log(`relay process exit: ${this.lastError}`)
      this.handleFailure()
    })
  }

  private handleFailure(): void {
    if (this.stopping) return
    if (this.restarts >= this.maxRestarts) {
      this.setState('failed')
      this.log(
        `relay failed: restart budget exhausted (${this.maxRestarts}); operator action required`,
      )
      this.options.onHealth?.(this.health)
      return
    }
    const delay = this.backoffMs[Math.min(this.restarts, this.backoffMs.length - 1)]!
    this.restarts += 1
    this.setState('reconnecting')
    this.log(`relay reconnecting: attempt ${this.restarts}/${this.maxRestarts} in ${delay} ms`)
    this.options.onHealth?.(this.health)
    this.restartTimer = this.scheduler.setTimeout(() => {
      this.restartTimer = null
      if (this.stopping) return
      this.spawn()
    }, delay)
  }

  /**
   * Kills the current ffmpeg process WITHOUT stopping the supervisor —
   * the reconnect path treats it as a crash. This is the failure the
   * POD-REQ-35 rig scenario injects mid-record.
   */
  killCurrentProcess(signal = 'SIGKILL'): void {
    this.process?.kill(signal)
  }

  /** Terminal stop: kills the process, cancels any pending restart, lands in `stopped`. */
  stop(): RelayHealth {
    this.stopping = true
    this.clearTimers()
    const handle = this.process
    this.process = null
    handle?.kill('SIGTERM')
    this.setState('stopped')
    this.log('relay stopped by operator')
    this.options.onHealth?.(this.health)
    return this.health
  }

  /** Writes program PCM into a pipe-ingest process (the ingest buffer seam). */
  writeProgramAudio(chunk: Uint8Array): boolean {
    if (this.state !== 'live' || !this.process?.stdin) return false
    return this.process.stdin.write(chunk)
  }

  /**
   * Follows the played log: computes the session's now-playing title
   * and, when it changed and the show toggle is on, returns the
   * Icecast metadata update to send (the caller/adapter sends it via
   * `sendIcecastMetadataUpdate`). Returns null when nothing changed
   * or the toggle is off.
   */
  syncNowPlaying(session: StudioSessionDoc): IcecastMetadataUpdate | null {
    const title = nowPlayingFromPlayedLog(session, this.options.profile)
    if (title === null) return null
    if (title === this.nowPlaying) return null
    this.nowPlaying = title
    this.log(`now-playing: ${title}`)
    this.options.onHealth?.(this.health)
    return buildIcecastMetadataUpdate({
      profile: this.options.profile,
      credential: this.options.credential,
      song: title,
    })
  }
}
