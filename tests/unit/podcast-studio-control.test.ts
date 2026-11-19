/**
 * POD-15 (POD-REQ-32/33) — control surfaces: action registry + bus,
 * keyboard map (chords, focus guard, conflicts, remapping,
 * per-participant persistence), Web MIDI core (parsing, learn,
 * scaling, routing, persistence/import/export, disconnect non-event),
 * and the keyboard-only show run at the action level.
 * Real MIDI hardware and real-browser keyboard journeys are
 * UNVERIFIED — this suite proves the logic layer they wire to.
 */
import { describe, expect, it } from 'vitest'

import { MemoryPrefsStorage } from '../../src/modules/podcast-studio/capture/devices'
import {
  createStudioActionHandlers,
  getStudioAction,
  listStudioActions,
  StudioActionBus,
  STUDIO_ACTIONS,
} from '../../src/modules/podcast-studio/control/action-map'
import {
  attemptRemap,
  chordFromKeyboardEvent,
  detectConflicts,
  dispatchKeyboardEvent,
  emptyKeyboardOverrides,
  guardDecision,
  KeyboardPrefsStore,
  NEUTRAL_FOCUS,
  resolveBindings,
  type FocusContext,
} from '../../src/modules/podcast-studio/control/keyboard-map'
import {
  exportMidiMap,
  importMidiMap,
  midiCapability,
  midiControlId,
  MidiDeviceTracker,
  MidiLearnController,
  MidiMapStore,
  parseMidiMessage,
  routeMidiMessage,
  scaleCcToDb,
  type MidiMap,
} from '../../src/modules/podcast-studio/control/midi'
import { defaultMixerState, type MixerState } from '../../src/modules/podcast-studio/mixer/state'
import { PlayerEngine } from '../../src/modules/podcast-studio/players/player-engine'
import {
  createCartwallAudio,
  type CartwallAudioState,
} from '../../src/modules/podcast-studio/players/cartwall-audio'
import { getPlayedClipLog } from '../../src/modules/podcast-studio/players/played-log'
import { getRecordingState } from '../../src/modules/podcast-studio/recording/recording-session'
import {
  addClip,
  addRundownItem,
  createSession,
  type StudioSessionDoc,
} from '../../src/modules/podcast-studio/session-engine'

// ---------------------------------------------------------------------------
// Harness: a full desk wired to the real cores
// ---------------------------------------------------------------------------

function makeDesk() {
  let session: StudioSessionDoc = createSession({ showId: 'show-1', showTitle: 'Control Show' })
  session = addRundownItem(session, {
    title: 'Intro segment',
    type: 'segment',
    plannedSec: 300,
  }).session
  session = addClip(session, 'bank-main', {
    id: 'cart-1',
    title: 'Intro sting',
    cueOutSec: 10,
  }).session
  session = addClip(session, 'bank-main', { id: 'cart-2', title: 'Ad read', cueOutSec: 30 }).session
  let wall: CartwallAudioState = createCartwallAudio(session)
  let mixer: MixerState = defaultMixerState(['guest-1'])
  let selection = 0
  const engine = new PlayerEngine({ sessionElapsedSec: () => session.elapsedSec })
  engine.loadClip({ assetId: 'asset-1', title: 'Theme', durationSec: 60 }, 0)
  const bus = new StudioActionBus()
  const registered = bus.registerAll(
    createStudioActionHandlers({
      session: {
        get: () => session,
        set: (doc) => {
          session = doc
        },
      },
      playerEngine: engine,
      cartwall: {
        get: () => wall,
        set: (state) => {
          wall = state
        },
      },
      mixer: {
        get: () => mixer,
        set: (state) => {
          mixer = state
        },
      },
      selection: {
        get: () => selection,
        set: (index) => {
          selection = index
        },
      },
    }),
  )
  return {
    bus,
    registered,
    engine,
    get session() {
      return session
    },
    get wall() {
      return wall
    },
    get mixer() {
      return mixer
    },
    get selection() {
      return selection
    },
  }
}

const key = (
  k: string,
  code: string,
  mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {},
) => ({
  key: k,
  code,
  ...mods,
})

// ---------------------------------------------------------------------------
// Registry + bus
// ---------------------------------------------------------------------------

describe('action registry', () => {
  it('covers every studio surface with unique, titled actions', () => {
    const ids = STUDIO_ACTIONS.map((action) => action.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const action of STUDIO_ACTIONS) expect(action.title.length).toBeGreaterThan(3)
    for (let n = 1; n <= 8; n++) {
      for (const verb of ['play', 'pause', 'stop', 'pfl', 'fader'])
        expect(getStudioAction(`player.${n}.${verb}`)).not.toBeNull()
      expect(getStudioAction(`cart.${n}.fire`)).not.toBeNull()
      expect(getStudioAction(`cart.${n}.stop`)).not.toBeNull()
    }
    for (const id of [
      'stop-all',
      'record.start',
      'record.stop',
      'marker.drop',
      'talkback.hold',
      'editor.shuttle.reverse',
      'editor.shuttle.forward',
      'editor.split',
      'editor.mark-in',
      'editor.mark-out',
    ]) {
      expect(getStudioAction(id)).not.toBeNull()
    }
    expect(listStudioActions({ context: 'editor' }).length).toBeGreaterThanOrEqual(17)
    expect(getStudioAction('nope.nope')).toBeNull()
  })

  it('ships conflict-free defaults', () => {
    expect(detectConflicts(resolveBindings(null))).toEqual([])
  })

  it('bus refuses unknown actions and unregistered handlers by name', () => {
    const bus = new StudioActionBus()
    expect(bus.dispatch('bogus.action', { source: 'script' })).toMatchObject({
      ok: false,
      reason: 'unknown-action',
    })
    expect(bus.dispatch('marker.drop', { source: 'script' })).toMatchObject({
      ok: false,
      reason: 'no-handler',
    })
    expect(bus.register('bogus.action', () => {})).toMatchObject({
      ok: false,
      reason: 'unknown-action',
    })
  })

  it('makeDesk registers every core handler without error', () => {
    expect(makeDesk().registered.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Dispatch reaches the right cores
// ---------------------------------------------------------------------------

describe('action dispatch reaches the cores', () => {
  it('cart fire opens a played-log entry; cart stop closes it stopped', () => {
    const desk = makeDesk()
    expect(desk.bus.dispatch('cart.1.fire', { source: 'script' }).ok).toBe(true)
    expect(desk.wall.carts[0].status).toBe('playing')
    let log = getPlayedClipLog(desk.session)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({
      source: 'cart',
      clipId: 'cart-1',
      outcome: 'playing',
      endedAtSessionSec: null,
    })
    expect(desk.bus.dispatch('cart.1.fire', { source: 'script' })).toMatchObject({
      ok: false,
      reason: 'already-playing',
    })
    expect(desk.bus.dispatch('cart.1.stop', { source: 'script' }).ok).toBe(true)
    log = getPlayedClipLog(desk.session)
    expect(log[0].outcome).toBe('stopped')
    expect(desk.session.cartwall.banks[0].clips[0].state).toBe('played')
  })

  it('player play dispatches through the POD-08 engine; STOP ALL halts players + carts and lands in the session log', () => {
    const desk = makeDesk()
    expect(desk.bus.dispatch('player.1.play', { source: 'script' }).ok).toBe(true)
    expect(desk.engine.players[0].status).toBe('playing')
    desk.bus.dispatch('cart.2.fire', { source: 'script' })
    expect(desk.bus.dispatch('stop-all', { source: 'script' }).ok).toBe(true)
    expect(desk.engine.players[0].status).not.toBe('playing')
    expect(desk.wall.carts.every((cart) => cart.status !== 'playing')).toBe(true)
    expect(
      desk.session.cartwall.banks[0].clips.every(
        (clip) => clip.state === 'idle' || clip.state === 'played',
      ),
    ).toBe(true)
    expect(desk.session.log.some((entry) => entry.type === 'stop-all')).toBe(true)
    expect(getPlayedClipLog(desk.session).every((entry) => entry.outcome !== 'playing')).toBe(true)
  })

  it('record start/stop drive the POD-09 recording state; marker lands in session + recording markers', () => {
    const desk = makeDesk()
    expect(desk.bus.dispatch('record.start', { source: 'script' }).ok).toBe(true)
    expect(getRecordingState(desk.session)?.status).toBe('recording')
    expect(desk.bus.dispatch('marker.drop', { source: 'script' }).ok).toBe(true)
    expect(desk.session.markers).toHaveLength(1)
    expect(getRecordingState(desk.session)?.markers[0].name).toBe('Marker 1')
    expect(desk.bus.dispatch('record.stop', { source: 'script' }).ok).toBe(true)
    expect(getRecordingState(desk.session)?.status).toBe('stopped')
    expect(desk.bus.dispatch('record.stop', { source: 'script' })).toMatchObject({
      ok: false,
      reason: 'not-recording',
    })
  })

  it('marker without recording still lands in the session marker list', () => {
    const desk = makeDesk()
    desk.bus.dispatch('marker.drop', { source: 'script' })
    expect(desk.session.markers?.[0]).toMatchObject({ title: 'Marker 1', type: 'marker' })
  })

  it('mixer mute toggles and talkback hold engage/release through the bus', () => {
    const desk = makeDesk()
    desk.bus.dispatch('mixer.host.mute', { source: 'script' })
    expect(desk.mixer.strips.find((s) => s.id === 'host')?.muted).toBe(true)
    desk.bus.dispatch('talkback.hold', { source: 'script', phase: 'down' })
    expect(desk.mixer.talkbackMuted).toBe(false)
    desk.bus.dispatch('talkback.hold', { source: 'script', phase: 'up' })
    expect(desk.mixer.talkbackMuted).toBe(true)
  })

  it('rundown start/complete run the selected segment through the POD-05 engine', () => {
    const desk = makeDesk()
    expect(desk.bus.dispatch('rundown.start', { source: 'script' }).ok).toBe(true)
    expect(desk.session.rundown[0].status).toBe('playing')
    expect(desk.session.chapters).toHaveLength(1)
    expect(desk.bus.dispatch('rundown.complete', { source: 'script' }).ok).toBe(true)
    expect(desk.session.rundown[0].status).toBe('done')
  })
})

// ---------------------------------------------------------------------------
// Keyboard: chords, focus guard, dispatch
// ---------------------------------------------------------------------------

describe('keyboard map', () => {
  it('normalizes chords from codes and modifiers', () => {
    expect(chordFromKeyboardEvent(key('r', 'KeyR'))).toBe('KeyR')
    expect(chordFromKeyboardEvent(key('R', 'KeyR', { shiftKey: true }))).toBe('Shift+KeyR')
    expect(chordFromKeyboardEvent(key('1', 'Digit1', { altKey: true }))).toBe('Alt+Digit1')
    expect(chordFromKeyboardEvent(key(' ', 'Space'))).toBe('Space')
    expect(chordFromKeyboardEvent(key('Escape', 'Escape', { shiftKey: true }))).toBe('Shift+Escape')
    expect(chordFromKeyboardEvent(key('Shift', 'ShiftLeft', { shiftKey: true }))).toBeNull()
    expect(chordFromKeyboardEvent({ key: 'ArrowDown', code: 'ArrowDown' })).toBe('ArrowDown')
  })

  it('focus guard matrix: typing/modal/interactive suppress, STOP ALL always fires', () => {
    const record = getStudioAction('record.start')!
    const stopAll = getStudioAction('stop-all')!
    const typing: FocusContext = { ...NEUTRAL_FOCUS, isTextInput: true }
    const editable: FocusContext = { ...NEUTRAL_FOCUS, isContentEditable: true }
    const modal: FocusContext = { ...NEUTRAL_FOCUS, modalOpen: true }
    const button: FocusContext = { ...NEUTRAL_FOCUS, isInteractiveControl: true }
    expect(guardDecision(record, NEUTRAL_FOCUS)).toEqual({ allowed: true })
    expect(guardDecision(record, typing)).toMatchObject({ allowed: false, reason: 'typing' })
    expect(guardDecision(record, editable)).toMatchObject({ allowed: false, reason: 'typing' })
    expect(guardDecision(record, modal)).toMatchObject({ allowed: false, reason: 'modal-open' })
    expect(guardDecision(record, button)).toMatchObject({
      allowed: false,
      reason: 'interactive-control',
    })
    for (const focus of [typing, editable, modal, button])
      expect(guardDecision(stopAll, focus).allowed).toBe(true)
  })

  it('keyboard dispatch respects the guard: typing suppresses record, STOP ALL still lands', () => {
    const desk = makeDesk()
    const bindings = resolveBindings(null)
    const typing: FocusContext = { ...NEUTRAL_FOCUS, isTextarea: true, modalOpen: true }
    const suppressed = dispatchKeyboardEvent(desk.bus, bindings, key('r', 'KeyR'), typing, {
      activeContexts: ['studio', 'global'],
      phase: 'down',
    })
    expect(suppressed).toMatchObject({ ok: false, reason: 'typing' })
    expect(getRecordingState(desk.session)).toBeNull()
    desk.bus.dispatch('record.start', { source: 'script' })
    desk.bus.dispatch('cart.1.fire', { source: 'script' })
    const stopped = dispatchKeyboardEvent(
      desk.bus,
      bindings,
      key('Escape', 'Escape', { shiftKey: true }),
      typing,
      { activeContexts: ['studio', 'global'], phase: 'down' },
    )
    expect(stopped.ok).toBe(true)
    expect(desk.wall.carts[0].status).not.toBe('playing')
  })

  it('talkback hold follows keydown/keyup phases through the keyboard path', () => {
    const desk = makeDesk()
    const bindings = resolveBindings(null)
    dispatchKeyboardEvent(desk.bus, bindings, key('b', 'KeyB'), NEUTRAL_FOCUS, {
      activeContexts: ['studio'],
      phase: 'down',
    })
    expect(desk.mixer.talkbackMuted).toBe(false)
    dispatchKeyboardEvent(desk.bus, bindings, key('b', 'KeyB'), NEUTRAL_FOCUS, {
      activeContexts: ['studio'],
      phase: 'up',
    })
    expect(desk.mixer.talkbackMuted).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Remapping, conflicts, per-participant persistence
// ---------------------------------------------------------------------------

describe('remapping + conflicts + persistence', () => {
  it('conflict: binding a second action to an owned chord is refused and the first binding is kept', () => {
    const store = new KeyboardPrefsStore(new MemoryPrefsStorage())
    const result = store.remap('alice', 'marker.drop', 'Digit1') // player.1.play owns Digit1 in studio
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('binding-conflict')
      expect(result.conflict?.actionIds).toContain('player.1.play')
      expect(result.conflict?.actionIds).toContain('marker.drop')
    }
    // Nothing was written: marker.drop still resolves to its default.
    const bindings = resolveBindings(store.load('alice'))
    expect(bindings.find((b) => b.actionId === 'marker.drop')?.chord).toBe('KeyM')
    expect(bindings.find((b) => b.actionId === 'player.1.play')?.chord).toBe('Digit1')
  })

  it('detectConflicts surfaces a hand-built duplicate instead of hiding it', () => {
    const overrides = {
      ...emptyKeyboardOverrides('alice'),
      overrides: { 'marker.drop': ['Digit1'] },
    }
    const conflicts = detectConflicts(resolveBindings(overrides))
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].chord).toBe('Digit1')
    expect(conflicts[0].message).toContain('player.1.play')
  })

  it('same chord in non-overlapping contexts is NOT a conflict (editor X vs studio)', () => {
    const result = attemptRemap(emptyKeyboardOverrides('alice'), 'record.start', 'KeyX')
    expect(result.ok).toBe(true) // KeyX is editor.cut-range — different context
  })

  it('per-participant isolation: one participant’s remap never leaks to another, and survives a reload', () => {
    const storage = new MemoryPrefsStorage()
    const store = new KeyboardPrefsStore(storage)
    expect(store.remap('alice', 'marker.drop', 'F8').ok).toBe(true)
    expect(
      resolveBindings(store.load('alice')).find((b) => b.actionId === 'marker.drop')?.chord,
    ).toBe('F8')
    expect(
      resolveBindings(store.load('bob')).find((b) => b.actionId === 'marker.drop')?.chord,
    ).toBe('KeyM')
    const reloaded = new KeyboardPrefsStore(storage)
    expect(
      resolveBindings(reloaded.load('alice')).find((b) => b.actionId === 'marker.drop')?.source,
    ).toBe('override')
    reloaded.resetAll('alice')
    expect(
      resolveBindings(reloaded.load('alice')).find((b) => b.actionId === 'marker.drop')?.chord,
    ).toBe('KeyM')
  })
})

// ---------------------------------------------------------------------------
// Keyboard-only show run (action level, scripted sequence)
// ---------------------------------------------------------------------------

describe('keyboard-only show run', () => {
  it('prepare → record → mark → fire cart → stop all → stop, all via chords', () => {
    const desk = makeDesk()
    const bindings = resolveBindings(null)
    const press = (event: ReturnType<typeof key>) =>
      dispatchKeyboardEvent(desk.bus, bindings, event, NEUTRAL_FOCUS, {
        activeContexts: ['studio', 'global'],
        phase: 'down',
      })

    expect(press(key('P', 'KeyP', { shiftKey: true })).ok).toBe(true) // prepare
    expect(desk.session.state).toBe('ready')
    expect(press(key('r', 'KeyR')).ok).toBe(true) // record
    expect(getRecordingState(desk.session)?.status).toBe('recording')
    expect(press(key('m', 'KeyM')).ok).toBe(true) // mark
    expect(desk.session.markers).toHaveLength(1)
    expect(press(key('q', 'KeyQ')).ok).toBe(true) // fire cart 1
    expect(getPlayedClipLog(desk.session)).toHaveLength(1)
    expect(getPlayedClipLog(desk.session)[0].outcome).toBe('playing')
    expect(press(key('Escape', 'Escape', { shiftKey: true })).ok).toBe(true) // STOP ALL
    expect(getPlayedClipLog(desk.session)[0].outcome).toBe('stopped')
    expect(press(key('R', 'KeyR', { shiftKey: true })).ok).toBe(true) // stop recording
    expect(getRecordingState(desk.session)?.status).toBe('stopped')
  })
})

// ---------------------------------------------------------------------------
// MIDI: parsing, scaling, learn, routing, persistence, disconnect
// ---------------------------------------------------------------------------

describe('MIDI core', () => {
  it('parses note on/off and CC with channels from raw bytes', () => {
    const noteOn = parseMidiMessage([0x90, 60, 100])
    expect(noteOn).toMatchObject({ type: 'note-on', channel: 1, data1: 60, data2: 100 })
    expect(midiControlId(noteOn)).toBe('note:ch1:60')
    expect(parseMidiMessage([0x99, 38, 90])).toMatchObject({
      type: 'note-on',
      channel: 10,
      data1: 38,
    })
    expect(parseMidiMessage([0x90, 60, 0]).type).toBe('note-off') // velocity-0 convention
    expect(parseMidiMessage([0x83, 60, 64])).toMatchObject({ type: 'note-off', channel: 4 })
    const cc = parseMidiMessage(new Uint8Array([0xb2, 7, 127]))
    expect(cc).toMatchObject({ type: 'control-change', channel: 3, data1: 7, data2: 127 })
    expect(midiControlId(cc)).toBe('cc:ch3:7')
    expect(parseMidiMessage([0xe0, 0, 64]).type).toBe('unsupported')
    expect(() => parseMidiMessage([])).not.toThrow()
    expect(parseMidiMessage([]).type).toBe('unsupported')
  })

  it('scales CC 0–127 across the fader dB range exactly at the ends and centre', () => {
    expect(scaleCcToDb(0)).toBe(-60)
    expect(scaleCcToDb(127)).toBe(6)
    expect(scaleCcToDb(64)).toBeCloseTo(-60 + (64 / 127) * 66, 5)
    expect(scaleCcToDb(200)).toBe(6) // clamped
  })

  it('learn flow: arming an action binds the next CC; the fader then follows the CC', () => {
    const desk = makeDesk()
    const learn = new MidiLearnController()
    let map: MidiMap = { version: 1, bindings: [], updatedAt: '' }
    expect(learn.arm('mixer.host.fader').ok).toBe(true)
    const learned = learn.handleMessage(map, parseMidiMessage([0xb0, 7, 100]))
    expect(learned.ok).toBe(true)
    if (!learned.ok) throw new Error('learn failed')
    map = learned.map
    expect(learned.binding).toMatchObject({
      controlId: 'cc:ch1:7',
      actionId: 'mixer.host.fader',
      mode: 'absolute',
    })
    expect(learn.learnState.phase).toBe('idle')

    const route = (value: number) => {
      const routed = routeMidiMessage(map, parseMidiMessage([0xb0, 7, value]))
      if (!routed) throw new Error('unrouted')
      return desk.bus.dispatch(routed.actionId, routed.payload)
    }
    expect(route(127).ok).toBe(true)
    expect(desk.mixer.strips.find((s) => s.id === 'host')?.gainDb).toBe(6)
    route(0)
    expect(desk.mixer.strips.find((s) => s.id === 'host')?.gainDb).toBe(-60)
    route(64)
    expect(desk.mixer.strips.find((s) => s.id === 'host')?.gainDb).toBeCloseTo(-26.74, 1)
  })

  it('learn refuses unknown actions, ignores unsupported messages without consuming the arm, and names replacements', () => {
    const learn = new MidiLearnController()
    expect(learn.arm('bogus.action')).toMatchObject({ ok: false, reason: 'unknown-action' })
    learn.arm('record.start')
    let map: MidiMap = {
      version: 1,
      bindings: [{ controlId: 'note:ch1:60', actionId: 'marker.drop', mode: 'toggle' }],
      updatedAt: '',
    }
    expect(learn.handleMessage(map, parseMidiMessage([0xe0, 0, 0]))).toMatchObject({
      ok: false,
      reason: 'unsupported-message',
    })
    expect(learn.learnState.phase).toBe('armed')
    const result = learn.handleMessage(map, parseMidiMessage([0x90, 60, 100]))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.replacedActionId).toBe('marker.drop')
      map = result.map
    }
    expect(map.bindings).toHaveLength(1)
    expect(map.bindings[0].actionId).toBe('record.start')
    // Toggle routing: note-on fires, note-off does not.
    expect(routeMidiMessage(map, parseMidiMessage([0x90, 60, 100]))?.actionId).toBe('record.start')
    expect(routeMidiMessage(map, parseMidiMessage([0x80, 60, 64]))).toBeNull()
  })

  it('persistence round-trip: store reload + export → import yields an identical map', () => {
    const storage = new MemoryPrefsStorage()
    const store = new MidiMapStore(storage)
    const map: MidiMap = {
      version: 1,
      bindings: [
        { controlId: 'cc:ch1:7', actionId: 'mixer.host.fader', mode: 'absolute' },
        { controlId: 'note:ch1:60', actionId: 'record.start', mode: 'toggle' },
        { controlId: 'note:ch2:36', actionId: 'cart.1.fire', mode: 'toggle' },
      ],
      updatedAt: '',
    }
    store.save(map)
    expect(new MidiMapStore(storage).load().bindings).toEqual(map.bindings)
    const imported = importMidiMap(exportMidiMap(map))
    expect(imported.ok).toBe(true)
    if (imported.ok) expect(imported.map.bindings).toEqual(map.bindings)
    expect(importMidiMap('not json')).toMatchObject({ ok: false, error: 'invalid-json' })
    expect(
      importMidiMap(JSON.stringify({ kind: 'other', version: 1, bindings: [] })),
    ).toMatchObject({ ok: false, error: 'wrong-kind' })
    expect(
      importMidiMap(
        exportMidiMap({
          version: 1,
          bindings: [{ controlId: 'cc:ch1:7', actionId: 'bogus.action', mode: 'absolute' }],
          updatedAt: '',
        }),
      ),
    ).toMatchObject({ ok: false, error: 'unknown-action:bogus.action' })
  })

  it('disconnect is a non-event: mid-stream unplug drops messages, never throws, reconnect resumes', () => {
    const tracker = new MidiDeviceTracker()
    const map: MidiMap = {
      version: 1,
      bindings: [{ controlId: 'note:ch1:60', actionId: 'stop-all', mode: 'toggle' }],
      updatedAt: '',
    }
    tracker.connect('dev-1', 'nanoKONTROL-class')
    expect(tracker.routeFromDevice('dev-1', map, [0x90, 60, 100])?.actionId).toBe('stop-all')
    expect(tracker.disconnect('dev-1')).toEqual({ ok: true })
    expect(tracker.routeFromDevice('dev-1', map, [0x90, 60, 100])).toBeNull()
    expect(() => tracker.disconnect('never-seen')).not.toThrow()
    expect(tracker.routeFromDevice('never-seen', map, [0x90, 60, 100])).toBeNull()
    tracker.connect('dev-1', 'nanoKONTROL-class')
    expect(tracker.routeFromDevice('dev-1', map, [0x90, 60, 100])?.actionId).toBe('stop-all')
  })

  it('capability detection states the Safari/Firefox reality honestly', () => {
    expect(midiCapability({}).supported).toBe(false)
    expect(midiCapability({}).reason).toContain('Web MIDI is not available')
    expect(midiCapability(null).supported).toBe(false)
    expect(midiCapability({ requestMIDIAccess: () => Promise.resolve({}) }).supported).toBe(true)
  })

  it('momentary MIDI binding drives talkback down/up phases', () => {
    const desk = makeDesk()
    const map: MidiMap = {
      version: 1,
      bindings: [{ controlId: 'note:ch1:61', actionId: 'talkback.hold', mode: 'momentary' }],
      updatedAt: '',
    }
    const down = routeMidiMessage(map, parseMidiMessage([0x90, 61, 100]))
    desk.bus.dispatch(down!.actionId, down!.payload)
    expect(desk.mixer.talkbackMuted).toBe(false)
    const up = routeMidiMessage(map, parseMidiMessage([0x80, 61, 0]))
    desk.bus.dispatch(up!.actionId, up!.payload)
    expect(desk.mixer.talkbackMuted).toBe(true)
  })
})
