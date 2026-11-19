/**
 * POD-06 — Device service CORE (pure TypeScript, no DOM / Web Audio imports).
 *
 * Owns POD-REQ-17's state layer: device enumeration model, permission flow
 * states, per-role assignment (mic-in / pfl-out / mix-minus-in /
 * program-out), unplug/replug diagnosis, capability detection, source
 * classification, and per-participant persisted device preferences with
 * FAIL-CLOSED capture start: when a participant's saved device id is absent
 * from the currently enumerated devices, resolving it returns the structured
 * error `{ code: 'device-missing', savedDeviceLabel }` — capture must never
 * silently fall back to a different microphone.
 *
 * The browser adapter (`devices-browser.ts`) feeds real
 * `navigator.mediaDevices` data into this core; everything here is testable
 * headlessly with plain device lists.
 */

export type CaptureDeviceKind = 'audioinput' | 'audiooutput' | 'videoinput'

export type CaptureDeviceInfo = {
  deviceId: string
  kind: CaptureDeviceKind
  /** Empty until mic/camera permission has been granted (browser privacy rule). */
  label: string
  groupId: string
}

export type DeviceRole = 'mic-in' | 'pfl-out' | 'mix-minus-in' | 'program-out'

export const DEVICE_ROLES: readonly DeviceRole[] = [
  'mic-in',
  'pfl-out',
  'mix-minus-in',
  'program-out',
]

export const roleDeviceKind = (role: DeviceRole): CaptureDeviceKind =>
  role === 'mic-in' || role === 'mix-minus-in' ? 'audioinput' : 'audiooutput'

export type PermissionState = 'unknown' | 'prompt' | 'granted' | 'denied'

export type DeviceEvent =
  | {
      type: 'device-lost'
      role: DeviceRole
      deviceId: string
      label: string
      /** Data-only recovery surface: what the UI may offer, never an action taken silently. */
      recoveryOptions: Array<'replug-same-device' | 'choose-replacement' | 'assign-default-device'>
    }
  | { type: 'device-recovered'; role: DeviceRole; deviceId: string; label: string }
  | { type: 'device-assigned'; role: DeviceRole; deviceId: string }
  | { type: 'devices-changed'; added: string[]; removed: string[] }

export type DeviceAssignmentError = {
  code: 'device-not-found' | 'device-kind-mismatch'
  role: DeviceRole
  deviceId: string
}

export type DeviceServiceSnapshot = {
  permission: PermissionState
  devices: CaptureDeviceInfo[]
  assignments: Partial<Record<DeviceRole, string>>
  /** Roles whose assigned device is currently absent — diagnosed, never silent. */
  lostRoles: DeviceRole[]
}

/**
 * Pure device state machine. The adapter pushes enumerated lists in; the
 * core emits diagnosis events out. No device is ever re-assigned implicitly:
 * an unplugged device's role stays assigned-and-lost until a human (or a
 * replug of the same device) resolves it — no silent dead air, no silent
 * substitution.
 */
export class DeviceServiceCore {
  private permission: PermissionState = 'unknown'
  private devices: CaptureDeviceInfo[] = []
  private assignments = new Map<DeviceRole, string>()
  private lost = new Map<DeviceRole, CaptureDeviceInfo>()
  private events: DeviceEvent[] = []

  setPermission(state: PermissionState): void {
    this.permission = state
  }

  get snapshot(): DeviceServiceSnapshot {
    return {
      permission: this.permission,
      devices: [...this.devices],
      assignments: Object.fromEntries(this.assignments),
      lostRoles: [...this.lost.keys()],
    }
  }

  deviceById(deviceId: string): CaptureDeviceInfo | undefined {
    return this.devices.find((device) => device.deviceId === deviceId)
  }

  assign(
    role: DeviceRole,
    deviceId: string,
  ): { ok: true } | { ok: false; error: DeviceAssignmentError } {
    const device = this.deviceById(deviceId)
    if (!device) return { ok: false, error: { code: 'device-not-found', role, deviceId } }
    if (device.kind !== roleDeviceKind(role))
      return { ok: false, error: { code: 'device-kind-mismatch', role, deviceId } }
    this.assignments.set(role, deviceId)
    this.lost.delete(role)
    this.events.push({ type: 'device-assigned', role, deviceId })
    return { ok: true }
  }

  unassign(role: DeviceRole): void {
    this.assignments.delete(role)
    this.lost.delete(role)
  }

  assignment(role: DeviceRole): string | undefined {
    return this.assignments.get(role)
  }

  isLost(role: DeviceRole): boolean {
    return this.lost.has(role)
  }

  /**
   * Feeds a fresh enumeration (initial list or a `devicechange`). Assigned
   * devices that vanished produce `device-lost` with the affected role and
   * recovery options; a lost device that reappears produces
   * `device-recovered` and keeps its original assignment.
   */
  setDevices(next: CaptureDeviceInfo[]): void {
    const previousIds = new Set(this.devices.map((device) => device.deviceId))
    const nextIds = new Set(next.map((device) => device.deviceId))
    const added = [...nextIds].filter((id) => !previousIds.has(id))
    const removed = [...previousIds].filter((id) => !nextIds.has(id))
    const previousById = new Map(this.devices.map((device) => [device.deviceId, device]))
    this.devices = [...next]
    if (added.length > 0 || removed.length > 0)
      this.events.push({ type: 'devices-changed', added, removed })

    for (const [role, deviceId] of this.assignments) {
      if (!nextIds.has(deviceId) && !this.lost.has(role)) {
        const known = previousById.get(deviceId)
        const lostDevice: CaptureDeviceInfo = known ?? {
          deviceId,
          kind: roleDeviceKind(role),
          label: '',
          groupId: '',
        }
        this.lost.set(role, lostDevice)
        this.events.push({
          type: 'device-lost',
          role,
          deviceId,
          label: lostDevice.label,
          recoveryOptions: ['replug-same-device', 'choose-replacement', 'assign-default-device'],
        })
      } else if (nextIds.has(deviceId) && this.lost.has(role)) {
        const recovered = this.lost.get(role)!
        this.lost.delete(role)
        this.events.push({ type: 'device-recovered', role, deviceId, label: recovered.label })
      }
    }
  }

  drainEvents(): DeviceEvent[] {
    const drained = this.events
    this.events = []
    return drained
  }
}

// ---------------------------------------------------------------------------
// Capability detection (tech-research §1.3: output routing is the sharpest
// browser split — capability-detect, never fake a picker Safari cannot honour)
// ---------------------------------------------------------------------------

export type BrowserFamily = 'chromium' | 'firefox' | 'safari' | 'other'

export type CapabilityProbe = {
  family: BrowserFamily
  /** `HTMLMediaElement.prototype.setSinkId` present. */
  elementSetSinkId: boolean
  /** `AudioContext.prototype.setSinkId` present (Chromium 110+). */
  contextSetSinkId: boolean
  /** `navigator.mediaDevices.selectAudioOutput` present (Firefox path). */
  selectAudioOutput: boolean
  audioWorklet: boolean
  opfs: boolean
}

export type CapabilityReport = {
  /** full = Web Audio output picker; element-only = per-element picker; system-only = OS setting. */
  outputRouting: 'full' | 'element-only' | 'system-only'
  /** True when the UI must show the degraded-routing notice (Safari rule). */
  degradedRoutingNotice: boolean
  notice?: string
  audioWorklet: boolean
  opfs: boolean
}

export const detectCapabilities = (probe: CapabilityProbe): CapabilityReport => {
  const outputRouting: CapabilityReport['outputRouting'] = probe.contextSetSinkId
    ? 'full'
    : probe.elementSetSinkId || probe.selectAudioOutput
      ? 'element-only'
      : 'system-only'
  const degraded = outputRouting !== 'full'
  return {
    outputRouting,
    degradedRoutingNotice: degraded,
    notice: degraded
      ? outputRouting === 'system-only'
        ? 'Output device routing follows your system sound setting in this browser (no per-device output picker — Safari exposes no setSinkId). Choose the output device in the OS sound settings.'
        : 'Output routing is limited in this browser: media elements can be routed per device, but the studio program bus follows the system output.'
      : undefined,
    audioWorklet: probe.audioWorklet,
    opfs: probe.opfs,
  }
}

// ---------------------------------------------------------------------------
// Source classification — honest labels, never a guessed "microphone"
// ---------------------------------------------------------------------------

export type SourceKind = 'mic' | 'line-in' | 'media-file' | 'system-loopback'

export type SourceClassification = {
  kind: SourceKind
  label: string
  /** Present only for system-loopback: capture support is OS-dependent. */
  osExpectation?: string
}

export const LOOPBACK_OS_EXPECTATIONS =
  'System loopback is OS-dependent: Windows exposes WASAPI loopback / "Stereo Mix" on some drivers; macOS has no built-in loopback (a virtual device such as a loopback driver is required); Linux exposes PulseAudio/PipeWire monitor sources. The browser only ever sees the resulting audio device.'

/** Classifies a capture source from its device label / explicit file origin. */
export const classifySource = (input: {
  label?: string
  fromFile?: boolean
}): SourceClassification => {
  if (input.fromFile) return { kind: 'media-file', label: 'Media file' }
  const label = (input.label ?? '').toLowerCase()
  if (
    label.includes('loopback') ||
    label.includes('stereo mix') ||
    label.includes('what u hear') ||
    label.includes('monitor of') ||
    label.includes('system audio')
  )
    return {
      kind: 'system-loopback',
      label: 'System loopback',
      osExpectation: LOOPBACK_OS_EXPECTATIONS,
    }
  if (label.includes('line-in') || label.includes('line in') || /\bline\b/.test(label))
    return { kind: 'line-in', label: 'Line input' }
  return { kind: 'mic', label: 'Microphone' }
}

// ---------------------------------------------------------------------------
// Per-participant device preferences — persisted keyed by participant,
// NEVER global. Fail-closed resolution (see the module header).
// ---------------------------------------------------------------------------

export type ParticipantDevicePrefs = {
  participantId: string
  assignments: Partial<Record<DeviceRole, string>>
  /** Label captured when the device was saved, so a missing device can be named. */
  deviceLabels: Record<string, string>
  updatedAt: string
}

export interface PrefsStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

/** In-memory PrefsStorage for tests and non-browser hosts. */
export class MemoryPrefsStorage implements PrefsStorage {
  private map = new Map<string, string>()
  get(key: string): string | null {
    return this.map.get(key) ?? null
  }
  set(key: string, value: string): void {
    this.map.set(key, value)
  }
  remove(key: string): void {
    this.map.delete(key)
  }
}

export const devicePrefsKey = (participantId: string): string =>
  `podcast-studio:device-prefs:${participantId}`

export class ParticipantDevicePrefsStore {
  constructor(private readonly storage: PrefsStorage) {}

  load(participantId: string): ParticipantDevicePrefs | null {
    const raw = this.storage.get(devicePrefsKey(participantId))
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as ParticipantDevicePrefs
      if (parsed.participantId !== participantId) return null
      return parsed
    } catch {
      return null
    }
  }

  save(prefs: ParticipantDevicePrefs): void {
    this.storage.set(
      devicePrefsKey(prefs.participantId),
      JSON.stringify({ ...prefs, updatedAt: new Date().toISOString() }),
    )
  }

  saveAssignment(
    participantId: string,
    role: DeviceRole,
    device: CaptureDeviceInfo,
  ): ParticipantDevicePrefs {
    const existing = this.load(participantId) ?? {
      participantId,
      assignments: {},
      deviceLabels: {},
      updatedAt: '',
    }
    existing.assignments[role] = device.deviceId
    if (device.label) existing.deviceLabels[device.deviceId] = device.label
    this.save(existing)
    return this.load(participantId)!
  }

  clear(participantId: string): void {
    this.storage.remove(devicePrefsKey(participantId))
  }
}

export type DeviceMissingError = {
  code: 'device-missing'
  role: DeviceRole
  savedDeviceId: string
  savedDeviceLabel: string
}

export type ResolveSavedDeviceResult =
  | { ok: true; deviceId: string | null }
  | { ok: false; error: DeviceMissingError }

/**
 * Resolves one role's saved device against the currently enumerated list.
 * No saved preference → `{ ok: true, deviceId: null }` (unassigned is a
 * choice). Saved but absent → FAIL-CLOSED structured error naming the saved
 * device; a different device is never substituted.
 */
export const resolveSavedDevice = (
  prefs: ParticipantDevicePrefs | null,
  role: DeviceRole,
  available: CaptureDeviceInfo[],
): ResolveSavedDeviceResult => {
  const savedDeviceId = prefs?.assignments[role]
  if (!savedDeviceId) return { ok: true, deviceId: null }
  if (available.some((device) => device.deviceId === savedDeviceId))
    return { ok: true, deviceId: savedDeviceId }
  return {
    ok: false,
    error: {
      code: 'device-missing',
      role,
      savedDeviceId,
      savedDeviceLabel: prefs?.deviceLabels[savedDeviceId] ?? savedDeviceId,
    },
  }
}

/** Every saved role checked at once — the capture-start gate. */
export const assertSavedDevicesPresent = (
  prefs: ParticipantDevicePrefs | null,
  available: CaptureDeviceInfo[],
): { ok: true } | { ok: false; errors: DeviceMissingError[] } => {
  if (!prefs) return { ok: true }
  const errors: DeviceMissingError[] = []
  for (const role of DEVICE_ROLES) {
    const result = resolveSavedDevice(prefs, role, available)
    if (!result.ok) errors.push(result.error)
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true }
}
