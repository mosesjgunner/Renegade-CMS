/**
 * POD-15 (POD-REQ-33) — Web MIDI browser adapter (THIN BROWSER ADAPTER).
 *
 * Wires `navigator.requestMIDIAccess` to the pure core in midi.ts:
 * inputs are registered on the device tracker, `midimessage` events
 * are parsed/routed by the core, and `statechange` (hot plug/unplug)
 * only updates the tracker — a disconnect is a non-event by design.
 *
 * UNVERIFIED: no real MIDI device, browser, or `requestMIDIAccess`
 * was exercised in POD-15. This file is typechecked wiring over the
 * tested core; the rig test that would close it (nanoKONTROL-class
 * device: learn a fader + transport, restart, unplug mid-record) is
 * named in the POD-15 handoff.
 */

import { midiCapability, MidiDeviceTracker, type MidiCapability, type MidiMap } from './midi'
import type { StudioActionBus } from './action-map'

type MidiInputLike = {
  id: string
  name?: string | null
  state: string
  onmidimessage: ((event: { data: Uint8Array | null }) => void) | null
}

type MidiAccessLike = {
  inputs: Map<string, MidiInputLike>
  onstatechange: (() => void) | null
}

export type MidiBrowserHandle = {
  capability: MidiCapability
  tracker: MidiDeviceTracker
  dispose(): void
}

/**
 * Connects Web MIDI (when available) to the action bus. When the API
 * is absent the handle reports the honest capability state and does
 * nothing else — progressive enhancement only, never a dead promise.
 */
export async function connectMidiToBus(input: {
  bus: StudioActionBus
  getMap: () => MidiMap
  /** Learn hook: return true when the message was consumed by learn mode; otherwise it routes normally. */
  onLearnMessage?: (bytes: Uint8Array) => boolean
  onDevicesChanged?: () => void
}): Promise<MidiBrowserHandle> {
  const capability = midiCapability(
    typeof navigator !== 'undefined'
      ? (navigator as unknown as { requestMIDIAccess?: unknown })
      : null,
  )
  const tracker = new MidiDeviceTracker()
  if (!capability.supported) return { capability, tracker, dispose: () => {} }

  let access: MidiAccessLike
  try {
    access = (await (
      navigator as unknown as { requestMIDIAccess: () => Promise<MidiAccessLike> }
    ).requestMIDIAccess()) as MidiAccessLike
  } catch {
    return {
      capability: {
        supported: false,
        reason: 'Web MIDI access was refused by the browser or the operating system.',
      },
      tracker,
      dispose: () => {},
    }
  }

  const wireInputs = () => {
    for (const device of access.inputs.values()) {
      if (device.state === 'connected') tracker.connect(device.id, device.name ?? '')
      else tracker.disconnect(device.id)
      device.onmidimessage = (event) => {
        if (!event.data) return
        if (input.onLearnMessage?.(event.data)) return
        const routed = tracker.routeFromDevice(device.id, input.getMap(), event.data)
        if (routed) input.bus.dispatch(routed.actionId, routed.payload)
        // Unbound messages are simply ignored.
      }
    }
    input.onDevicesChanged?.()
  }
  wireInputs()
  access.onstatechange = () => wireInputs()

  return {
    capability,
    tracker,
    dispose: () => {
      access.onstatechange = null
      for (const device of access.inputs.values()) device.onmidimessage = null
    },
  }
}
