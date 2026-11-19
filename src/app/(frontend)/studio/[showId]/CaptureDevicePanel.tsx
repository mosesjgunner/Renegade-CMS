'use client'

/**
 * POD-06 capture device panel for the POD-05 studio workspace.
 *
 * Device pickers per role (mic-in / pfl-out / mix-minus-in / program-out),
 * wired to the pure capture core: enumeration + permission flow via the
 * browser adapter, assignment + diagnosis via DeviceServiceCore, and
 * per-participant persisted prefs (localStorage, keyed by participant —
 * never global). A saved device that is absent is surfaced by name as a
 * fail-closed `device-missing` error; no substitute is ever picked silently.
 *
 * UNVERIFIED in a real browser (POD-06): the panel is typechecked and the
 * core it drives is unit-tested; no microphone/speaker was exercised.
 */
import { useCallback, useEffect, useState } from 'react'

import {
  assertSavedDevicesPresent,
  classifySource,
  DEVICE_ROLES,
  DeviceServiceCore,
  ParticipantDevicePrefsStore,
  roleDeviceKind,
  type CaptureDeviceInfo,
  type DeviceRole,
  type PrefsStorage,
} from '@/modules/podcast-studio/capture/devices'
import {
  browserDeviceSupport,
  probeBrowserCapabilities,
  requestPermissionAndEnumerate,
  watchDeviceChanges,
} from '@/modules/podcast-studio/capture/devices-browser'

const localStoragePrefs = (): PrefsStorage => ({
  get: (key) => window.localStorage.getItem(key),
  set: (key, value) => window.localStorage.setItem(key, value),
  remove: (key) => window.localStorage.removeItem(key),
})

const ROLE_LABELS: Record<DeviceRole, string> = {
  'mic-in': 'Microphone in',
  'pfl-out': 'PFL / cue out',
  'mix-minus-in': 'Mix-minus in',
  'program-out': 'Program out',
}

export function CaptureDevicePanel({ participantId }: { participantId: string }) {
  const [core] = useState(() => new DeviceServiceCore())

  const [devices, setDevices] = useState<CaptureDeviceInfo[]>([])
  const [assignments, setAssignments] = useState<Partial<Record<DeviceRole, string>>>({})
  const [lostRoles, setLostRoles] = useState<DeviceRole[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [notice, setNotice] = useState<string>('')
  const [status, setStatus] = useState<string>('')

  const syncFromCore = useCallback(() => {
    const snapshot = core.snapshot
    setDevices(snapshot.devices)
    setAssignments(snapshot.assignments)
    setLostRoles(snapshot.lostRoles)
  }, [core])

  useEffect(() => {
    const support = browserDeviceSupport()
    if (!support.supported) setStatus(support.detail)
    const capabilities = probeBrowserCapabilities()
    if (capabilities.degradedRoutingNotice && capabilities.notice) setNotice(capabilities.notice)
    const unwatch = watchDeviceChanges(core)
    return unwatch
  }, [core])

  useEffect(() => {
    const interval = window.setInterval(syncFromCore, 1000)
    return () => window.clearInterval(interval)
  }, [syncFromCore])

  const refresh = useCallback(async () => {
    const result = await requestPermissionAndEnumerate(core)
    if (!result.ok) {
      setStatus(
        result.error === 'denied'
          ? 'Microphone permission was denied — devices cannot be named or selected until it is granted.'
          : 'Media capture is unsupported in this browser/context.',
      )
      return
    }
    syncFromCore()
    const store = new ParticipantDevicePrefsStore(localStoragePrefs())
    const prefs = store.load(participantId)
    const gate = assertSavedDevicesPresent(prefs, core.snapshot.devices)
    if (!gate.ok) {
      setMissing(
        gate.errors.map(
          (error) =>
            `${ROLE_LABELS[error.role]}: saved device "${error.savedDeviceLabel}" is not connected. Reconnect it or choose a replacement — capture will not substitute another device.`,
        ),
      )
      if (prefs) {
        for (const role of DEVICE_ROLES) {
          const deviceId = prefs.assignments[role]
          if (deviceId && core.snapshot.devices.some((device) => device.deviceId === deviceId))
            core.assign(role, deviceId)
        }
        syncFromCore()
      }
    } else {
      setMissing([])
      if (prefs) {
        for (const role of DEVICE_ROLES) {
          const deviceId = prefs.assignments[role]
          if (deviceId) core.assign(role, deviceId)
        }
        syncFromCore()
      }
    }
    setStatus('Devices refreshed.')
  }, [core, participantId, syncFromCore])

  const choose = (role: DeviceRole, deviceId: string) => {
    const device = devices.find((candidate) => candidate.deviceId === deviceId)
    if (!device) return
    const result = core.assign(role, deviceId)
    if (!result.ok) {
      setStatus(`Could not assign ${ROLE_LABELS[role]}: ${result.error.code}.`)
      return
    }
    new ParticipantDevicePrefsStore(localStoragePrefs()).saveAssignment(participantId, role, device)
    setMissing((current) => current.filter((line) => !line.startsWith(ROLE_LABELS[role])))
    syncFromCore()
  }

  const micDevice = assignments['mic-in']
    ? devices.find((device) => device.deviceId === assignments['mic-in'])
    : undefined

  return (
    <section className="surface-card p-5 space-y-3" aria-label="Capture devices">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Capture devices</h2>
        <button type="button" className="btn btn-secondary" onClick={() => void refresh()}>
          Enable microphone / refresh devices
        </button>
      </div>
      {notice ? <p className="text-sm text-amber-700">{notice}</p> : null}
      {missing.map((line) => (
        <p key={line} className="text-sm text-red-700">
          {line}
        </p>
      ))}
      {lostRoles.map((role) => (
        <p key={role} className="text-sm text-red-700">
          {ROLE_LABELS[role]} device was unplugged — recording state is diagnosed, not silently
          rerouted. Replug it or choose a replacement.
        </p>
      ))}
      {DEVICE_ROLES.map((role) => (
        <label key={role} className="flex items-center gap-3 text-sm">
          <span className="w-32">{ROLE_LABELS[role]}</span>
          <select
            className="form-input flex-1"
            aria-label={ROLE_LABELS[role]}
            value={assignments[role] ?? ''}
            onChange={(event) => choose(role, event.target.value)}
          >
            <option value="">Not assigned</option>
            {devices
              .filter((device) => device.kind === roleDeviceKind(role))
              .map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Unnamed device (${device.deviceId.slice(0, 8)}…)`}
                </option>
              ))}
          </select>
        </label>
      ))}
      {micDevice ? (
        <p className="text-sm">
          Mic source: {classifySource({ label: micDevice.label }).label}
          {classifySource({ label: micDevice.label }).osExpectation
            ? ` — ${classifySource({ label: micDevice.label }).osExpectation}`
            : ''}
        </p>
      ) : null}
      {status ? <p className="text-sm">{status}</p> : null}
    </section>
  )
}
