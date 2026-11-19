/**
 * POD-16 (POD-REQ-34, POD-REQ-35) — live output, unit level:
 *
 * - Stream profile parsing/validation (credential keys refused in the
 *   profile JSON) + credential storage (encrypted envelope + env
 *   reference) + the public projection carrying NO credential
 *   material + redaction of raw/URL-encoded/base64 credential forms.
 * - ffmpeg command construction (+ its redacted loggable form).
 * - Relay supervisor state machine over a fake process + fake
 *   scheduler: connect → live → kill → bounded-backoff reconnect →
 *   live; budget exhaustion → failed; stop during reconnect is
 *   terminal; stable-live resets the budget.
 * - 60 s network-cut simulation: every spawn fails instantly for a
 *   full simulated minute — restarts stay bounded, the supervisor
 *   lands in `failed`, and the POD-09 recording state is untouched.
 * - LIFECYCLE SEPARATION against the REAL POD-09 recorder: the relay
 *   is killed mid-record and stormed with failures; the recording
 *   state subtree is deep-equal throughout, the journal bytes are
 *   byte-identical to what the recorder alone wrote, and the
 *   assembled program track is sample-continuous across the kill.
 * - Now-playing from the POD-08 played log (+ per-show toggle) and
 *   the Icecast metadata update shape.
 * - Live episode lifecycle documents → the three POD-01 feed shapes
 *   (pending liveItem / live liveItem / ended liveItem → normal item
 *   with the recording enclosure, same GUID, exactly one artifact),
 *   conversion idempotent.
 * - Audience room binding parsing (data only — rooms machinery is
 *   not in this tree; see live-room.ts).
 */
import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  int16BytesToFloat,
  MemoryChunkStorage,
} from '../../src/modules/podcast-studio/capture/journal'
import { renderPodcastFeed } from '../../src/modules/podcast-studio/feed-build'
import { inspectPodcastFeed } from '../../src/modules/podcast-studio/feed-validate'
import {
  applyRelayHealth,
  buildFfmpegArgs,
  buildIcecastMetadataUpdate,
  convertLiveEpisodeDoc,
  encryptStreamCredential,
  endLiveEpisodeDoc,
  getLiveStreamState,
  goLiveEpisodeDoc,
  type LiveEpisodeDoc,
  nowPlayingFromPlayedLog,
  onAirLiveModel,
  parseLiveRoomBinding,
  parseStreamProfile,
  publicStreamProfile,
  redactStreamSecrets,
  redactedFfmpegArgs,
  redactedMetadataUpdate,
  RelaySupervisor,
  resolveStreamCredential,
  scheduleLiveEpisode,
  sendIcecastMetadataUpdate,
  type RelayHealth,
  type RelayInput,
  type RelayProcessHandle,
  type RelayScheduler,
  type StreamProfile,
} from '../../src/modules/podcast-studio/live/index'
import { beginPlayedClip } from '../../src/modules/podcast-studio/players/played-log'
import {
  defaultTrackDefinitions,
  MultitrackRecorder,
  sessionRecordingId,
} from '../../src/modules/podcast-studio/recording/index'
import {
  getRecordingState,
  startRecordingState,
} from '../../src/modules/podcast-studio/recording/recording-session'
import { createSession } from '../../src/modules/podcast-studio/session-engine'

const SR = 48_000
const CHUNK = 12_000
const PASSWORD = 's3cret-source-pw!'
const PROFILE: StreamProfile = {
  sourceUrl: 'http://127.0.0.1:8000/show-live',
  bitrateKbps: 128,
  title: 'The Show — Live',
  enabled: true,
  nowPlayingEnabled: true,
}

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeScheduler implements RelayScheduler {
  nowMs = 0
  private timers: Array<{ at: number; fn: () => void; cleared: boolean }> = []
  setTimeout(fn: () => void, ms: number): unknown {
    const timer = { at: this.nowMs + ms, fn, cleared: false }
    this.timers.push(timer)
    return timer
  }
  clearTimeout(handle: unknown): void {
    ;(handle as { cleared: boolean }).cleared = true
  }
  now(): number {
    return this.nowMs
  }
  advance(ms: number): void {
    const target = this.nowMs + ms
    for (;;) {
      const next = this.timers
        .filter((t) => !t.cleared && t.at <= target)
        .sort((a, b) => a.at - b.at)[0]
      if (!next) break
      this.nowMs = next.at
      next.cleared = true
      next.fn()
    }
    this.nowMs = target
  }
}

class FakeProcess implements RelayProcessHandle {
  pid = 4242
  stdin = null
  killedWith: string[] = []
  private spawnCbs: Array<() => void> = []
  private exitCbs: Array<(code: number | null, signal: string | null) => void> = []
  private stderrCbs: Array<(line: string) => void> = []
  onSpawn(cb: () => void): void {
    this.spawnCbs.push(cb)
  }
  onExit(cb: (code: number | null, signal: string | null) => void): void {
    this.exitCbs.push(cb)
  }
  onStderr(cb: (line: string) => void): void {
    this.stderrCbs.push(cb)
  }
  emitSpawn(): void {
    this.spawnCbs.forEach((cb) => cb())
  }
  emitExit(code: number | null, signal: string | null = null): void {
    this.exitCbs.forEach((cb) => cb(code, signal))
  }
  emitStderr(line: string): void {
    this.stderrCbs.forEach((cb) => cb(line))
  }
  kill(signal = 'SIGTERM'): void {
    this.killedWith.push(signal)
    this.emitExit(null, signal)
  }
}

const fakeSpawner = (processes: FakeProcess[]) => (_args: string[], _input: RelayInput) => {
  const proc = new FakeProcess()
  processes.push(proc)
  return proc
}

const health = (state: RelayHealth['state'], extra: Partial<RelayHealth> = {}): RelayHealth => ({
  state,
  pid: state === 'live' ? 4242 : null,
  restarts: 0,
  spawns: 1,
  startedAtMs: 0,
  lastStateChangeAtMs: 0,
  lastExit: null,
  lastError: null,
  nowPlaying: 'The Show — Live',
  mount: '/show-live',
  ...extra,
})

const tone = (freq: number, amp: number, frames: number, startFrame = 0): Float32Array => {
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i++)
    out[i] = amp * Math.sin((2 * Math.PI * freq * (startFrame + i)) / SR)
  return out
}
const stereo = (mono: Float32Array): Float32Array => {
  const out = new Float32Array(mono.length * 2)
  for (let i = 0; i < mono.length; i++) {
    out[i * 2] = mono[i]!
    out[i * 2 + 1] = mono[i]!
  }
  return out
}

// ---------------------------------------------------------------------------
// Stream profile + credential
// ---------------------------------------------------------------------------

describe('POD-16 stream profile', () => {
  it('parses a valid profile and applies the enabled/now-playing defaults', () => {
    const parsed = parseStreamProfile({ sourceUrl: PROFILE.sourceUrl, title: 'T' })
    expect(parsed.bitrateKbps).toBe(128)
    expect(parsed.enabled).toBe(true)
    expect(parsed.nowPlayingEnabled).toBe(true)
  })

  it('refuses credential material inside the profile JSON', () => {
    expect(() =>
      parseStreamProfile({ sourceUrl: PROFILE.sourceUrl, title: 'T', sourcePassword: 'x' }),
    ).toThrow(/must not contain credential field/)
    expect(() =>
      parseStreamProfile({ sourceUrl: 'http://source:pw@127.0.0.1:8000/m', title: 'T' }),
    ).toThrow(/must not embed credentials/)
  })

  it('refuses a mount-less URL and an out-of-range bitrate', () => {
    expect(() => parseStreamProfile({ sourceUrl: 'http://127.0.0.1:8000/', title: 'T' })).toThrow(
      /mount path/,
    )
    expect(() =>
      parseStreamProfile({ sourceUrl: PROFILE.sourceUrl, title: 'T', bitrateKbps: 999 }),
    ).toThrow(/bitrateKbps/)
  })

  it('stores the credential encrypted and resolves it back; env reference wins', () => {
    const envelope = encryptStreamCredential(PASSWORD)
    expect(envelope).not.toContain(PASSWORD)
    expect(resolveStreamCredential({ encrypted: envelope })).toBe(PASSWORD)
    expect(
      resolveStreamCredential(
        { envName: 'POD16_TEST_PW', encrypted: envelope },
        { POD16_TEST_PW: 'from-env' },
      ),
    ).toBe('from-env')
    expect(resolveStreamCredential({})).toBeNull()
    expect(resolveStreamCredential({ envName: 'POD16_MISSING' }, {})).toBeNull()
  })

  it('public projection carries no credential, envelope, or env name', () => {
    const envelope = encryptStreamCredential(PASSWORD)
    const pub = publicStreamProfile({
      streamProfile: PROFILE,
      streamCredentialEncrypted: envelope,
      streamCredentialEnvName: 'POD16_TEST_PW',
    })
    expect(pub?.hasCredential).toBe(true)
    const serialized = JSON.stringify(pub)
    expect(serialized).not.toContain(PASSWORD)
    expect(serialized).not.toContain(envelope)
    expect(serialized).not.toContain('POD16_TEST_PW')
    expect(serialized).not.toContain('streamCredential')
  })

  it('redaction scrubs the raw, URL-encoded, and Basic-base64 credential forms', () => {
    const encoded = encodeURIComponent(PASSWORD)
    const basic = Buffer.from(`source:${PASSWORD}`).toString('base64')
    const line = `ffmpeg icecast://source:${encoded}@host/live header=${basic} raw=${PASSWORD}`
    const out = redactStreamSecrets(line, PASSWORD)
    expect(out).not.toContain(PASSWORD)
    expect(out).not.toContain(encoded)
    expect(out).not.toContain(basic)
    expect(out).toContain('[REDACTED]')
  })
})

// ---------------------------------------------------------------------------
// ffmpeg command construction
// ---------------------------------------------------------------------------

describe('POD-16 ffmpeg command construction', () => {
  it('builds the pipe-ingest relay command; the redacted form is loggable', () => {
    const args = buildFfmpegArgs({
      profile: PROFILE,
      credential: PASSWORD,
      input: { kind: 'pipe' },
    })
    expect(args).toContain('s16le')
    expect(args).toContain('48000')
    expect(args).toContain('libmp3lame')
    expect(args).toContain('128k')
    expect(args).toContain('The Show — Live')
    const output = args[args.length - 1]!
    expect(output).toBe(`icecast://source:${encodeURIComponent(PASSWORD)}@127.0.0.1:8000/show-live`)
    const redacted = redactedFfmpegArgs(args, PASSWORD).join(' ')
    expect(redacted).not.toContain(PASSWORD)
    expect(redacted).not.toContain(encodeURIComponent(PASSWORD))
  })

  it('builds the file-ingest command with looping for a continuous source', () => {
    const args = buildFfmpegArgs({
      profile: PROFILE,
      credential: null,
      input: { kind: 'file', path: '/tmp/tone.wav', loop: true },
    })
    expect(args).toContain('-stream_loop')
    expect(args).toContain('/tmp/tone.wav')
    expect(args[args.length - 1]).toBe('icecast://127.0.0.1:8000/show-live')
  })
})

// ---------------------------------------------------------------------------
// Supervisor state machine
// ---------------------------------------------------------------------------

describe('POD-16 relay supervisor', () => {
  it('connects, goes live, reconnects after a kill with bounded backoff, and stops terminally', () => {
    const scheduler = new FakeScheduler()
    const processes: FakeProcess[] = []
    const relay = new RelaySupervisor({
      profile: PROFILE,
      credential: PASSWORD,
      input: { kind: 'pipe' },
      spawner: fakeSpawner(processes),
      scheduler,
      backoffMs: [1_000, 2_000],
      maxRestarts: 3,
    })
    expect(relay.health.state).toBe('idle')
    relay.start()
    expect(relay.health.state).toBe('connecting')
    processes[0]!.emitSpawn()
    expect(relay.health.state).toBe('live')

    relay.killCurrentProcess()
    expect(relay.health.state).toBe('reconnecting')
    expect(relay.health.restarts).toBe(1)
    scheduler.advance(999)
    expect(processes).toHaveLength(1)
    scheduler.advance(1)
    expect(processes).toHaveLength(2)
    expect(relay.health.state).toBe('connecting')
    processes[1]!.emitSpawn()
    expect(relay.health.state).toBe('live')
    expect(relay.health.spawns).toBe(2)

    // Stop is terminal: killing is suppressed and no restart is pending.
    relay.stop()
    expect(relay.health.state).toBe('stopped')
    scheduler.advance(60_000)
    expect(processes).toHaveLength(2)
  })

  it('exhausts the restart budget into failed, with the ladder respected', () => {
    const scheduler = new FakeScheduler()
    const processes: FakeProcess[] = []
    const relay = new RelaySupervisor({
      profile: PROFILE,
      credential: PASSWORD,
      input: { kind: 'file', path: '/tmp/tone.wav' },
      spawner: fakeSpawner(processes),
      scheduler,
      backoffMs: [100, 200, 400],
      maxRestarts: 3,
    })
    relay.start()
    processes[0]!.emitSpawn()
    processes[0]!.emitExit(1)
    scheduler.advance(100)
    processes[1]!.emitSpawn()
    processes[1]!.emitExit(1)
    scheduler.advance(200)
    processes[2]!.emitSpawn()
    processes[2]!.emitExit(1)
    scheduler.advance(400)
    processes[3]!.emitSpawn()
    processes[3]!.emitExit(1)
    expect(relay.health.state).toBe('failed')
    expect(relay.health.spawns).toBe(4) // 1 initial + 3 bounded restarts
    scheduler.advance(60_000)
    expect(processes).toHaveLength(4)
    // An operator can start it again from failed.
    relay.start()
    expect(processes).toHaveLength(5)
    expect(relay.health.state).toBe('connecting')
  })

  it('a stable-live process earns its restart budget back', () => {
    const scheduler = new FakeScheduler()
    const processes: FakeProcess[] = []
    const relay = new RelaySupervisor({
      profile: PROFILE,
      credential: PASSWORD,
      input: { kind: 'pipe' },
      spawner: fakeSpawner(processes),
      scheduler,
      backoffMs: [100],
      maxRestarts: 1,
      stableLiveMs: 5_000,
    })
    relay.start()
    processes[0]!.emitSpawn()
    relay.killCurrentProcess()
    expect(relay.health.restarts).toBe(1)
    scheduler.advance(100)
    processes[1]!.emitSpawn()
    scheduler.advance(5_000) // stable window elapses while live
    expect(relay.health.restarts).toBe(0)
    relay.killCurrentProcess()
    expect(relay.health.state).toBe('reconnecting') // budget available again, not failed
  })

  it('never logs the credential, even when ffmpeg echoes the output URL on stderr', () => {
    const scheduler = new FakeScheduler()
    const processes: FakeProcess[] = []
    const relay = new RelaySupervisor({
      profile: PROFILE,
      credential: PASSWORD,
      input: { kind: 'pipe' },
      spawner: fakeSpawner(processes),
      scheduler,
    })
    relay.start()
    processes[0]!.emitSpawn()
    processes[0]!.emitStderr(
      `Error opening icecast://source:${encodeURIComponent(PASSWORD)}@127.0.0.1:8000/show-live`,
    )
    relay.killCurrentProcess()
    const allLogs = relay.logLines.join('\n')
    expect(allLogs).not.toContain(PASSWORD)
    expect(allLogs).not.toContain(encodeURIComponent(PASSWORD))
    expect(allLogs).toContain('[REDACTED]')
  })
})

// ---------------------------------------------------------------------------
// Now-playing
// ---------------------------------------------------------------------------

describe('POD-16 now-playing', () => {
  it('follows the played log, dedupes, and respects the per-show toggle', () => {
    const scheduler = new FakeScheduler()
    const processes: FakeProcess[] = []
    const relay = new RelaySupervisor({
      profile: PROFILE,
      credential: PASSWORD,
      input: { kind: 'pipe' },
      spawner: fakeSpawner(processes),
      scheduler,
    })
    let session = createSession({ showId: 'show-1', showTitle: 'The Show' })
    expect(nowPlayingFromPlayedLog(session, PROFILE)).toBe('The Show — Live')
    session = beginPlayedClip(session, {
      source: 'cart',
      clipId: 'cart-1',
      title: 'Theme Song',
    }).session
    const update = relay.syncNowPlaying(session)
    expect(update?.song).toBe('Theme Song')
    expect(relay.syncNowPlaying(session)).toBeNull() // unchanged → no resend
    session = beginPlayedClip(session, {
      source: 'player',
      clipId: 'clip-2',
      title: 'Interview Sting',
    }).session
    expect(relay.syncNowPlaying(session)?.song).toBe('Interview Sting')

    const offProfile = { ...PROFILE, nowPlayingEnabled: false }
    expect(nowPlayingFromPlayedLog(session, offProfile)).toBeNull()
  })

  it('builds the Icecast admin metadata update; only the redacted form is loggable', async () => {
    const update = buildIcecastMetadataUpdate({
      profile: PROFILE,
      credential: PASSWORD,
      song: 'Theme Song',
    })
    expect(update.url).toContain('/admin/metadata?mount=%2Fshow-live&mode=updinfo')
    expect(update.url).toContain('song=Theme%20Song')
    const decoded = Buffer.from(update.authorization.replace('Basic ', ''), 'base64').toString()
    expect(decoded).toBe(`admin:${PASSWORD}`)
    expect(JSON.stringify(redactedMetadataUpdate(update))).not.toContain(PASSWORD)

    let seenAuth = ''
    const result = await sendIcecastMetadataUpdate(update, (async (_url: string, init: any) => {
      seenAuth = init.headers.authorization
      return { ok: true, status: 200 }
    }) as typeof fetch)
    expect(result).toEqual({ ok: true, status: 200 })
    expect(seenAuth).toBe(update.authorization)
  })
})

// ---------------------------------------------------------------------------
// Session-doc surfacing + lifecycle separation (POD-REQ-35)
// ---------------------------------------------------------------------------

describe('POD-16 lifecycle separation', () => {
  it('relay health folds into the session doc without touching the recording subtree', () => {
    let session = createSession({ showId: 'show-1', showTitle: 'The Show' })
    session = startRecordingState(session, { deskMode: 'one-mic' })
    const recordingBefore = JSON.stringify(getRecordingState(session))

    let next = applyRelayHealth(session, health('live'))
    expect(getLiveStreamState(next)?.relayState).toBe('live')
    expect(JSON.stringify(getRecordingState(next))).toBe(recordingBefore)
    next = applyRelayHealth(next, health('reconnecting', { lastError: 'ffmpeg exited (code 1)' }))
    next = applyRelayHealth(next, health('failed', { lastError: 'ffmpeg exited (code 1)' }))
    expect(JSON.stringify(getRecordingState(next))).toBe(recordingBefore)
    const model = onAirLiveModel(next)
    expect(model.streamLive).toBe(false)
    expect(model.recordingActive).toBe(true) // recording never noticed the stream died
    const relayLog = next.log.filter((entry) => entry.type === 'live-relay-state')
    expect(relayLog.map((entry) => entry.relayState)).toEqual(['live', 'reconnecting', 'failed'])
  })

  it('relay killed mid-record: recording state untouched, journal untouched, chunks sample-continuous', async () => {
    const storage = new MemoryChunkStorage()
    const sessionId = 'sess-pod16'
    const recorder = await MultitrackRecorder.start(storage, {
      sessionId,
      tracks: defaultTrackDefinitions([]),
    })
    let session = createSession({ id: sessionId, showId: 'show-1', showTitle: 'The Show' })
    session = startRecordingState(session, { deskMode: 'one-mic' })
    const recordingBefore = JSON.stringify(getRecordingState(session))

    const scheduler = new FakeScheduler()
    const processes: FakeProcess[] = []
    const relay = new RelaySupervisor({
      profile: PROFILE,
      credential: PASSWORD,
      input: { kind: 'pipe' },
      spawner: fakeSpawner(processes),
      scheduler,
      backoffMs: [250],
      maxRestarts: 5,
    })

    const programId = sessionRecordingId(sessionId, 'program')
    const journalSnapshot = async () => {
      const manifest = await storage.getManifest(programId)
      const chunks: string[] = []
      for (const index of await storage.listChunks(programId))
        chunks.push(
          createHash('sha256')
            .update((await storage.getChunk(programId, index))!)
            .digest('hex'),
        )
      return { manifest, chunks }
    }

    // Chunk A lands, the stream goes live, then the relay is KILLED mid-record.
    await recorder.write('program', stereo(tone(440, 0.5, CHUNK, 0)))
    relay.start()
    processes[0]!.emitSpawn()
    const beforeKill = await journalSnapshot()
    relay.killCurrentProcess()
    session = applyRelayHealth(session, relay.health)
    expect(relay.health.state).toBe('reconnecting')
    expect(JSON.stringify(getRecordingState(session))).toBe(recordingBefore)
    expect(await journalSnapshot()).toEqual(beforeKill) // the kill wrote nothing to the journal

    // The stream recovers on the backoff; chunk B lands across the outage.
    scheduler.advance(250)
    processes[1]!.emitSpawn()
    expect(relay.health.state).toBe('live')
    await recorder.write('program', stereo(tone(440, 0.5, CHUNK, CHUNK)))
    // A failure storm (repeated exits) still writes nothing anywhere near the recording.
    processes[1]!.emitExit(1)
    scheduler.advance(250)
    processes[2]!.emitSpawn()
    processes[2]!.emitExit(1)
    session = applyRelayHealth(session, relay.health)
    expect(JSON.stringify(getRecordingState(session))).toBe(recordingBefore)
    await recorder.write('program', stereo(tone(440, 0.5, CHUNK, 2 * CHUNK)))
    await recorder.stop()
    relay.stop()

    // Continuity: the recovered program chunks are exactly the three
    // written chunks, and the 440 Hz tone is phase-continuous across
    // both chunk boundaries — the kill left no hole, shift, or dupe.
    const chunkIndexes = await storage.listChunks(programId)
    expect(chunkIndexes).toEqual([0, 1, 2])
    const pcm: number[] = []
    for (const index of chunkIndexes) {
      const floats = int16BytesToFloat((await storage.getChunk(programId, index))!)
      for (let i = 0; i < floats.length; i += 2) pcm.push(floats[i]!)
    }
    expect(pcm).toHaveLength(3 * CHUNK)
    for (const boundary of [CHUNK - 1, CHUNK, 2 * CHUNK - 1, 2 * CHUNK]) {
      const expected = 0.5 * Math.sin((2 * Math.PI * 440 * boundary) / SR)
      expect(Math.abs(pcm[boundary]! - expected)).toBeLessThan(0.01)
    }
  })

  it('60 s network cut: restarts bounded, supervisor fails terminally, recording untouched', () => {
    let session = createSession({ showId: 'show-1', showTitle: 'The Show' })
    session = startRecordingState(session, { deskMode: 'one-mic' })
    const recordingBefore = JSON.stringify(getRecordingState(session))

    const scheduler = new FakeScheduler()
    const processes: FakeProcess[] = []
    const relay = new RelaySupervisor({
      profile: PROFILE,
      credential: PASSWORD,
      input: { kind: 'pipe' },
      spawner: fakeSpawner(processes),
      scheduler,
      // default ladder 1s,2s,4s,8s,16s,30s(cap), default budget 5
    })
    relay.start()
    // The cut: every process dies instantly, for a full simulated minute.
    for (let step = 0; step < 120; step++) {
      const current = processes[processes.length - 1]!
      if (relay.health.state === 'connecting') current.emitSpawn()
      if (relay.health.state === 'live') current.emitExit(1)
      scheduler.advance(500)
      session = applyRelayHealth(session, relay.health)
    }
    expect(scheduler.nowMs).toBe(60_000)
    expect(relay.health.state).toBe('failed')
    expect(relay.health.spawns).toBe(6) // 1 + 5 bounded restarts, then terminal
    expect(JSON.stringify(getRecordingState(session))).toBe(recordingBefore)
    expect(getRecordingState(session)?.status).toBe('recording')
  })
})

// ---------------------------------------------------------------------------
// Live episode lifecycle → feed shapes
// ---------------------------------------------------------------------------

describe('POD-16 live episode lifecycle', () => {
  const show = {
    id: 'show-1',
    title: 'The Show',
    slug: 'the-show',
    description: 'A show.',
    status: 'published',
    publishedAt: '2026-11-01T00:00:00.000Z',
    rssEnabled: true,
  }
  const feedFor = (episode: Record<string, unknown>) =>
    renderPodcastFeed(show as never, [episode] as never, {
      origin: 'https://example.test',
      feedPath: '/podcasts/the-show/feed.xml',
      showPath: '/podcasts/the-show',
      includeMembersOnly: false,
    })
  const baseEpisode = {
    id: 'ep-1',
    title: 'Live Night',
    slug: 'live-night',
    description: 'A live episode.',
    status: 'published',
    publishedAt: '2026-11-18T00:00:00.000Z',
  }

  it('scheduled → live → ended → converted renders the three feed shapes with one GUID', () => {
    type Ep = LiveEpisodeDoc & Record<string, unknown>
    let episode: Ep = scheduleLiveEpisode({ ...baseEpisode } as Ep, {
      startAt: '2026-11-18T20:00:00.000Z',
      streamUrl: PROFILE.sourceUrl,
    })
    let feed = feedFor(episode)
    let inspection = inspectPodcastFeed(feed)
    expect(inspection.valid).toBe(true)
    expect(inspection.counts).toMatchObject({ items: 0, liveItems: 1 })
    expect(feed).toContain('<podcast:liveItem status="pending"')

    episode = goLiveEpisodeDoc(episode, '2026-11-18T20:01:00.000Z')
    feed = feedFor(episode)
    inspection = inspectPodcastFeed(feed)
    expect(inspection.counts).toMatchObject({ items: 0, liveItems: 1 })
    expect(feed).toContain('<podcast:liveItem status="live"')

    episode = endLiveEpisodeDoc(episode, '2026-11-18T21:00:00.000Z')
    feed = feedFor(episode)
    inspection = inspectPodcastFeed(feed)
    expect(inspection.counts).toMatchObject({ items: 0, liveItems: 1 })
    expect(feed).toContain('<podcast:liveItem status="ended"')

    // Convert with the POD-09 recording's program asset attached.
    const audio = {
      id: 'asset-program',
      mimeType: 'audio/wav',
      sizeBytes: 123_456,
      durationSeconds: 3600,
    }
    const converted = convertLiveEpisodeDoc(episode, { audioAssetId: 'asset-program' })
    expect(converted.converted).toBe(true)
    episode = { ...converted.episode, audio }
    feed = feedFor(episode)
    inspection = inspectPodcastFeed(feed)
    expect(inspection.valid).toBe(true)
    expect(inspection.counts).toMatchObject({ items: 1, liveItems: 0, enclosures: 1 })
    expect(feed).toContain('/media/asset-program')
    expect(feed).toContain('length="123456"')

    // Idempotent: converting again with the same recording changes nothing.
    const again = convertLiveEpisodeDoc(converted.episode, { audioAssetId: 'asset-program' })
    expect(again.converted).toBe(false)
    expect(again.episode).toEqual(converted.episode)
  })

  it('refuses illegal lifecycle jumps by name', () => {
    const plain = { id: 'ep-2', liveState: 'none' }
    expect(() => goLiveEpisodeDoc(plain, '2026-11-18T20:00:00.000Z')).toThrow(/cannot go live/)
    expect(() => endLiveEpisodeDoc(plain, '2026-11-18T21:00:00.000Z')).toThrow(/not live/)
    expect(() => convertLiveEpisodeDoc(plain, { audioAssetId: 'a' })).toThrow(/cannot convert/)
  })
})

// ---------------------------------------------------------------------------
// Audience room binding (data only)
// ---------------------------------------------------------------------------

describe('POD-16 audience room binding', () => {
  it('parses public/members bindings and refuses anything else', () => {
    expect(parseLiveRoomBinding({ roomId: 'room-9', access: 'members' })).toEqual({
      roomId: 'room-9',
      access: 'members',
    })
    expect(parseLiveRoomBinding({ roomId: 'room-9' }).access).toBe('public')
    expect(() => parseLiveRoomBinding({ roomId: 'room-9', access: 'vip' })).toThrow(/access/)
    expect(() => parseLiveRoomBinding({ access: 'public' })).toThrow(/roomId/)
  })
})
