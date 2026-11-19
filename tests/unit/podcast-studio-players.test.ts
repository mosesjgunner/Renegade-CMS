/**
 * POD-08 (POD-REQ-13): headless tests for the players & cartwall audio
 * cores — player engine (LRU, cues, played-dimming, played log, PFL),
 * cartwall audio (click play/stop, countdown, edit-mode gate, STOP ALL
 * integration), waveform geometry, fuzzy clip search, and server peaks
 * (pure reduction + the real ffmpeg path against a generated WAV).
 *
 * What this does NOT prove: real browser playback. The browser adapter
 * (players-browser.ts) is UNVERIFIED against a real AudioContext — see
 * the POD-08 handoff.
 */
import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { hasFfmpeg } from '../helpers/ffmpeg-availability'

import {
  computePeaksFromPcm,
  generatePeaksForAsset,
  generatePeaksForBytes,
  PEAKS_PER_SECOND,
} from '../../src/modules/media/peaks'
import { addBank, addClip, createSession } from '../../src/modules/podcast-studio/session-engine'
import {
  advanceCarts,
  assignCartAsset,
  cartCountdownSec,
  createCartwallAudio,
  cueMarkerX,
  damerauLevenshtein,
  fitView,
  fuzzyMatch,
  getPlayedClipLog,
  openPlayedClips,
  panBy,
  PlayerEngine,
  searchClips,
  setCartLevel,
  setEditMode,
  stopAllAudio,
  toggleCart,
  visibleColumns,
  wheelCartFader,
  xToTime,
  zoomAt,
  clickSeekTime,
  ClipBrowserStore,
  type ClipLibraryItem,
  type PlayerEvent,
} from '../../src/modules/podcast-studio/players'
import { dispatchPlayerAction } from '../../src/modules/podcast-studio/players/players-browser'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clip = (n: number, durationSec = 60) => ({
  assetId: `asset-${n}`,
  title: `Clip ${n}`,
  durationSec,
})

const makeWavBytes = (seconds: number, sampleRate = 44100, amplitude = 0.8): Buffer => {
  const frames = Math.floor(seconds * sampleRate)
  const dataSize = frames * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < frames; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * amplitude
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2)
  }
  return buffer
}

const cartSession = () => {
  let session = createSession({ id: 'sess-1', showId: 'show-1', showTitle: 'Show' })
  session = addBank(session, { id: 'bank-1', name: 'Main' }).session
  session = addClip(session, 'bank-1', {
    id: 'cart-1',
    title: 'Intro sting',
    cueInSec: 0,
    cueOutSec: 10,
  }).session
  session = addClip(session, 'bank-1', {
    id: 'cart-2',
    title: 'Ad read',
    cueInSec: 0,
    cueOutSec: 30,
  }).session
  return session
}

// ---------------------------------------------------------------------------
// Player engine: LRU + already-loaded
// ---------------------------------------------------------------------------

describe('player engine — load policy', () => {
  it('loads into empty players in order, then reuses the LRU non-playing player', () => {
    const engine = new PlayerEngine()
    for (let n = 0; n < 8; n++) {
      const result = engine.loadClip(clip(n))
      expect(result.playerIndex).toBe(n)
    }
    engine.play(3) // player 3 is playing — untouchable
    const reused = engine.loadClip(clip(99))
    expect(reused.ok).toBe(true)
    expect(reused.playerIndex).toBe(0) // least-recently-used non-playing
    expect(engine.players[0].clip?.assetId).toBe('asset-99')
    expect(engine.players[3].clip?.assetId).toBe('asset-3')
  })

  it('flashes already-loaded instead of reloading, and rejects when all players play', () => {
    const events: PlayerEvent[] = []
    const engine = new PlayerEngine({ onEvent: (event) => events.push(event) })
    engine.loadClip(clip(1))
    engine.loadClip(clip(2))
    const again = engine.loadClip(clip(1))
    expect(again).toEqual({ ok: true, playerIndex: 0, reason: 'already-loaded' })
    expect(events.some((e) => e.type === 'already-loaded' && e.playerIndex === 0)).toBe(true)
    // The other player was not disturbed.
    expect(engine.players[1].clip?.assetId).toBe('asset-2')

    for (let n = 10; n < 16; n++) engine.loadClip(clip(n))
    for (let i = 0; i < 8; i++) engine.play(i)
    const rejected = engine.loadClip(clip(777))
    expect(rejected.ok).toBe(false)
    expect(rejected.reason).toBe('all-players-playing')
    expect(events.some((e) => e.type === 'load-rejected')).toBe(true)
  })

  it('loads by media asset id (clip-browser path)', () => {
    const engine = new PlayerEngine()
    const result = engine.loadByAssetId({ assetId: 'asset-x', title: 'X', durationSec: 12 })
    expect(result).toEqual({ ok: true, playerIndex: 0 })
    expect(engine.players[0].cueOutSec).toBe(12)
  })
})

// ---------------------------------------------------------------------------
// Player engine: cues, STOP→IN, auto-return, warning
// ---------------------------------------------------------------------------

describe('player engine — cues and transport', () => {
  it('quantizes cues to 0.1 s, STOP returns to IN, playback auto-returns at OUT', () => {
    const engine = new PlayerEngine()
    engine.loadClip(clip(1))
    engine.setCueIn(0, 5.04)
    engine.setCueOut(0, 20.06)
    expect(engine.players[0].cueInSec).toBeCloseTo(5.0, 5)
    expect(engine.players[0].cueOutSec).toBeCloseTo(20.1, 5)
    expect(engine.players[0].positionSec).toBeCloseTo(5.0, 5)

    engine.play(0)
    engine.advance(3)
    expect(engine.players[0].positionSec).toBeCloseTo(8.0, 5)
    engine.stop(0) // STOP → IN
    expect(engine.players[0].positionSec).toBeCloseTo(5.0, 5)
    expect(engine.players[0].status).toBe('loaded')

    engine.play(0)
    engine.advance(15.1) // exactly to OUT
    expect(engine.players[0].status).toBe('loaded') // auto-returned, stopped
    expect(engine.players[0].positionSec).toBeCloseTo(5.0, 5)
  })

  it('raises the last-10-seconds warning once per play and serves elapsed/remaining', () => {
    const events: PlayerEvent[] = []
    const engine = new PlayerEngine({ onEvent: (event) => events.push(event) })
    engine.loadClip({ assetId: 'a', title: 'A', durationSec: 30, cueInSec: 0, cueOutSec: 30 })
    engine.play(0)
    engine.advance(19)
    expect(engine.displayModel(0, 'remaining').endWarning).toBe(false)
    engine.advance(2) // 9 s remaining
    const model = engine.displayModel(0, 'remaining')
    expect(model.endWarning).toBe(true)
    expect(model.remainingSec).toBeCloseTo(9, 5)
    expect(engine.displayModel(0, 'elapsed').elapsedSec).toBeCloseTo(21, 5)
    engine.advance(1)
    expect(events.filter((e) => e.type === 'end-warning')).toHaveLength(1)
  })

  it('applies the log fader taper and the 1 dB wheel step', () => {
    const engine = new PlayerEngine()
    engine.loadClip(clip(1))
    expect(engine.faderLinear(0)).toBeCloseTo(1, 5) // 0 dB = unity
    engine.setFaderDb(0, -20)
    expect(engine.faderLinear(0)).toBeCloseTo(0.1, 5)
    engine.setFaderDb(0, -60)
    expect(engine.faderLinear(0)).toBe(0)
    engine.wheelFader(0, -120) // wheel up one notch
    expect(engine.players[0].gainDb).toBe(-59)
    engine.wheelFader(0, 120)
    expect(engine.players[0].gainDb).toBe(-60)
  })
})

// ---------------------------------------------------------------------------
// Player engine: PFL routing + played-dimming + played log
// ---------------------------------------------------------------------------

describe('player engine — PFL, dimming, played log', () => {
  it('assigns a PFL player to the cue bus only, never program', () => {
    const engine = new PlayerEngine()
    engine.loadClip(clip(1))
    expect(engine.busAssignment(0)).toBe('clips')
    const bus = engine.setPfl(0, true)
    expect(bus).toBe('cue')
    expect(engine.busAssignment(0)).toBe('cue')
    engine.setPfl(0, false)
    expect(engine.busAssignment(0)).toBe('clips')
  })

  it('dims only on-air plays; PFL auditions neither dim nor log', () => {
    const engine = new PlayerEngine()
    engine.loadClip(clip(1))
    engine.loadClip(clip(2))
    engine.setPfl(1, true)
    engine.play(1) // PFL audition
    expect(engine.isPlayed('asset-2')).toBe(false)
    expect(engine.playedLog).toHaveLength(0)
    engine.play(0) // on air
    expect(engine.isPlayed('asset-1')).toBe(true)
    expect(engine.playedLog).toHaveLength(1)
    engine.resetPlayed()
    expect(engine.isPlayed('asset-1')).toBe(false)
    engine.play(0)
    engine.startNewSession() // new-show rule clears marks
    expect(engine.isPlayed('asset-1')).toBe(false)
  })

  it('honours the per-show played-dimming opt-out', () => {
    const engine = new PlayerEngine({ playedDimmingEnabled: false })
    engine.loadClip(clip(1))
    engine.play(0)
    expect(engine.isPlayed('asset-1')).toBe(false)
    expect(engine.players[0].played).toBe(false)
    // The played LOG is not the dimming toggle: on-air plays still log.
    expect(engine.playedLog).toHaveLength(1)
  })

  it('writes the played log at play START (crash-safe) and closes it at end', () => {
    let now = 100
    const engine = new PlayerEngine({ sessionElapsedSec: () => now })
    engine.loadClip(clip(1))
    engine.play(0)
    // Crash simulation: no stop, no advance — the entry already exists.
    expect(engine.playedLog).toHaveLength(1)
    expect(engine.playedLog[0]).toMatchObject({
      clipId: 'asset-1',
      assetId: 'asset-1',
      startedAtSessionSec: 100,
      endedAtSessionSec: null,
      outcome: 'playing',
    })
    now = 130
    engine.stop(0)
    expect(engine.playedLog[0]).toMatchObject({ endedAtSessionSec: 130, outcome: 'stopped' })

    // Completion case: run to OUT.
    engine.play(0)
    now = 200
    engine.advance(60)
    const completed = engine.playedLog[1]
    expect(completed).toMatchObject({ outcome: 'completed', endedAtSessionSec: 200 })

    // Pause/resume is ONE play (one log entry), not two.
    engine.play(0)
    engine.pause(0)
    engine.play(0)
    expect(engine.playedLog.filter((e) => e.outcome === 'playing')).toHaveLength(1)
    engine.stop(0)
  })

  it('folds the played log into the session document idempotently', () => {
    const engine = new PlayerEngine({ sessionElapsedSec: () => 42 })
    engine.loadClip(clip(1))
    engine.play(0)
    const session = createSession({ id: 's', showId: 'show', showTitle: 'Show' })
    const once = engine.playedLogToSession(session)
    expect(getPlayedClipLog(once)).toHaveLength(1)
    expect(openPlayedClips(once)).toHaveLength(1) // still open: crash-safe shape
    engine.stop(0)
    const twice = engine.playedLogToSession(once)
    expect(getPlayedClipLog(twice)).toHaveLength(1)
    expect(getPlayedClipLog(twice)[0].outcome).toBe('stopped')
    expect(openPlayedClips(twice)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Cartwall audio
// ---------------------------------------------------------------------------

describe('cartwall audio', () => {
  it('click plays, countdown runs, playing to OUT marks played + closes the log completed', () => {
    const session = cartSession()
    const wall = createCartwallAudio(session)
    const begun = toggleCart(wall, session, 'cart-1')
    expect(begun.ok).toBe(true)
    const playing = begun.state.carts.find((c) => c.cartId === 'cart-1')!
    expect(playing.status).toBe('playing')
    // Log entry exists at play START in the session document.
    expect(getPlayedClipLog(begun.session!)).toHaveLength(1)
    expect(getPlayedClipLog(begun.session!)[0].outcome).toBe('playing')

    const midway = advanceCarts(begun.state, begun.session!, 4)
    const midCart = midway.state.carts.find((c) => c.cartId === 'cart-1')!
    expect(cartCountdownSec(midCart)).toBeCloseTo(6, 5)

    const done = advanceCarts(midway.state, midway.session!, 6)
    const doneCart = done.state.carts.find((c) => c.cartId === 'cart-1')!
    expect(doneCart.status).toBe('played')
    expect(getPlayedClipLog(done.session!)[0]).toMatchObject({ outcome: 'completed' })
    const sessionClip = done
      .session!.cartwall.banks.find((b) => b.id === 'bank-1')!
      .clips.find((c) => c.id === 'cart-1')!
    expect(sessionClip.state).toBe('played') // dimming state in the POD-05 doc
  })

  it('click again stops: log closes as stopped and the cart dims', () => {
    const session = cartSession()
    const wall = createCartwallAudio(session)
    const begun = toggleCart(wall, session, 'cart-2')
    const stopped = toggleCart(begun.state, begun.session!, 'cart-2')
    expect(stopped.state.carts.find((c) => c.cartId === 'cart-2')!.status).toBe('played')
    expect(getPlayedClipLog(stopped.session!)[0]).toMatchObject({ outcome: 'stopped' })
  })

  it('enforces the edit-mode gate in the engine for cart mutations', () => {
    const wall = createCartwallAudio(cartSession()) // edit mode off
    expect(assignCartAsset(wall, 'cart-1', 'asset-9')).toMatchObject({
      ok: false,
      error: 'edit-mode-required',
    })
    expect(setCartLevel(wall, 'cart-1', -6)).toMatchObject({
      ok: false,
      error: 'edit-mode-required',
    })
    const editing = setEditMode(wall, true)
    expect(assignCartAsset(editing, 'cart-1', 'asset-9').ok).toBe(true)
    expect(setCartLevel(editing, 'cart-1', -6).state.carts[0].gainDb).toBe(-6)
    // Live wheel trim is transport-class: allowed outside edit mode.
    expect(wheelCartFader(wall, 'cart-1', -100).state.carts[0].gainDb).toBe(1)
  })

  it('STOP ALL halts players and carts together and closes every open log entry', () => {
    const session = cartSession()
    const engine = new PlayerEngine({ sessionElapsedSec: () => session.elapsedSec })
    engine.loadClip(clip(1))
    engine.play(0)
    engine.advance(5)
    const wall = createCartwallAudio(session)
    const begun = toggleCart(wall, session, 'cart-1')

    const result = stopAllAudio(engine, begun.state, begun.session!)
    expect(result.stoppedPlayers).toBe(1)
    expect(engine.players[0].status).toBe('loaded')
    expect(engine.players[0].positionSec).toBe(engine.players[0].cueInSec)
    expect(result.state.carts.find((c) => c.cartId === 'cart-1')!.status).toBe('played')
    const log = getPlayedClipLog(result.session!)
    expect(log.length).toBeGreaterThanOrEqual(2)
    expect(openPlayedClips(result.session!)).toHaveLength(0)
    expect(log.every((e) => e.outcome === 'stopped')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Waveform geometry
// ---------------------------------------------------------------------------

describe('waveform geometry', () => {
  const peaks = computePeaksFromPcm(
    [new Float32Array(48000).map((_, i) => Math.sin((2 * Math.PI * i) / 100))],
    48000,
    'sha256:test',
  )

  it('maps click x to time within one pixel at multiple zooms', () => {
    const fit = fitView(60, 600) // 0.1 s/px
    expect(clickSeekTime({ durationSec: 60 }, fit, 300)).toBeCloseTo(30, 5)
    const zoomed = zoomAt(fit, 4, 300, 60) // 0.025 s/px around x=300
    expect(zoomed.secPerPixel).toBeCloseTo(0.025, 6)
    expect(xToTime(zoomed, 300)).toBeCloseTo(30, 5) // cursor time is stable
    const clicked = clickSeekTime({ durationSec: 60 }, zoomed, 340)
    expect(clicked).toBeCloseTo(31, 5)
    expect(Math.abs(clicked - 31)).toBeLessThanOrEqual(zoomed.secPerPixel)
    const zoomedOut = zoomAt(fit, 0.25, 0, 60)
    expect(clickSeekTime({ durationSec: 60 }, zoomedOut, 100)).toBeCloseTo(40, 5)
  })

  it('pans within the clip and renders per-pixel columns with cue dimming', () => {
    const zoomed = zoomAt(fitView(1, 500), 4, 0, 1) // viewport covers 0.25 s of the 1 s clip
    const view = panBy(zoomed, -100, 1, 500) // drag left = move forward
    expect(view.offsetSec).toBeCloseTo(0.05, 5)
    expect(panBy(zoomed, 100000, 1, 500).offsetSec).toBe(0) // never pans before the start
    const columns = visibleColumns(peaks, fitView(1, 500), 500, { cueInSec: 0.2, cueOutSec: 0.8 })
    expect(columns).toHaveLength(500)
    expect(columns[50].inCue).toBe(false) // ~0.1 s: before IN
    expect(columns[250].inCue).toBe(true) // ~0.5 s: inside
    expect(columns[450].inCue).toBe(false) // ~0.9 s: after OUT
    expect(cueMarkerX(fitView(1, 500), 0.2)).toBeCloseTo(100, 5)
  })
})

// ---------------------------------------------------------------------------
// Fuzzy clip search + clip browser store
// ---------------------------------------------------------------------------

describe('fuzzy clip search', () => {
  it('marks exact substrings as plain hits with ranges', () => {
    const match = fuzzyMatch('intro', 'Intro Music Bed')
    expect(match).not.toBeNull()
    expect(match!.nearHit).toBe(false)
    expect(match!.matchedRanges).toEqual([[0, 5]])
  })

  it('marks transpositions and missing letters as near hits', () => {
    expect(damerauLevenshtein('itnro', 'intro')).toBe(1) // transposition
    const transposed = fuzzyMatch('itnro', 'Intro Music Bed')
    expect(transposed).not.toBeNull()
    expect(transposed!.nearHit).toBe(true)
    const missing = fuzzyMatch('into', 'Intro Music Bed') // missing 'r'
    expect(missing).not.toBeNull()
    expect(missing!.nearHit).toBe(true)
    expect(missing!.matchedRanges[0][0]).toBe(0)
  })

  it('falls back to subsequence and returns null for true misses', () => {
    const sub = fuzzyMatch('im', 'Intro Music')
    expect(sub).not.toBeNull()
    expect(sub!.nearHit).toBe(true)
    expect(fuzzyMatch('zebra', 'Intro Music')).toBeNull()
  })

  it('scopes the browser by show/site/followed collections and invalidates on library events', () => {
    const items: ClipLibraryItem[] = [
      { assetId: 'a1', title: 'Show Intro', showId: 'show-1', collectionIds: [] },
      { assetId: 'a2', title: 'Other Show Theme', showId: 'show-2', collectionIds: [] },
      { assetId: 'a3', title: 'Shared Bed', collectionIds: ['col-1'] },
      { assetId: 'a4', title: 'Site Jingle', siteId: 'site-1', collectionIds: [] },
    ]
    const store = new ClipBrowserStore(items)
    const scoped = store.query({ showId: 'show-1', followedCollectionIds: ['col-1'] })
    expect(scoped.map((i) => i.assetId).sort()).toEqual(['a1', 'a3'])
    const found = store.search({ showId: 'show-1', followedCollectionIds: ['col-1'] }, 'intro')
    expect(found.map((r) => r.item.assetId)).toEqual(['a1'])

    let invalidated = 0
    const unsubscribe = store.subscribe(() => invalidated++)
    store.applyLibraryEvent({
      type: 'asset-updated',
      item: { assetId: 'a2', title: 'Show Intro Remix', showId: 'show-1', collectionIds: [] },
    })
    expect(invalidated).toBe(1)
    expect(
      store
        .query({ showId: 'show-1' })
        .map((i) => i.assetId)
        .sort(),
    ).toEqual(['a1', 'a2'])
    store.applyLibraryEvent({ type: 'asset-removed', assetId: 'a1' })
    expect(store.query({ showId: 'show-1' }).map((i) => i.assetId)).toEqual(['a2'])
    unsubscribe()

    const all = searchClips(items, '')
    expect(all).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// Server peaks
// ---------------------------------------------------------------------------

describe('server peaks', () => {
  it('reduces PCM to min/max pairs at the stated resolution', () => {
    const samples = new Float32Array(48000).map(
      (_, i) => Math.sin((2 * Math.PI * 440 * i) / 48000) * 0.5,
    )
    const peaks = computePeaksFromPcm([samples], 48000, 'sha256:x')
    expect(peaks.peaksPerSecond).toBe(PEAKS_PER_SECOND)
    expect(peaks.min).toHaveLength(100)
    expect(peaks.max).toHaveLength(100)
    for (let i = 0; i < 100; i++) {
      expect(peaks.min[i]).toBeLessThanOrEqual(peaks.max[i])
      expect(peaks.max[i]).toBeLessThanOrEqual(0.5)
      expect(peaks.min[i]).toBeGreaterThanOrEqual(-0.5)
    }
    expect(Math.max(...peaks.max)).toBeGreaterThan(0.49)
    // Deterministic (idempotent) reduction.
    expect(computePeaksFromPcm([samples], 48000, 'sha256:x')).toEqual(peaks)
  })

  it.skipIf(!hasFfmpeg)(
    'generates peaks from a WAV fixture through the real ffmpeg path, idempotently',
    async () => {
      const wav = makeWavBytes(2, 44100, 0.8)
      const peaks = await generatePeaksForBytes(wav)
      expect(peaks.durationSec).toBeCloseTo(2, 0)
      expect(peaks.min.length).toBeGreaterThanOrEqual(198)
      expect(peaks.min.length).toBeLessThanOrEqual(202)
      const loudest = Math.max(...peaks.max)
      expect(loudest).toBeGreaterThan(0.7)
      expect(loudest).toBeLessThanOrEqual(0.81)
      const rerun = await generatePeaksForBytes(wav)
      expect(rerun).toEqual(peaks) // idempotent re-run
    },
  )

  it.skipIf(!hasFfmpeg)(
    'stores peaks on the asset and skips regeneration for unchanged bytes',
    async () => {
      const wav = makeWavBytes(1, 44100, 0.5)
      const checksum = `sha256:${createHash('sha256').update(wav).digest('hex')}`
      const asset: Record<string, unknown> = {
        id: 'asset-1',
        kind: 'audio',
        checksum,
        storageLocation: 'clips/intro.wav',
      }
      let updates = 0
      let gets = 0
      const fakePayload = {
        findByID: async () => asset,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates++
          Object.assign(asset, data)
          return asset
        },
      }
      const fakeStorage = {
        get: async () => {
          gets++
          return new Uint8Array(wav)
        },
        put: async () => undefined,
      }
      const first = await generatePeaksForAsset(
        fakePayload as never,
        {} as never,
        'asset-1',
        fakeStorage as never,
      )
      expect(first.sourceChecksum).toBe(checksum)
      expect(updates).toBe(1)
      const second = await generatePeaksForAsset(
        fakePayload as never,
        {} as never,
        'asset-1',
        fakeStorage as never,
      )
      expect(second).toEqual(first)
      expect(updates).toBe(1) // no rewrite
      expect(gets).toBe(1) // no re-decode
    },
  )
})

// ---------------------------------------------------------------------------
// Action dispatcher (POD-15 wiring point)
// ---------------------------------------------------------------------------

describe('dispatchPlayerAction', () => {
  it('routes transport, cue, fader, PFL and stop-all actions into the engine', () => {
    const engine = new PlayerEngine()
    expect(dispatchPlayerAction(engine, 'load', { clip: clip(1) })).toEqual({
      ok: true,
      playerIndex: 0,
    })
    expect(dispatchPlayerAction(engine, 'load', { clip: clip(1) }).reason).toBe('already-loaded')
    expect(dispatchPlayerAction(engine, 'set-cue-in', { playerIndex: 0, sec: 2.03 }).ok).toBe(true)
    expect(engine.players[0].cueInSec).toBeCloseTo(2.0, 5)
    expect(dispatchPlayerAction(engine, 'set-pfl', { playerIndex: 0, pfl: true }).ok).toBe(true)
    expect(engine.busAssignment(0)).toBe('cue')
    expect(
      dispatchPlayerAction(engine, 'wheel-fader', { playerIndex: 0, wheelDeltaY: -1 }).ok,
    ).toBe(true)
    expect(engine.players[0].gainDb).toBe(1)
    expect(dispatchPlayerAction(engine, 'play', { playerIndex: 0 }).ok).toBe(true)
    expect(dispatchPlayerAction(engine, 'stop-all', {}).ok).toBe(true)
    expect(engine.players[0].status).toBe('loaded')
    expect(dispatchPlayerAction(engine, 'bogus' as never, {})).toMatchObject({
      ok: false,
      reason: 'unknown-action',
    })
  })
})
