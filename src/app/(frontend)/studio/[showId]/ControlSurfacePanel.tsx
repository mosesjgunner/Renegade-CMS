'use client'

/**
 * POD-15 (POD-REQ-32/33) — Control surface settings panel: the mapping
 * UI for the studio action registry. Lists every action with its
 * current keyboard binding (remap with conflict refusal, unbind,
 * reset), its MIDI binding (learn mode, per-machine persisted map,
 * versioned import/export), the live conflicts list, and the honest
 * Web MIDI capability banner (Safari/Firefox: no Web MIDI — keyboard
 * remains the full-control baseline).
 *
 * All logic lives in the pure cores
 * (src/modules/podcast-studio/control/); this panel is state + wiring.
 * Real-browser keyboard journeys and real MIDI devices are UNVERIFIED
 * (POD-15 handoff).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { STUDIO_ACTIONS, type StudioActionBus } from '@/modules/podcast-studio/control/action-map'
import {
  chordFromKeyboardEvent,
  chordLabel,
  detectConflicts,
  KeyboardPrefsStore,
  resolveBindings,
  type KeyboardOverrides,
} from '@/modules/podcast-studio/control/keyboard-map'
import { createLocalStoragePrefsStorage } from '@/modules/podcast-studio/control/keyboard-browser'
import {
  exportMidiMap,
  importMidiMap,
  midiCapability,
  MidiLearnController,
  MidiMapStore,
  parseMidiMessage,
  type MidiMap,
} from '@/modules/podcast-studio/control/midi'
import {
  connectMidiToBus,
  type MidiBrowserHandle,
} from '@/modules/podcast-studio/control/midi-browser'

export function ControlSurfacePanel({
  participantId,
  bus,
  keyboardOverrides,
  onKeyboardOverridesChange,
  talkbackMuted,
}: {
  participantId: string
  bus: StudioActionBus
  keyboardOverrides: KeyboardOverrides
  onKeyboardOverridesChange: (overrides: KeyboardOverrides) => void
  talkbackMuted: boolean
}) {
  const [storage] = useState(() => createLocalStoragePrefsStorage())
  const keyboardStore = useMemo(() => new KeyboardPrefsStore(storage), [storage])
  const midiStore = useMemo(() => new MidiMapStore(storage), [storage])
  const [midiMap, setMidiMap] = useState<MidiMap>(() => midiStore.load())
  const [learn] = useState(() => new MidiLearnController())
  const [learnActionId, setLearnActionId] = useState<string | null>(null)
  const [capturingActionId, setCapturingActionId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [midiHandle, setMidiHandle] = useState<MidiBrowserHandle | null>(null)
  const [capability] = useState(() =>
    midiCapability(
      typeof navigator !== 'undefined'
        ? (navigator as unknown as { requestMIDIAccess?: unknown })
        : null,
    ),
  )
  const midiMapRef = useRef(midiMap)
  useEffect(() => {
    midiMapRef.current = midiMap
  }, [midiMap])

  const bindings = useMemo(() => resolveBindings(keyboardOverrides), [keyboardOverrides])
  const conflicts = useMemo(() => detectConflicts(bindings), [bindings])
  const chordFor = useCallback(
    (actionId: string) =>
      bindings.filter((b) => b.actionId === actionId).map((b) => chordLabel(b.chord)),
    [bindings],
  )
  const midiFor = useCallback(
    (actionId: string) => midiMap.bindings.filter((b) => b.actionId === actionId),
    [midiMap],
  )

  // Keyboard remap capture: the next keydown becomes the chord.
  useEffect(() => {
    if (!capturingActionId) return
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const chord = chordFromKeyboardEvent(event)
      setCapturingActionId(null)
      if (!chord) return
      const result = keyboardStore.remap(participantId, capturingActionId, chord)
      if (!result.ok) {
        setMessage(`Remap refused: ${result.message}`)
        return
      }
      onKeyboardOverridesChange(result.overrides)
      setMessage(`Bound ${capturingActionId} to ${chordLabel(chord)}.`)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturingActionId, keyboardStore, participantId, onKeyboardOverridesChange])

  const connectMidi = useCallback(async () => {
    const handle = await connectMidiToBus({
      bus,
      getMap: () => midiMapRef.current,
      onLearnMessage: (bytes) => {
        if (learn.learnState.phase !== 'armed') return false
        const result = learn.handleMessage(midiMapRef.current, parseMidiMessage(bytes))
        if (result.ok) {
          const saved = midiStore.save(result.map)
          setMidiMap(saved)
          setLearnActionId(null)
          setMessage(
            `Learned ${result.binding.controlId} → ${result.binding.actionId}${result.replacedActionId ? ` (replaced ${result.replacedActionId})` : ''}.`,
          )
          return true
        }
        return result.reason === 'unsupported-message' ? true : false
      },
      onDevicesChanged: () =>
        setMessage(
          'MIDI devices changed (connect/disconnect is a non-event — nothing audible changes).',
        ),
    })
    setMidiHandle(handle)
    setMessage(
      handle.capability.supported
        ? 'MIDI connected.'
        : (handle.capability.reason ?? 'MIDI unavailable.'),
    )
  }, [bus, learn, midiStore])

  useEffect(() => () => midiHandle?.dispose(), [midiHandle])

  const exportMap = () => {
    const blob = new Blob([exportMidiMap(midiMap)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'renegade-midi-map.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importMap = (file: File) => {
    void file.text().then((text) => {
      const result = importMidiMap(text)
      if (!result.ok) return setMessage(`MIDI map import refused: ${result.error}`)
      setMidiMap(midiStore.save(result.map))
      setMessage('MIDI map imported.')
    })
  }

  const categories = useMemo(
    () => [...new Set(STUDIO_ACTIONS.map((action) => action.category))],
    [],
  )

  return (
    <section
      className="surface-card p-5 space-y-3"
      aria-label="Control surfaces — keyboard and MIDI mapping"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">Control surfaces — keyboard &amp; MIDI</h2>
        <span className="text-xs text-stone-500">
          Participant: {participantId} · Talkback {talkbackMuted ? 'muted' : 'LIVE (guests only)'}
        </span>
      </div>
      {!capability.supported ? (
        <p role="note" className="text-sm border border-amber-500 rounded p-2">
          {capability.reason} MIDI mapping below is stored per machine and will work in a Web MIDI
          browser (Chrome/Edge) with the same map.
        </p>
      ) : (
        <p className="text-sm">
          Web MIDI is available in this browser.{' '}
          <button type="button" className="btn btn-secondary" onClick={() => void connectMidi()}>
            {midiHandle ? 'Reconnect MIDI' : 'Connect MIDI'}
          </button>{' '}
          <span className="text-xs text-stone-500">
            Real-device behaviour UNVERIFIED in this build.
          </span>
        </p>
      )}
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
      {conflicts.length > 0 ? (
        <div className="border border-red-500 rounded p-2 text-sm" aria-label="Binding conflicts">
          <strong>Binding conflicts (first binding wins — remap one):</strong>
          <ul>
            {conflicts.map((conflict) => (
              <li key={`${conflict.chord}-${conflict.actionIds.join('|')}`}>{conflict.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            keyboardStore.resetAll(participantId)
            onKeyboardOverridesChange(keyboardStore.load(participantId))
            setMessage('Keyboard map reset to defaults.')
          }}
        >
          Reset keyboard map
        </button>
        <button type="button" className="btn btn-secondary" onClick={exportMap}>
          Export MIDI map (JSON)
        </button>
        <label className="btn btn-secondary">
          Import MIDI map
          <input
            type="file"
            accept="application/json"
            className="hidden"
            aria-label="Import MIDI map file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) importMap(file)
              event.target.value = ''
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            midiStore.clear()
            setMidiMap(midiStore.load())
            setMessage('MIDI map cleared.')
          }}
        >
          Clear MIDI map
        </button>
      </div>
      {categories.map((category) => (
        <div key={category} className="space-y-1">
          <h3 className="font-semibold text-sm">{category}</h3>
          <ul className="space-y-1 text-sm">
            {STUDIO_ACTIONS.filter((action) => action.category === category).map((action) => {
              const chords = chordFor(action.id)
              const midi = midiFor(action.id)
              return (
                <li
                  key={action.id}
                  className="flex flex-wrap gap-2 items-center border-b border-stone-200 dark:border-stone-800 py-1"
                >
                  <span className="flex-1 min-w-52">
                    {action.title}{' '}
                    <span className="text-xs text-stone-500">({action.context})</span>
                  </span>
                  <span className="text-xs">
                    {chords.length > 0 ? chords.join(', ') : 'unbound'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setCapturingActionId(action.id)}
                  >
                    {capturingActionId === action.id ? 'Press a key…' : 'Remap'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      onKeyboardOverridesChange(keyboardStore.resetAction(participantId, action.id))
                    }
                  >
                    Reset key
                  </button>
                  <span className="text-xs">
                    {midi.length > 0
                      ? midi.map((b) => `${b.controlId} (${b.mode})`).join(', ')
                      : 'no MIDI'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const result = learn.arm(action.id)
                      setLearnActionId(result.ok ? action.id : null)
                      setMessage(
                        result.ok
                          ? `Learn armed for ${action.title}: move a control / press a pad on your MIDI device.`
                          : `Learn refused: ${result.reason}`,
                      )
                    }}
                  >
                    {learnActionId === action.id ? 'Listening…' : 'MIDI learn'}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      <p className="text-xs text-stone-500">
        Focus safety: shortcuts never fire while typing, with a modal open, or on a focused button —
        except STOP ALL (Shift+Esc), which always fires. Keyboard overrides persist per participant
        on this machine; the MIDI map persists per machine and survives restart.
      </p>
    </section>
  )
}
